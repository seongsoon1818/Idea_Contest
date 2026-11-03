import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { ApiError, invalid } from "../common/errors.js";
import { matchingProfile } from "./notice.context.js";
import { readIndex } from "./notice.index.js";
import { noticeQuery } from "./notice.query.js";
import { documentView } from "./notice.document.js";
import {
  cardSummarySelect,
  cardView,
  detailSummarySelect,
  detailView,
  documentNoticeSelect,
  metadataSelect,
} from "./notice.view.js";

function validatePublicId(publicId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(publicId))
    invalid("noticeId", "공지 publicId 형식이 잘못되었습니다.");
}
const notFound = () =>
  new ApiError(404, "RESOURCE_NOT_FOUND", "공지를 찾을 수 없습니다.");

@Injectable()
export class NoticeService {
  constructor(private readonly db: PrismaService) {}
  async list(params: Record<string, string>, userId?: bigint) {
    const q = noticeQuery(params);
    return this.db.$transaction(
      async (tx) => {
        if (
          q.topic &&
          !(await tx.topic.findFirst({
            where: { code: q.topic, isActive: true },
            select: { id: true },
          }))
        )
          invalid("topic", "등록된 관심 분야를 선택하세요.");
        if (
          q.category &&
          !(await tx.noticeCategory.findFirst({
            where: { code: q.category, isActive: true },
            select: { id: true },
          }))
        )
          invalid("noticeCategory", "등록된 공지 분류를 선택하세요.");
        const profile = await matchingProfile(tx, userId),
          now = new Date();
        if (q.recommendedOnly && !profile)
          throw new ApiError(
            409,
            "PROFILE_REQUIRED",
            "추천 프로필을 먼저 완성해 주세요.",
          );
        const { rows, total } = await readIndex(tx, q, profile, now);
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
        const totalPages = Math.ceil(total / q.size);
        return {
          items: rows.map((r) =>
            cardView(
              records.get(r.id)!,
              r.ready_id === null ? undefined : ready.get(r.ready_id),
              r,
              userId !== undefined,
              !!profile,
            ),
          ),
          pagination: {
            page: q.page,
            size: q.size,
            totalItems: total,
            totalPages,
            hasNext: q.page < totalPages,
          },
          context: {
            mode: profile ? "PERSONALIZED" : "GENERAL",
            profileCompleted: !!profile,
            recommendationPolicyVersion: "rule-v1",
            generatedAt: now,
          },
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async detail(publicId: string, userId?: bigint) {
    validatePublicId(publicId);
    return this.db.$transaction(
      async (tx) => {
        const profile = await matchingProfile(tx, userId);
        const {
          rows: [row],
        } = await readIndex(
          tx,
          noticeQuery({ status: "all" }),
          profile,
          new Date(),
          publicId,
        );
        if (!row) throw notFound();
        const notice = await tx.notice.findUniqueOrThrow({
          where: { id: row.id },
          select: metadataSelect(userId, true),
        });
        const summary =
          row.ready_id === null
            ? undefined
            : await tx.noticeSummary.findUniqueOrThrow({
                where: { id: row.ready_id },
                select: detailSummarySelect,
              });
        return detailView(
          notice,
          summary,
          row,
          userId !== undefined,
          !!profile,
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  }

  async content(publicId: string) {
    validatePublicId(publicId);
    return this.db.$transaction(
      async (tx) => {
        const notice = await tx.notice.findFirst({
          where: {
            publicId,
            visibility: "PUBLIC",
            currentRevisionId: { not: null },
          },
          select: documentNoticeSelect,
        });
        if (!notice?.currentRevision || notice.currentRevisionId === null)
          throw notFound();
        // Same publication gate as N02's readIndex, without computing any personal ranking.
        const summary =
          notice.publishedSummaryId === null
            ? null
            : await tx.noticeSummary.findFirst({
                where: {
                  id: notice.publishedSummaryId,
                  noticeId: notice.id,
                  revisionId: notice.currentRevisionId,
                  reviewStatus: "APPROVED",
                  validationStatus: "VALID",
                },
                select: detailSummarySelect,
              });
        if (!summary)
          throw new ApiError(
            409,
            "SUMMARY_NOT_READY",
            "최신 원문에 대해 공개할 수 있는 공지 내용이 없습니다.",
          );
        return documentView(notice, summary);
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
}
