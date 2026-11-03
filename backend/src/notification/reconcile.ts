import { Prisma } from "../generated/prisma/client.js";
import { lockAccount } from "../auth/session-access.js";
import { contentQuery } from "../content/content.query.js";
import { pageIndex } from "../content/content.index.js";
import { noticeSources, readIndex } from "../notice/notice.index.js";
import { programSources, readProgramIndex } from "../program/program.index.js";
import { loadPlans, type Kind } from "../bookmark/deadline-plans.js";
import {
  cancelBookmarkReminders,
  invalidateObsolete,
  reconcileReminders,
  reserveDeadlines,
} from "../bookmark/deadline-reminders.js";

export type Target = { userId: bigint; id: bigint; kind: Kind };

// The caller holds the account lock. Lock content in a stable order and use the
// same activation instant on every page, even if D-1 falls during the transaction.
export async function reserveOnChannelActivation(
  tx: Prisma.TransactionClient,
  userId: bigint,
  activatedAt: Date,
) {
  const batchSize = 100;
  for (const kind of ["notice", "program"] as const) {
    const isNotice = kind === "notice";
    const table = isNotice ? Prisma.sql`notices` : Prisma.sql`programs`;
    const bookmarks = isNotice
      ? Prisma.sql`user_notice_bookmarks`
      : Prisma.sql`user_program_bookmarks`;
    const column = isNotice ? Prisma.sql`notice_id` : Prisma.sql`program_id`;
    const q = contentQuery(
      { status: "all", size: String(batchSize) },
      isNotice ? "noticeCategory" : "programCategory",
    );
    const source = isNotice ? noticeSources(q) : programSources(q);
    let after = 0n;
    for (;;) {
      const batch = await tx.$queryRaw<{ id: bigint }[]>(Prisma.sql`
        SELECT c.id FROM ${bookmarks} b JOIN ${table} c ON c.id=b.${column}
        WHERE b.user_id=${userId} AND b.deadline_reminder_enabled=1 AND b.${column}>${after}
        ORDER BY b.${column} LIMIT ${batchSize} FOR UPDATE`);
      if (!batch.length) break;
      const ids = Prisma.join(batch.map((b) => b.id));
      const { rows } = await pageIndex(tx, q, null, activatedAt, {
        ...source,
        base: Prisma.sql`SELECT v.* FROM (${source.base}) v WHERE v.id IN (${ids})`,
      });
      const plans = await loadPlans(tx, kind, userId, rows, activatedAt);
      const inserts: Prisma.DeadlineReminderCreateManyInput[] = [];
      for (const row of rows)
        await reserveDeadlines(
          tx,
          kind,
          userId,
          row.id,
          row.ready_id,
          plans.get(row.id)!,
          activatedAt,
          inserts,
        );
      if (inserts.length)
        await tx.deadlineReminder.createMany({ data: inserts });
      if (batch.length < batchSize) break;
      after = batch[batch.length - 1]!.id;
    }
  }
}
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
