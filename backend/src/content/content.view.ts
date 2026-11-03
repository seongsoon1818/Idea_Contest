import type {
  ProgramAsset,
  AcademicUnit,
  GradeCode,
  EligibilityScope,
  TargetPurpose,
  Prisma,
  DatePrecision,
} from "../generated/prisma/client.js";
import { academicView } from "../catalog/academic.js";
import type { IndexRow } from "./content.index.js";
export const assetSelect = {
  id: true,
  kind: true,
  sourceUrl: true,
  storageStatus: true,
  altText: true,
  filename: true,
  mimeType: true,
  width: true,
  height: true,
  sizeBytes: true,
  sortOrder: true,
} satisfies Prisma.NoticeAssetSelect;

export const orderedAssets = {
  select: assetSelect,
  orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
} satisfies Prisma.NoticeAssetFindManyArgs;

type AssetRow = Pick<ProgramAsset, keyof typeof assetSelect>;
export function httpsUrl(input: string | null, schoolOnly: boolean) {
  if (!input || /[\\\u0000-\u001f]/.test(input)) return null;
  try {
    const u = new URL(input);
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    if (
      schoolOnly &&
      !(u.hostname === "hansung.ac.kr" || u.hostname.endsWith(".hansung.ac.kr"))
    )
      return null;
    return u;
  } catch {
    return null;
  }
}

function assetView(a: AssetRow) {
  const url =
    a.storageStatus === "FAILED"
      ? null
      : (httpsUrl(a.sourceUrl, true)?.href ?? null);
  return {
    id: String(a.id),
    kind: a.kind,
    url,
    alt: a.altText,
    filename: a.filename?.split(/[\\/]/).pop() ?? null,
    mimeType: a.mimeType,
    width: a.width,
    height: a.height,
    sizeBytes: a.sizeBytes?.toString() ?? null,
    sortOrder: a.sortOrder,
    availability: url ? "AVAILABLE" : "UNAVAILABLE",
  };
}

export function boundary(
  raw: string | null,
  precision: DatePrecision | null,
  date: Date | null,
  at: Date | null,
) {
  if (!precision || raw === null) return null;
  return {
    rawText: raw,
    precision,
    value:
      precision === "date"
        ? (date?.toISOString().slice(0, 10) ?? null)
        : precision === "datetime"
          ? (at?.toISOString() ?? null)
          : null,
  };
}

export function thumbnailView(assets: AssetRow[]) {
  const a = assets.find(
    (a) =>
      a.kind === "IMAGE" &&
      a.storageStatus !== "FAILED" &&
      httpsUrl(a.sourceUrl, true),
  );
  return a ? assetView(a) : null;
}
export function bookmarkView(
  loggedIn: boolean,
  saved: { deadlineReminderEnabled: boolean; createdAt: Date } | undefined,
) {
  return loggedIn
    ? {
        saved: !!saved,
        deadlineReminderEnabled: saved?.deadlineReminderEnabled ?? null,
        savedAt: saved?.createdAt ?? null,
      }
    : null;
}
export function scheduleView(row: IndexRow) {
  return {
    recruitmentStatus: row.recruitment,
    applicationStart: boundary(
      row.start_raw,
      row.start_precision,
      row.start_date,
      row.start_at,
    ),
    deadline:
      row.days_left == null
        ? null
        : boundary(row.end_raw, row.end_precision, row.end_date, row.end_at),
    deadlineCount: Number(row.deadline_count),
    daysLeft: row.days_left == null ? null : Number(row.days_left),
  };
}
export function recommendationView(row: IndexRow, personalized: boolean) {
  const reasons: string[] = [];
  if (Number(row.topic_points)) reasons.push("관심 분야 일치");
  if (Number(row.unit_points)) reasons.push("지정 소속 일치");
  if (Number(row.grade_points)) reasons.push("지정 학년 일치");
  const status = row.eligibility;

  return {
    score: personalized
      ? Number(row.topic_points) +
        Number(row.unit_points) +
        Number(row.grade_points)
      : null,
    reasons,
    eligibility: {
      status,
      gradeMatch: row.grade_match,
      academicMatch: row.unit_match,
      requiresSourceCheck: status !== "MATCH",
      reasons: [
        {
          code: status,
          message:
            status === "MATCH"
              ? "확인된 대상 조건과 일치합니다."
              : status === "MISMATCH"
                ? "확인된 필수 대상 조건과 다릅니다."
                : "원문에서 신청 대상을 확인하세요.",
        },
      ],
    },
    policyVersion: "rule-v1",
  };
}
type TargetRows = {
  gradeScope: EligibilityScope;
  academicScope: EligibilityScope;
  targetGrades: { grade: GradeCode; purpose: TargetPurpose }[];
  targetUnits: {
    purpose: TargetPurpose;
    academicUnit: AcademicUnit;
    includeDescendants: boolean;
  }[];
};
export function publicAssets(rows: AssetRow[]) {
  const assets = rows.map(assetView);
  return {
    images: assets.filter((a) => a.kind === "IMAGE"),
    attachments: assets.filter((a) => a.kind === "ATTACHMENT"),
  };
}
export function publicTargets(s: TargetRows | undefined) {
  return {
    gradeScope: s?.gradeScope ?? "UNKNOWN",
    academicScope: s?.academicScope ?? "UNKNOWN",
    grades: s?.targetGrades ?? [],
    academicUnits:
      s?.targetUnits.map((u) => ({
        purpose: u.purpose,
        unit: academicView(u.academicUnit),
        includeDescendants: u.includeDescendants,
      })) ?? [],
  };
}
