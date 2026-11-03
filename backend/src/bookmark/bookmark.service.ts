import { Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { lockViewer } from "../auth/session-access.js";
import { ApiError, invalid } from "../common/errors.js";
import type { Principal } from "../common/http.js";
import { objectInput } from "../common/input.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { contentQuery } from "../content/content.query.js";
import { listProfile, pageResponse } from "../content/content.page.js";
import { noticeCards } from "../notice/notice.cards.js";
import { readIndex } from "../notice/notice.index.js";
import { programCards } from "../program/program.cards.js";
import { readProgramIndex } from "../program/program.index.js";
import {
  loadPlans,
  reminderHistory,
  preview,
  reminderPreview,
  type Kind,
} from "./deadline-plans.js";
import {
  cancelBookmarkReminders,
  reconcileReminders,
} from "./deadline-reminders.js";

type Action = "save" | "remove" | "setting";
const missing = () =>
  new ApiError(
    404,
    "RESOURCE_NOT_FOUND",
    "저장할 수 있는 콘텐츠 또는 내 북마크를 찾을 수 없습니다.",
  );
const categoryKey = (kind: Kind) =>
  kind === "notice" ? "noticeCategory" : "programCategory";
function reminderInput(body: unknown) {
  const { deadlineReminderEnabled: v } = objectInput(body, [
    "deadlineReminderEnabled",
  ]);
  if (typeof v !== "boolean")
    invalid("deadlineReminderEnabled", "true 또는 false가 필요합니다.");
  return v;
}
async function writeSaved(
  tx: Prisma.TransactionClient,
  kind: Kind,
  userId: bigint,
  id: bigint,
  enabled: boolean | undefined,
) {
  const select = { createdAt: true, deadlineReminderEnabled: true };
  if (kind === "notice") {
    const key = { userId, noticeId: id },
      where = { userId_noticeId: key };
    if (enabled === undefined)
      return tx.userNoticeBookmark.upsert({
        where,
        create: key,
        update: {},
        select,
      });
    if (
      !(
        await tx.userNoticeBookmark.updateMany({
          where: key,
          data: { deadlineReminderEnabled: enabled },
        })
      ).count
    )
      throw missing();
    return tx.userNoticeBookmark.findUniqueOrThrow({ where, select });
  }
  const key = { userId, programId: id },
    where = { userId_programId: key };
  if (enabled === undefined)
    return tx.userProgramBookmark.upsert({
      where,
      create: key,
      update: {},
      select,
    });
  if (
    !(
      await tx.userProgramBookmark.updateMany({
        where: key,
        data: { deadlineReminderEnabled: enabled },
      })
    ).count
  )
    throw missing();
  return tx.userProgramBookmark.findUniqueOrThrow({ where, select });
}
@Injectable()
export class BookmarkService {
  constructor(private readonly db: PrismaService) {}
  list(kind: Kind, params: Record<string, string>, userId: bigint) {
    const q = contentQuery(params, categoryKey(kind), true);
    return this.db.$transaction(
      async (tx) => {
        const now = new Date(),
          profile = await listProfile(tx, q, kind, userId);
        const index = kind === "notice" ? readIndex : readProgramIndex;
        const { rows, total } = await index(
          tx,
          q,
          profile,
          now,
          undefined,
          userId,
        );
        const available = rows.filter((r) => !Number(r.unavailable));
        const cards =
          kind === "notice"
            ? await noticeCards(tx, available, userId, !!profile)
            : await programCards(tx, available, userId, !!profile);
        const byId = new Map(cards.map((c) => [c.id, c] as const));
        const plans = await loadPlans(tx, kind, userId, rows, now);
        const items = rows.map((r) => {
          const enabled = !!Number(r.reminder_enabled);
          return {
            contentRef: { type: kind, id: r.public_id },
            availability: Number(r.unavailable) ? "UNAVAILABLE" : "AVAILABLE",
            content: byId.get(r.public_id) ?? null,
            savedAt: r.saved_at,
            deadlineReminderEnabled: enabled,
            reminder: reminderPreview(
              plans.get(r.id)!,
              enabled,
              r.ready_id,
              now,
            ),
          };
        });
        const savedTotal =
          kind === "notice"
            ? await tx.userNoticeBookmark.count({ where: { userId } })
            : await tx.userProgramBookmark.count({ where: { userId } });
        return { ...pageResponse(items, total, q, !!profile, now), savedTotal };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  change(
    kind: Kind,
    publicId: string,
    viewer: Principal,
    action: Action,
    body?: unknown,
  ) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(publicId))
      invalid(kind + "Id", "콘텐츠 publicId 형식이 잘못되었습니다.");
    const enabled = action === "setting" ? reminderInput(body) : undefined;
    const contentRef = { type: kind, id: publicId },
      userId = viewer.userId;
    return this.db.$transaction(
      async (tx) => {
        await lockViewer(tx, viewer);
        const [entity] = await tx.$queryRaw<{ id: bigint }[]>(
          kind === "notice"
            ? Prisma.sql`SELECT id FROM notices WHERE public_id=${publicId} FOR UPDATE`
            : Prisma.sql`SELECT id FROM programs WHERE public_id=${publicId} FOR UPDATE`,
        );
        const now = new Date();
        if (action === "remove") {
          if (entity) {
            if (kind === "notice")
              await tx.userNoticeBookmark.deleteMany({
                where: { userId, noticeId: entity.id },
              });
            else
              await tx.userProgramBookmark.deleteMany({
                where: { userId, programId: entity.id },
              });
            await cancelBookmarkReminders(
              tx,
              kind,
              userId,
              entity.id,
              now,
              "BOOKMARK_REMOVED",
            );
          }
          return {
            contentRef,
            saved: false,
            savedAt: null,
            deadlineReminderEnabled: null,
            reminder: preview("NONE"),
          };
        }
        if (!entity) throw missing();
        const index = kind === "notice" ? readIndex : readProgramIndex;
        const row = (
          await index(
            tx,
            contentQuery({ status: "all" }, categoryKey(kind)),
            null,
            now,
            publicId,
          )
        ).rows[0];
        if (action === "save" && !row) throw missing();
        const saved = await writeSaved(tx, kind, userId, entity.id, enabled);
        let reminder = preview("DISABLED");
        if (!saved.deadlineReminderEnabled)
          await cancelBookmarkReminders(
            tx,
            kind,
            userId,
            entity.id,
            now,
            "BOOKMARK_REMINDER_DISABLED",
          );
        else {
          const target = row ?? {
            id: entity.id,
            ready_id: null,
            source_conflict: 0,
          };
          const plans = await loadPlans(tx, kind, userId, [target], now);
          const plan = plans.get(entity.id)!;
          await reconcileReminders(
            tx,
            kind,
            userId,
            entity.id,
            target.ready_id,
            plan,
            now,
          );
          plan.history = await reminderHistory(tx, kind, userId, [entity.id]);
          reminder = reminderPreview(plan, true, target.ready_id, now);
        }
        return {
          contentRef,
          saved: true,
          savedAt: saved.createdAt,
          deadlineReminderEnabled: saved.deadlineReminderEnabled,
          reminder,
        };
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
}
