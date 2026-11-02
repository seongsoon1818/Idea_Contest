import type { Prisma } from "../generated/prisma/client.js";
import { academicView, categorySelect } from "../catalog/academic.js";

export const userSelect = {
  id: true,
  loginId: true,
  name: true,
  role: true,
  createdAt: true,
  profile: { select: { grade: true, updatedAt: true, completedAt: true } },
} satisfies Prisma.UserSelect;

export const profileSelect = {
  ...userSelect,
  academicUnits: {
    orderBy: { slot: "asc" },
    select: { slot: true, academicUnit: true },
  },
  topics: {
    select: { topic: { select: categorySelect } },
    orderBy: { topic: { sortOrder: "asc" } },
  },
} satisfies Prisma.UserSelect;
type Account = Prisma.UserGetPayload<{ select: typeof userSelect }>;
export type ProfileAccount = Prisma.UserGetPayload<{
  select: typeof profileSelect;
}>;

export function userView(row: Account) {
  return {
    id: String(row.id),
    loginId: row.loginId,
    name: row.name,
    role: row.role,
    profileCompleted: !!row.profile?.completedAt,
    createdAt: row.createdAt,
  };
}
export function profileView(row: ProfileAccount) {
  return {
    name: row.name,
    grade: row.profile?.grade ?? null,
    academicUnits: row.academicUnits.map((s) => ({
      slot: s.slot,
      unit: academicView(s.academicUnit),
    })),
    interests: row.topics.map((t) => t.topic),
    completed: !!row.profile?.completedAt,
    completedAt: row.profile?.completedAt ?? null,
    updatedAt: row.profile?.updatedAt ?? null,
  };
}
