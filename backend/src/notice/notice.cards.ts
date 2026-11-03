import type { Prisma } from "../generated/prisma/client.js";
import type { IndexRow } from "../content/content.index.js";
import { cardSummarySelect, cardView, metadataSelect } from "./notice.view.js";

export async function noticeCards(
  tx: Prisma.TransactionClient,
  rows: IndexRow[],
  userId: bigint | undefined,
  personalized: boolean,
) {
  const notices = rows.length
    ? await tx.notice.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: metadataSelect(userId, false),
      })
    : [];
  const summaryIds = rows.flatMap((r) =>
    r.ready_id === null ? [] : [r.ready_id],
  );
  const summaries = summaryIds.length
    ? await tx.noticeSummary.findMany({
        where: { id: { in: summaryIds } },
        select: cardSummarySelect,
      })
    : [];
  const records = new Map(notices.map((n) => [n.id, n])),
    ready = new Map(summaries.map((s) => [s.id, s]));
  return rows.map((r) =>
    cardView(
      records.get(r.id)!,
      r.ready_id === null ? undefined : ready.get(r.ready_id),
      r,
      userId !== undefined,
      personalized,
    ),
  );
}
