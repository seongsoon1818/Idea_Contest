import { Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { ApiError, invalid } from "../common/errors.js";
import { idInput, enumInput, objectInput } from "../common/input.js";
import type { Principal } from "../common/http.js";
import { lockViewer } from "../auth/session-access.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { notificationPage } from "./page.js";

const missing = () =>
  new ApiError(404, "RESOURCE_NOT_FOUND", "내 알림을 찾을 수 없습니다.");
const inbox = (userId: bigint) => ({
  userId,
  inAppVisible: true,
  hiddenAt: null,
});
const select = {
  id: true,
  title: true,
  body: true,
  createdAt: true,
  readAt: true,
  invalidatedAt: true,
  reminder: {
    select: {
      deadlinePrecision: true,
      deadlineDate: true,
      deadlineAt: true,
      scheduledAt: true,
      noticeSummary: {
        select: {
          revision: {
            select: {
              notice: {
                select: {
                  publicId: true,
                  visibility: true,
                  currentRevisionId: true,
                },
              },
            },
          },
        },
      },
      programRevision: {
        select: {
          program: {
            select: {
              publicId: true,
              visibility: true,
              currentRevision: { select: { validationStatus: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.NotificationSelect;
export function destination(type: "program" | "notice", id: string) {
  return {
    contentRef: { type, id },
    navigation: {
      screen: type === "program" ? "programs" : "notices",
      contentId: id,
    },
  };
}
function view(n: Prisma.NotificationGetPayload<{ select: typeof select }>) {
  const r = n.reminder,
    notice = r.noticeSummary?.revision.notice,
    program = r.programRevision?.program;
  const available = notice
    ? notice.visibility === "PUBLIC" && notice.currentRevisionId !== null
    : program?.visibility === "PUBLIC" &&
      program.currentRevision?.validationStatus === "VALID";
  const value =
    r.deadlinePrecision === "date"
      ? r.deadlineDate!.toISOString().slice(0, 10)
      : r.deadlineAt!.toISOString();
  return {
    id: String(n.id),
    type: "APPLICATION_DEADLINE_D1",
    title: available ? n.title : "내용을 확인할 수 없음",
    body: available ? n.body : "현재 공개되지 않은 콘텐츠입니다.",
    ...destination(
      notice ? "notice" : "program",
      (notice ?? program)!.publicId,
    ),
    deadline: { rawText: value, precision: r.deadlinePrecision, value },
    scheduledAt: r.scheduledAt,
    createdAt: n.createdAt,
    readAt: n.readAt,
    invalidatedAt: n.invalidatedAt,
    availability: available ? "AVAILABLE" : "UNAVAILABLE",
  };
}
@Injectable()
export class InboxService {
  constructor(private readonly db: PrismaService) {}
  list(userId: bigint, q: Record<string, string>) {
    const unread =
      enumInput(q.unreadOnly ?? "false", ["true", "false"], "unreadOnly") ===
      "true";
    const include =
      enumInput(
        q.includeInvalidated ?? "true",
        ["true", "false"],
        "includeInvalidated",
      ) === "true";
    const where = {
      ...inbox(userId),
      ...(unread ? { readAt: null } : {}),
      ...(unread || !include ? { invalidatedAt: null } : {}),
    };
    return this.db.$transaction(
      (tx) =>
        notificationPage(
          q,
          () => tx.notification.count({ where }),
          async (skip, take) =>
            (
              await tx.notification.findMany({
                where,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                select,
                skip,
                take,
              })
            ).map(view),
        ),
      { isolationLevel: "RepeatableRead" },
    );
  }
  async unread(userId: bigint) {
    return {
      count: await this.db.notification.count({
        where: { ...inbox(userId), readAt: null, invalidatedAt: null },
      }),
    };
  }
  read(viewer: Principal, rawId: string, raw: unknown) {
    const id = idInput(rawId, "notificationId");
    if (objectInput(raw, ["read"]).read !== true)
      invalid("read", "true가 필요합니다.");
    return this.db.$transaction(async (tx) => {
      await lockViewer(tx, viewer);
      const where = { ...inbox(viewer.userId), id };
      await tx.notification.updateMany({
        where: { ...where, readAt: null },
        data: { readAt: new Date() },
      });
      const n = await tx.notification.findFirst({
        where,
        select: { readAt: true },
      });
      if (!n) throw missing();
      return { id: rawId, readAt: n.readAt };
    });
  }
  readAll(viewer: Principal, raw: unknown) {
    const { throughCreatedAt: t } = objectInput(raw, ["throughCreatedAt"]);
    if (
      typeof t !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(t) ||
      !Number.isFinite(Date.parse(t)) ||
      new Date(t).toISOString() !== t ||
      Date.parse(t) > Date.now()
    )
      invalid("throughCreatedAt", "현재까지의 UTC ISO 시각이 필요합니다.");
    return this.db.$transaction(async (tx) => {
      await lockViewer(tx, viewer);
      const readAt = new Date(),
        throughCreatedAt = new Date(t);
      const { count } = await tx.notification.updateMany({
        where: {
          ...inbox(viewer.userId),
          createdAt: { lte: throughCreatedAt },
          readAt: null,
        },
        data: { readAt },
      });
      return { updatedCount: count, readAt, throughCreatedAt };
    });
  }
  hide(viewer: Principal, rawId: string) {
    const id = idInput(rawId, "notificationId");
    return this.db.$transaction(async (tx) => {
      await lockViewer(tx, viewer);
      const where = { id, userId: viewer.userId, inAppVisible: true };
      if (!(await tx.notification.findFirst({ where, select: { id: true } })))
        throw missing();
      await tx.notification.updateMany({
        where: { ...where, hiddenAt: null },
        data: { hiddenAt: new Date() },
      });
      return { id: rawId, hidden: true };
    });
  }
}
