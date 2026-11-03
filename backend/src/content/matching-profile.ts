import type { Prisma, GradeCode } from "../generated/prisma/client.js";

export type MatchingProfile = {
  grade: GradeCode;
  topics: bigint[];
  selected: bigint[];
  ancestors: bigint[];
  possibleDescendants: bigint[];
};
export async function matchingProfile(
  tx: Prisma.TransactionClient,
  userId?: bigint,
): Promise<MatchingProfile | null> {
  if (userId === undefined) return null;
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      profile: { select: { grade: true, completedAt: true } },
      topics: { select: { topicId: true } },
      academicUnits: { select: { academicUnitId: true } },
    },
  });
  if (!user?.profile?.completedAt || !user.profile.grade) return null;
  const selected = new Set(user.academicUnits.map((u) => u.academicUnitId));
  const catalog = await tx.academicUnit.findMany({
    select: { id: true, parentId: true },
  });
  const parents = new Map(catalog.map((u) => [u.id, u.parentId]));
  const ancestors = new Set<bigint>(),
    possibleDescendants = new Set<bigint>();
  for (const { id } of catalog) {
    const visited = new Set([id]);
    let p = parents.get(id);
    while (p != null && !visited.has(p)) {
      if (selected.has(id)) ancestors.add(p);
      if (selected.has(p)) possibleDescendants.add(id);
      visited.add(p);
      p = parents.get(p);
    }
  }
  return {
    grade: user.profile.grade,
    topics: user.topics.map((t) => t.topicId),
    selected: [...selected],
    ancestors: [...ancestors],
    possibleDescendants: [...possibleDescendants],
  };
}
