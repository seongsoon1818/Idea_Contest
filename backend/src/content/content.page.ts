import type { Prisma } from "../generated/prisma/client.js";
import { ApiError, invalid } from "../common/errors.js";
import { matchingProfile } from "./matching-profile.js";
import type { ContentQuery } from "./content.query.js";

export async function listProfile(
  tx: Prisma.TransactionClient,
  q: ContentQuery,
  kind: "notice" | "program",
  userId?: bigint,
) {
  if (
    q.topic &&
    !(await tx.topic.findFirst({
      where: { code: q.topic, isActive: true },
      select: { id: true },
    }))
  )
    invalid("topic", "등록된 관심 분야를 선택하세요.");
  if (q.category) {
    const options = {
      where: { code: q.category, isActive: true },
      select: { id: true },
    };
    const found =
      kind === "program"
        ? await tx.programCategory.findFirst(options)
        : await tx.noticeCategory.findFirst(options);
    if (!found) invalid(kind + "Category", "등록된 분류를 선택하세요.");
  }
  const profile = await matchingProfile(tx, userId);
  if (q.recommendedOnly && !profile)
    throw new ApiError(
      409,
      "PROFILE_REQUIRED",
      "추천 프로필을 먼저 완성해 주세요.",
    );
  return profile;
}
export function pageResponse<T>(
  items: T[],
  total: number,
  q: ContentQuery,
  personalized: boolean,
  generatedAt: Date,
) {
  const totalPages = Math.ceil(total / q.size);
  return {
    items,
    pagination: {
      page: q.page,
      size: q.size,
      totalItems: total,
      totalPages,
      hasNext: q.page < totalPages,
    },
    context: {
      mode: personalized ? "PERSONALIZED" : "GENERAL",
      profileCompleted: personalized,
      recommendationPolicyVersion: "rule-v1",
      generatedAt,
    },
  };
}
