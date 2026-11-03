import { publicAssets, publicTargets } from "../content/content.view.js";
import type { GradeCode, Prisma } from "../generated/prisma/client.js";
import {
  articleUrl,
  benefitLabel,
  originalUrlWarnings,
  publicSummary,
  reviewLimitations,
  type detailSummarySelect,
  type documentNoticeSelect,
} from "./notice.view.js";

type Summary = ReturnType<typeof publicSummary>;
type Period = Summary["activityPeriods"][number];
type Section = { key: string; label: string; lines: string[] };
const grades: Record<GradeCode, string> = {
  YEAR_1: "1학년",
  YEAR_2: "2학년",
  YEAR_3: "3학년",
  YEAR_4: "4학년",
  OTHER: "기타 학년",
};
const stages: Record<string, string> = {
  application: "신청 시",
  interview: "면접 시",
  after_acceptance: "선발 후",
  participation: "참여 시",
};

function periodLine({ label, start, end }: Period) {
  const from = start?.rawText,
    to = end?.rawText;
  // Keep the source's precision, including a stated but unresolved date.
  const range = from && to && from !== to ? from + " ~ " + to : from || to;
  return label + ": " + (range || "일정 미기재");
}

function documentSections(
  s: Summary,
  targets: ReturnType<typeof publicTargets>,
) {
  const sections: Section[] = [];
  function add(
    key: string,
    label: string,
    values: (string | null | undefined)[],
  ) {
    const lines = values.filter(
      (v): v is string => typeof v === "string" && !!v.trim(),
    );
    if (lines.length) sections.push({ key, label, lines });
  }

  const audience = s.audience;
  const restrictions = (
    label: string,
    rules: NonNullable<typeof audience>["qualifications"],
  ) =>
    (rules ?? []).map(
      (rule) =>
        label +
        ": " +
        rule.text +
        (rule.exceptions?.length
          ? " (예외: " + rule.exceptions.join("; ") + ")"
          : ""),
    );
  const targetLines = (
    purpose: "REQUIRED" | "PREFERRED" | "RECOMMENDED",
    prefix: string,
  ) => {
    const gradeNames = targets.grades
      .filter((g) => g.purpose === purpose)
      .map((g) => grades[g.grade]);
    const unitNames = targets.academicUnits
      .filter((u) => u.purpose === purpose)
      .map(
        (u) => u.unit.name + (u.includeDescendants ? " (하위 소속 포함)" : ""),
      );
    return [
      gradeNames.length ? prefix + " 학년: " + gradeNames.join(", ") : null,
      unitNames.length ? prefix + " 소속: " + unitNames.join(", ") : null,
    ];
  };
  add("audience", "모집 대상", [
    audience?.description,
    targets.gradeScope === "ALL" ? "대상 학년: 전 학년" : null,
    targets.academicScope === "ALL" ? "소속 제한 없음" : null,
    ...targetLines("REQUIRED", "필수"),
    ...restrictions("필수 자격", audience?.qualifications ?? null),
    ...restrictions("제외 조건", audience?.exclusions ?? null),
    ...targetLines("PREFERRED", "우대"),
    ...(audience?.preferences ?? []).map((t) => "우대: " + t),
    ...targetLines("RECOMMENDED", "추천"),
    ...(audience?.recommended ?? []).map((t) => "추천: " + t),
  ]);
  add("applicationPeriod", "신청 기간", s.application.periods.map(periodLine));
  add("activity", "활동 / 결과 안내", s.activityPeriods.map(periodLine));
  add("benefits", "참여 혜택", (s.benefits ?? []).map(benefitLabel));
  add(
    "preparations",
    "제출 / 준비사항",
    (s.preparations ?? []).map((p) =>
      [
        p.text,
        stages[p.stage],
        p.required === null ? null : p.required ? "필수" : "선택",
        p.condition,
      ]
        .filter(Boolean)
        .join(" · "),
    ),
  );
  add("operationGuide", "운영 / 신청 안내", [
    ...(s.application.methods ?? []),
    ...(s.operationGuide ?? []),
  ]);
  add(
    "summary",
    "주요 내용",
    s.summary.filter((line) => line !== s.oneLineSummary),
  );
  for (const section of s.details)
    add(section.key, section.label, section.items);
  // Each opportunity keeps its own deadline; it is not the parent notice's deadline.
  for (const item of s.items)
    add("item-" + item.id, item.title, [
      item.organization,
      item.deadline ? "마감: " + item.deadline.rawText : null,
      ...item.facts,
      item.originalUrl,
    ]);
  return sections;
}

export function documentView(
  notice: Prisma.NoticeGetPayload<{ select: typeof documentNoticeSelect }>,
  approved: Prisma.NoticeSummaryGetPayload<{
    select: typeof detailSummarySelect;
  }>,
) {
  const revision = notice.currentRevision!;
  const warnings = reviewLimitations(approved);
  const summary = publicSummary(approved, warnings);
  const originalUrl = articleUrl(
    notice.canonicalUrl,
    notice.externalId,
    notice.publicId,
  );
  return {
    id: notice.publicId,
    revisionId: summary.revisionId,
    summaryVersion: summary.versionNo,
    title: revision.title,
    author: revision.author,
    publishedDate: revision.publishedDate?.toISOString().slice(0, 10) ?? null,
    oneLineSummary: summary.oneLineSummary,
    sections: documentSections(summary, publicTargets(approved)),
    ...publicAssets(revision.assets),
    originalUrl,
    warnings: [...warnings, ...originalUrlWarnings(originalUrl)],
  };
}
