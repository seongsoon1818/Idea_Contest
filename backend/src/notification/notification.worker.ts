import { randomUUID } from "node:crypto";
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { lockAccount } from "../auth/session-access.js";
import { activeSubscriptions, revokePush } from "./settings.js";
import { PushTransport } from "./push.js";
import { destination } from "./inbox.service.js";
import { reconcileTarget, targetOf } from "./reconcile.js";

const batchSize = 40,
  leaseMs = 120_000,
  maxAttempts = 5;
const release = { lockToken: null, lockedUntil: null };
const txOptions = { isolationLevel: "ReadCommitted" } as const;
function dueReminder(now: Date): Prisma.DeadlineReminderWhereInput {
  return {
    OR: [
      { status: "PENDING", nextAttemptAt: { lte: now } },
      { status: "PROCESSING", lockedUntil: { lte: now } },
    ],
  };
}
function duePush(now: Date): Prisma.NotificationPushDeliveryWhereInput {
  return {
    OR: [
      {
        status: { in: ["PENDING", "RETRY_WAIT"] },
        nextAttemptAt: { lte: now },
      },
      { status: "PROCESSING", lockedUntil: { lte: now } },
    ],
  };
}
function lease() {
  return {
    status: "PROCESSING" as const,
    lockToken: randomUUID(),
    lockedUntil: new Date(Date.now() + leaseMs),
    attemptCount: { increment: 1 },
  };
}
function holder(id: bigint, token: string) {
  return {
    id,
    status: "PROCESSING" as const,
    lockToken: token,
    lockedUntil: { gt: new Date() },
  };
}
function retryTime(attempt: number, retryAfter?: string) {
  const seconds =
    retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 0;
  const retryAt = seconds
    ? Date.now() + seconds * 1000
    : Date.parse(retryAfter ?? "");
  return new Date(
    Math.min(
      253402300799999,
      Math.max(
        retryAt || 0,
        Date.now() + 15_000 * 2 ** (attempt - 1) + Math.random() * 5000,
      ),
    ),
  );
}
@Injectable()
export class NotificationWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly log = new Logger(NotificationWorker.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = false;
  private readonly cursors = {
    notice: { userId: 0n, id: 0n },
    program: { userId: 0n, id: 0n },
  };
  constructor(
    private readonly db: PrismaService,
    private readonly transport: PushTransport,
  ) {}
  onApplicationBootstrap() {
    if (process.env.NODE_ENV !== "test") this.schedule(0);
  }
  private schedule(ms: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.tick()
        .catch(() => this.log.error("알림 작업을 완료하지 못했습니다."))
        .finally(() => this.schedule(15_000));
    }, ms);
    this.timer.unref();
  }
  async onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }
  async tick() {
    // Progress past a bad row. Its claim has a finite lease and bounded retries.
    const attempt = async (run: () => Promise<void>) => {
      try {
        await run();
      } catch {
        this.log.error("알림 작업 한 건을 처리하지 못했습니다.");
      }
    };
    for (const r of await this.db.deadlineReminder.findMany({
      where: dueReminder(new Date()),
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: { id: true },
    }))
      await attempt(() => this.deliverReminder(r.id));
    for (const p of await this.db.notificationPushDelivery.findMany({
      where: duePush(new Date()),
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: { id: true },
    }))
      await attempt(() => this.deliverPush(p.id));
    for (const kind of ["notice", "program"] as const) {
      // Include previously notified targets even after removal, so stale inbox items can be invalidated.
      const pos = this.cursors[kind];
      const table =
        kind === "notice"
          ? Prisma.sql`user_notice_bookmarks`
          : Prisma.sql`user_program_bookmarks`;
      const col =
        kind === "notice" ? Prisma.sql`notice_id` : Prisma.sql`program_id`;
      const targets = await this.db.$queryRaw<
        { userId: bigint; id: bigint }[]
      >(Prisma.sql`
        SELECT user_id AS userId,id FROM (
          SELECT user_id,${col} AS id FROM ${table} WHERE deadline_reminder_enabled=1
          UNION SELECT user_id,${col} AS id FROM deadline_reminders WHERE ${col} IS NOT NULL AND status IN ('PENDING','PROCESSING','COMPLETED')
        ) targets WHERE user_id>${pos.userId} OR (user_id=${pos.userId} AND id>${pos.id})
        ORDER BY user_id,id LIMIT ${batchSize}`);
      for (const t of targets)
        await attempt(async () => {
          await this.db.$transaction(
            (tx) => reconcileTarget(tx, { kind, ...t }),
            txOptions,
          );
        });
      this.cursors[kind] =
        targets.length === batchSize
          ? targets[targets.length - 1]!
          : { userId: 0n, id: 0n };
    }
  }
  async deliverReminder(id: bigint) {
    const claim = lease(),
      due = { id, ...dueReminder(new Date()) };
    await this.db.deadlineReminder.updateMany({
      where: { ...due, deliverBefore: { lte: new Date() } },
      data: { status: "EXPIRED", ...release },
    });
    await this.db.deadlineReminder.updateMany({
      where: { ...due, attemptCount: { gte: maxAttempts } },
      data: { status: "FAILED", lastError: "ATTEMPTS_EXHAUSTED", ...release },
    });
    if (
      !(
        await this.db.deadlineReminder.updateMany({
          where: { ...due, attemptCount: { lt: maxAttempts } },
          data: claim,
        })
      ).count
    )
      return;
    const job = await this.db.deadlineReminder.findUnique({ where: { id } });
    if (!job) return;
    try {
      await this.db.$transaction(async (tx) => {
        const target = targetOf(job);
        const current = await reconcileTarget(tx, target);
        const owned = holder(id, claim.lockToken);
        if (
          !(await tx.deadlineReminder.findFirst({
            where: owned,
            select: { id: true },
          }))
        )
          return;
        const now = new Date();
        if (now >= job.deliverBefore) {
          await tx.deadlineReminder.updateMany({
            where: owned,
            data: { status: "EXPIRED", ...release },
          });
          return;
        }
        const settings = await tx.userNotificationSettings.findUnique({
          where: { userId: job.userId },
        });
        const subs =
          settings?.deadlinePushEnabled && this.transport.config().enabled
            ? await tx.webPushSubscription.findMany({
                where: activeSubscriptions(job.userId, now),
                select: { id: true },
              })
            : [];
        if (
          !current?.plan.candidates.has(job.dedupKey) ||
          !current.plan.channel ||
          (!settings?.deadlineInAppEnabled && !subs.length)
        ) {
          await tx.deadlineReminder.updateMany({
            where: owned,
            data: {
              status: "CANCELLED",
              cancelledAt: now,
              cancelReason: "NO_DELIVERY_CHANNEL",
              ...release,
            },
          });
          return;
        }
        // The state transition, inbox and per-device outbox commit together.
        if (
          !(
            await tx.deadlineReminder.updateMany({
              where: {
                ...holder(id, claim.lockToken),
                deliverBefore: { gt: now },
              },
              data: { status: "COMPLETED", completedAt: now, ...release },
            })
          ).count
        )
          return;
        const item = await tx.notification.create({
          data: {
            userId: job.userId,
            reminderId: id,
            title:
              target.kind === "notice"
                ? "저장한 공지의 신청 마감이 다가옵니다"
                : "저장한 프로그램의 신청 마감이 다가옵니다",
            body:
              job.deadlinePrecision === "date"
                ? "신청 마감이 내일입니다. 정확한 마감 시각은 원문에서 확인해 주세요."
                : "신청 마감까지 하루 남았습니다. 원문에서 일정을 확인해 주세요.",
            inAppVisible: !!settings?.deadlineInAppEnabled,
          },
        });
        if (subs.length)
          await tx.notificationPushDelivery.createMany({
            data: subs.map((s) => ({
              userId: job.userId,
              notificationId: item.id,
              subscriptionId: s.id,
              nextAttemptAt: now,
            })),
          });
      }, txOptions);
    } catch {
      const next = retryTime(job.attemptCount);
      await this.db.deadlineReminder.updateMany({
        where: holder(id, claim.lockToken),
        data: {
          status:
            next >= job.deliverBefore
              ? "EXPIRED"
              : job.attemptCount >= maxAttempts
                ? "FAILED"
                : "PENDING",
          nextAttemptAt: next,
          lastError: "REMINDER_PROCESSING_FAILED",
          ...release,
        },
      });
    }
  }
  private async preparePush(id: bigint, token: string) {
    return this.db.$transaction(async (tx) => {
      const job = await tx.notificationPushDelivery.findFirst({
        where: holder(id, token),
        include: { notification: { include: { reminder: true } } },
      });
      if (!job) return null;
      const n = job.notification,
        r = n.reminder,
        target = targetOf(r);
      const current = await reconcileTarget(tx, target),
        now = new Date();
      const owned = holder(id, token);
      if (
        !(await tx.notificationPushDelivery.findFirst({
          where: owned,
          select: { id: true },
        }))
      )
        return null;
      if (now >= r.deliverBefore) {
        await tx.notificationPushDelivery.updateMany({
          where: owned,
          data: { status: "EXPIRED", ...release },
        });
        return null;
      }
      const settings = await tx.userNotificationSettings.findUnique({
        where: { userId: job.userId },
      });
      const sub = await tx.webPushSubscription.findFirst({
        where: {
          ...activeSubscriptions(job.userId, now),
          id: job.subscriptionId,
        },
      });
      if (
        !sub ||
        !settings?.deadlinePushEnabled ||
        !this.transport.config().enabled ||
        !current?.plan.candidates.has(r.dedupKey) ||
        n.invalidatedAt ||
        r.status !== "COMPLETED"
      ) {
        await tx.notificationPushDelivery.updateMany({
          where: owned,
          data: {
            status: "CANCELLED",
            lastErrorCode: "INACTIVE_TARGET",
            ...release,
          },
        });
        return null;
      }
      return {
        userId: job.userId,
        subscriptionId: sub.id,
        deliverBefore: r.deliverBefore,
        attempt: job.attemptCount,
        sub: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload: JSON.stringify({
          notificationId: String(n.id),
          type: "APPLICATION_DEADLINE_D1",
          inAppVisible: n.inAppVisible,
          title: n.title,
          body: n.body,
          ...destination(target.kind, current.publicId),
          expiresAt: r.deliverBefore.toISOString(),
        }),
      };
    }, txOptions);
  }
  async deliverPush(id: bigint) {
    const claim = lease(),
      due = { id, ...duePush(new Date()) };
    await this.db.notificationPushDelivery.updateMany({
      where: {
        ...due,
        notification: { reminder: { deliverBefore: { lte: new Date() } } },
      },
      data: { status: "EXPIRED", ...release },
    });
    await this.db.notificationPushDelivery.updateMany({
      where: { ...due, attemptCount: { gte: maxAttempts } },
      data: {
        status: "FAILED",
        lastErrorCode: "ATTEMPTS_EXHAUSTED",
        ...release,
      },
    });
    if (
      !(
        await this.db.notificationPushDelivery.updateMany({
          where: { ...due, attemptCount: { lt: maxAttempts } },
          data: claim,
        })
      ).count
    )
      return;
    // A crash before preparation is retried after the lease. Never send inside a DB transaction.
    const job = await this.preparePush(id, claim.lockToken);
    if (!job) return;
    const ttl = Math.floor((job.deliverBefore.getTime() - Date.now()) / 1000);
    if (ttl < 1) {
      await this.db.notificationPushDelivery.updateMany({
        where: holder(id, claim.lockToken),
        data: { status: "EXPIRED", ...release },
      });
      return;
    }
    let status: number | null = null,
      retryAfter: string | undefined;
    try {
      status = (await this.transport.send(job.sub, job.payload, ttl))
        .statusCode;
    } catch (error) {
      const e = error as {
        statusCode?: number;
        headers?: Record<string, string>;
      };
      status = e.statusCode ?? null;
      retryAfter = e.headers?.["retry-after"];
    }
    await this.db.$transaction(async (tx) => {
      await lockAccount(tx, job.userId);
      const next = retryTime(job.attempt, retryAfter);
      const accepted = status !== null && status >= 200 && status < 300;
      const transient =
        status === null || status === 408 || status === 429 || status >= 500;
      const result = accepted
        ? "ACCEPTED"
        : !transient
          ? "FAILED"
          : next >= job.deliverBefore
            ? "EXPIRED"
            : job.attempt >= maxAttempts
              ? "FAILED"
              : "RETRY_WAIT";
      const { count } = await tx.notificationPushDelivery.updateMany({
        where: holder(id, claim.lockToken),
        data: {
          status: result,
          acceptedAt: accepted ? new Date() : null,
          nextAttemptAt: next,
          lastHttpStatus: status,
          lastErrorCode: accepted
            ? null
            : status
              ? "HTTP_" + status
              : "NETWORK_ERROR",
          ...release,
        },
      });
      if (count && (status === 404 || status === 410))
        await revokePush(tx, job.userId, "PROVIDER_GONE", job.subscriptionId);
    }, txOptions);
  }
}
