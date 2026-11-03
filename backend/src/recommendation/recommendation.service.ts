import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { pageIndex } from "../content/content.index.js";
import {
  contentContext,
  listProfile,
  pageResponse,
} from "../content/content.page.js";
import { matchingProfile } from "../content/matching-profile.js";
import { noticeSources } from "../notice/notice.index.js";
import { programSources } from "../program/program.index.js";
import { noticeCards } from "../notice/notice.cards.js";
import { programCards } from "../program/program.cards.js";
import { readNoticeDetail } from "../notice/notice.service.js";
import { readProgramDetail } from "../program/program.service.js";
import {
  comparisonItems,
  recommendationQuery,
} from "./recommendation.input.js";

function noticeComparison({
  card,
  summary,
  targetRules,
  warnings,
}: Awaited<ReturnType<typeof readNoticeDetail>>) {
  return {
    content: card,
    audience: summary?.audience ?? null,
    targetRules,
    application: summary?.application ?? null,
    activityPeriods: summary?.activityPeriods ?? [],
    benefits: summary?.benefits ?? null,
    preparations: summary?.preparations ?? null,
    operationGuide: summary?.operationGuide ?? null,
    publicInfo: null,
    warnings,
  };
}
function programComparison({
  card,
  publicInfo,
  application,
  activityPeriods,
  sessions,
  targetRules,
  warnings,
}: Awaited<ReturnType<typeof readProgramDetail>>) {
  const audience = publicInfo.audience
    ? {
        description: publicInfo.audience,
        qualifications: null,
        exclusions: null,
        preferences: null,
        recommended: null,
      }
    : null;
  return {
    content: card,
    audience,
    targetRules,
    application,
    activityPeriods: [
      ...activityPeriods,
      ...sessions.flatMap((s) =>
        s.activityPeriods.map((p) => ({
          ...p,
          label: s.title + " · " + p.label,
        })),
      ),
    ],
    benefits: null,
    preparations: null,
    operationGuide: null,
    publicInfo,
    warnings,
  };
}
@Injectable()
export class RecommendationService {
  constructor(private readonly db: PrismaService) {}
  list(params: Record<string, string>, userId?: bigint) {
    const { q, type } = recommendationQuery(params);
    return this.db.$transaction(
      async (tx) => {
        const now = new Date(),
          profile = await listProfile(
            tx,
            q,
            type === "program" ? "program" : "notice",
            userId,
          );
        const query = { ...q, recommendedOnly: profile !== null };
        const first =
          type === "program" ? programSources(query) : noticeSources(query);
        const { rows, total } = await pageIndex(
          tx,
          query,
          profile,
          now,
          first,
          type === "all" ? programSources(query) : undefined,
        );
        const notices = await noticeCards(
          tx,
          rows.filter((r) => r.content_type === "notice"),
          userId,
          !!profile,
        );
        const programs = await programCards(
          tx,
          rows.filter((r) => r.content_type === "program"),
          userId,
          !!profile,
        );
        const cards = new Map(
          [...notices, ...programs].map(
            (c) => [c.type + ":" + c.id, c] as const,
          ),
        );
        return pageResponse(
          rows.map((r) => cards.get(r.content_type + ":" + r.public_id)!),
          total,
          q,
          !!profile,
          now,
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  compare(raw: unknown, userId?: bigint) {
    const refs = comparisonItems(raw);
    return this.db.$transaction(
      async (tx) => {
        const now = new Date(),
          profile = await matchingProfile(tx, userId);
        const items = [];
        for (const { type, id } of refs) {
          items.push(
            type === "notice"
              ? noticeComparison(
                  await readNoticeDetail(tx, id, userId, profile, now),
                )
              : programComparison(
                  await readProgramDetail(tx, id, userId, profile, now, false),
                ),
          );
        }
        return {
          mode: "STRUCTURED",
          items,
          context: contentContext(!!profile, now),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
}
