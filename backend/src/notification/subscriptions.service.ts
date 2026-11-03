import { Injectable } from "@nestjs/common";
import { ApiError } from "../common/errors.js";
import { idInput } from "../common/input.js";
import type { Principal } from "../common/http.js";
import { lockViewer } from "../auth/session-access.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PushTransport, subscriptionInput } from "./push.js";
import {
  activeSubscriptions,
  revokePush,
  stopWithoutChannel,
  stopPush,
} from "./settings.js";
import { notificationPage } from "./page.js";

const select = {
  id: true,
  deviceLabel: true,
  expirationAt: true,
  revokedAt: true,
  lastSeenAt: true,
  createdAt: true,
} as const;
function view<T extends { id: bigint }>(row: T) {
  return { ...row, id: String(row.id) };
}
const conflict = () =>
  new ApiError(
    409,
    "PUSH_SUBSCRIPTION_CONFLICT",
    "브라우저에서 새 구독을 만들어 주세요.",
  );
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly db: PrismaService,
    private readonly transport: PushTransport,
  ) {}
  list(userId: bigint, q: Record<string, string>) {
    const where = activeSubscriptions(userId, new Date());
    return this.db.$transaction(
      (tx) =>
        notificationPage(
          q,
          () => tx.webPushSubscription.count({ where }),
          async (skip, take) =>
            (
              await tx.webPushSubscription.findMany({
                where,
                select,
                orderBy: [{ lastSeenAt: "desc" }, { id: "asc" }],
                skip,
                take,
              })
            ).map(view),
        ),
      { isolationLevel: "RepeatableRead" },
    );
  }
  async register(viewer: Principal, raw: unknown) {
    if (!this.transport.config().enabled)
      throw new ApiError(
        503,
        "SERVICE_UNAVAILABLE",
        "웹 푸시가 비활성화되어 있습니다.",
      );
    const data = subscriptionInput(raw);
    try {
      return await this.db.$transaction(
        async (tx) => {
          await lockViewer(tx, viewer);
          const userId = viewer.userId,
            now = new Date();
          const old = await tx.webPushSubscription.findUnique({
            where: { endpointHash: data.endpointHash },
            select: {
              id: true,
              userId: true,
              p256dh: true,
              auth: true,
              expirationAt: true,
            },
          });
          if (old && old.userId !== userId) throw conflict();
          // An expired last subscription must not resurrect an overdue reservation.
          await stopWithoutChannel(tx, userId, now);
          if (
            old &&
            (old.p256dh !== data.p256dh ||
              old.auth !== data.auth ||
              (old.expirationAt && old.expirationAt <= now))
          )
            await stopPush(tx, userId, "SUBSCRIPTION_REPLACED", old.id);
          const row = old
            ? await tx.webPushSubscription.update({
                where: { id: old.id },
                data: {
                  ...data,
                  lastSeenAt: now,
                  revokedAt: null,
                  revokeReason: null,
                },
                select,
              })
            : await tx.webPushSubscription.create({
                data: { ...data, lastSeenAt: now, userId },
                select,
              });
          return { created: !old, subscription: view(row) };
        },
        { isolationLevel: "ReadCommitted" },
      );
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw conflict();
      throw e;
    }
  }
  revoke(viewer: Principal, rawId: string) {
    const id = idInput(rawId, "subscriptionId");
    return this.db.$transaction(async (tx) => {
      await lockViewer(tx, viewer);
      if (
        !(await tx.webPushSubscription.findFirst({
          where: { id, userId: viewer.userId },
          select: { id: true },
        }))
      )
        throw new ApiError(
          404,
          "RESOURCE_NOT_FOUND",
          "내 구독을 찾을 수 없습니다.",
        );
      await revokePush(tx, viewer.userId, "USER_REVOKED", id);
      return { id: rawId, revoked: true };
    });
  }
}
