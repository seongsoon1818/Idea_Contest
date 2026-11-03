import { Prisma } from "../generated/prisma/client.js";
import { lockAccount } from "../auth/session-access.js";
import { contentQuery } from "../content/content.query.js";
import { readIndex } from "../notice/notice.index.js";
import { readProgramIndex } from "../program/program.index.js";
import { loadPlans, type Kind } from "../bookmark/deadline-plans.js";
import {
  cancelBookmarkReminders,
  invalidateObsolete,
  reconcileReminders,
} from "../bookmark/deadline-reminders.js";

export type Target = { userId: bigint; id: bigint; kind: Kind };
export function targetOf(r: {
  userId: bigint;
  noticeId: bigint | null;
  programId: bigint | null;
}): Target {
  return {
    userId: r.userId,
    id: (r.noticeId ?? r.programId)!,
    kind: r.noticeId === null ? "program" : "notice",
  };
}
// Update reservations and recheck the exact published version under the same locks as B05/B08.
export async function reconcileTarget(
  tx: Prisma.TransactionClient,
  { userId, id, kind }: Target,
) {
  await lockAccount(tx, userId);
  const account = await tx.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  const [entity] = await tx.$queryRaw<{ public_id: string }[]>(
    kind === "notice"
      ? Prisma.sql`SELECT public_id FROM notices WHERE id=${id} FOR UPDATE`
      : Prisma.sql`SELECT public_id FROM programs WHERE id=${id} FOR UPDATE`,
  );
  if (!entity || !account) return null;
  const now = new Date();
  const notice = kind === "notice";
  const saved = notice
    ? await tx.userNoticeBookmark.findUnique({
        where: { userId_noticeId: { userId, noticeId: id } },
        select: { deadlineReminderEnabled: true },
      })
    : await tx.userProgramBookmark.findUnique({
        where: { userId_programId: { userId, programId: id } },
        select: { deadlineReminderEnabled: true },
      });
  const index = notice ? readIndex : readProgramIndex;
  const row = (
    await index(
      tx,
      contentQuery(
        { status: "all" },
        notice ? "noticeCategory" : "programCategory",
      ),
      null,
      now,
      entity.public_id,
    )
  ).rows[0];
  const target = row ?? { id, ready_id: null, source_conflict: 0 };
  const plan = (await loadPlans(tx, kind, userId, [target], now)).get(id)!;
  if (account.status !== "ACTIVE" || !saved?.deadlineReminderEnabled) {
    await invalidateObsolete(tx, kind, userId, id, plan, now);
    await cancelBookmarkReminders(tx, kind, userId, id, now, "INACTIVE_TARGET");
    return null;
  }
  await reconcileReminders(tx, kind, userId, id, target.ready_id, plan, now);
  return { publicId: entity.public_id, plan, readyId: target.ready_id };
}
