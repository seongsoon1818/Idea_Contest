import type { Prisma } from "../generated/prisma/client.js";
import type { IndexRow } from "../content/content.index.js";
import { cardSelect, programCard } from "./program.view.js";

export async function programCards(
  tx: Prisma.TransactionClient,
  rows: IndexRow[],
  userId: bigint | undefined,
  personalized: boolean,
) {
  const programs = rows.length
    ? await tx.program.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: cardSelect(userId),
      })
    : [];
  const byId = new Map(programs.map((p) => [p.id, p]));
  return rows.map((r) =>
    programCard(byId.get(r.id)!, r, userId !== undefined, personalized),
  );
}
