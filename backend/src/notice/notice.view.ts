import { Prisma, type DatePrecision } from "../generated/prisma/client.js";
import { academicView, categorySelect } from "../catalog/academic.js";
import type { IndexRow } from "./notice.index.js";

const assetSelect = {
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
const revisionHeader = {
  title: true,
  sourceCategory: true,
  author: true,
  publishedDate: true,
} as const;
const orderedAssets = {
  select: assetSelect,
  orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
} satisfies Prisma.NoticeAssetFindManyArgs;

// The content popup does not need per-user bookmarks, scores, or collected HTML.
export const documentNoticeSelect = {
  id: true,
  publicId: true,
  externalId: true,
  canonicalUrl: true,
  currentRevisionId: true,
  publishedSummaryId: true,
  currentRevision: { select: { ...revisionHeader, assets: orderedAssets } },
} satisfies Prisma.NoticeSelect;

export function metadataSelect(userId: bigint | undefined, detail: boolean) {
  return {
    id: true,
    publicId: true,
    externalId: true,
    canonicalUrl: true,
    lastCheckedAt: true,
    currentRevisionId: true,
    currentRevision: {
      select: {
        ...revisionHeader,
        assets: {
          ...orderedAssets,
          where: detail ? {} : { kind: "IMAGE" as const },
        },
      },
    },
    publishedSummary: { select: { revisionId: true } },
    bookmarks: {
      where: { userId: userId ?? 0n },
      select: { deadlineReminderEnabled: true, createdAt: true },
    },
  } satisfies Prisma.NoticeSelect;
}
export const cardSummarySelect = {
  id: true,
  oneLineSummary: true,
  category: { select: categorySelect },
  primaryTopic: { select: categorySelect },
  benefitsJson: true,
  audienceJson: true,
  tagsJson: true,
  applicationStatus: true,
} satisfies Prisma.NoticeSummarySelect;
export const detailSummarySelect = {
  ...cardSummarySelect,
  revisionId: true,
  versionNo: true,
  kind: true,
  summaryJson: true,
  applicationJson: true,
  operationGuideJson: true,
  preparationsJson: true,
  detailsJson: true,
  gradeScope: true,
  academicScope: true,
  reviewedAt: true,
  reviewResolutionJson: true,
  periods: {
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      role: true,
      label: true,
      startRaw: true,
      startPrecision: true,
      startDate: true,
      startAt: true,
      endRaw: true,
      endPrecision: true,
      endDate: true,
      endAt: true,
    },
  },
  items: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      organization: true,
      originalUrl: true,
      deadlineRaw: true,
      deadlinePrecision: true,
      deadlineDate: true,
      deadlineAt: true,
      factsJson: true,
    },
  },
  targetGrades: {
    orderBy: [{ purpose: "asc" }, { grade: "asc" }],
    select: { purpose: true, grade: true },
  },
  targetUnits: {
    orderBy: [{ purpose: "asc" }, { academicUnitId: "asc" }],
    select: { purpose: true, academicUnit: true, includeDescendants: true },
  },
} satisfies Prisma.NoticeSummarySelect;

type AssetRow = Prisma.NoticeAssetGetPayload<{ select: typeof assetSelect }>;
type Metadata = Prisma.NoticeGetPayload<{
  select: ReturnType<typeof metadataSelect>;
}>;
type CardSummary = Prisma.NoticeSummaryGetPayload<{
  select: typeof cardSummarySelect;
}>;
type DetailSummary = Prisma.NoticeSummaryGetPayload<{
  select: typeof detailSummarySelect;
}>;

function httpsUrl(input: string | null, schoolOnly: boolean) {
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
export function articleUrl(
  input: string,
  externalId: string,
  publicId: string,
) {
  const url = httpsUrl(input, true);
  if (!url || !["www.hansung.ac.kr", "hansung.ac.kr"].includes(url.hostname))
    return null;
  const match = /^\/bbs\/hansung\/([0-9]+)\/([0-9]+)\/artclView\.do$/.exec(
    url.pathname,
  );
  const board = /^hansung-([0-9]+)-[0-9]+$/.exec(publicId)?.[1];
  return match && match[2] === externalId && (!board || board === match[1])
    ? url.origin + url.pathname
    : null;
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
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const str = (v: unknown) =>
  typeof v === "string" && v.trim().length ? v : null;
const fact = (v: unknown) => str(v) ?? str(obj(v).text);
function list<T>(v: unknown, map: (v: unknown) => T | null): T[] | null {
  return Array.isArray(v) ? v.map(map).filter((x): x is T => x !== null) : null;
}
function audience(v: unknown) {
  if (!v || Array.isArray(v) || typeof v !== "object") return null;
  const a = obj(v);
  const rule = (v: unknown) => {
    const text = fact(v);
    return text ? { text, exceptions: list(obj(v).exceptions, fact) } : null;
  };
  return {
    description: fact(a.description),
    qualifications: list(a.qualifications, rule),
    exclusions: list(a.exclusions, rule),
    preferences: list(a.preferences, fact),
    recommended: list(a.recommended, fact),
  };
}
function benefit(v: unknown) {
  const b = obj(v),
    text = fact(v);
  return text
    ? {
        text,
        condition: str(b.condition),
        availability: ["stated", "conditional", "ended"].includes(
          String(b.availability),
        )
          ? String(b.availability)
          : "unknown",
      }
    : null;
}
export function benefitLabel(b: NonNullable<ReturnType<typeof benefit>>) {
  const status: Record<string, string> = {
    ended: "혜택 종료",
    conditional: "조건부",
    unknown: "제공 여부 미확인",
  };
  return [b.text, b.condition, status[b.availability]]
    .filter(Boolean)
    .join(" · ");
}
function boundary(
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
export function cardView(
  n: Metadata,
  s: CardSummary | undefined,
  row: IndexRow,
  loggedIn: boolean,
  personalized: boolean,
) {
  const r = n.currentRevision!;
  const thumbnail = r.assets.find(
    (a) =>
      a.kind === "IMAGE" &&
      a.storageStatus !== "FAILED" &&
      httpsUrl(a.sourceUrl, true),
  );
  const saved = n.bookmarks[0],
    reasons: string[] = [];
  if (Number(row.topic_points)) reasons.push("관심 분야 일치");
  if (Number(row.unit_points)) reasons.push("지정 소속 일치");
  if (Number(row.grade_points)) reasons.push("지정 학년 일치");
  const status = row.eligibility;
  const firstBenefit = list(s?.benefitsJson, benefit)?.[0];
  return {
    id: n.publicId,
    type: "notice" as const,
    externalId: n.externalId,
    title: r.title,
    oneLineSummary: s?.oneLineSummary ?? null,
    noticeCategory: s?.category ?? null,
    programCategory: null,
    primaryTopic: s?.primaryTopic ?? null,
    sourceCategory: r.sourceCategory,
    author: r.author,
    publishedDate: r.publishedDate?.toISOString().slice(0, 10) ?? null,
    originalUrl: articleUrl(n.canonicalUrl, n.externalId, n.publicId),
    applicationStatus: s?.applicationStatus ?? null,
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
    benefitSummary: firstBenefit ? benefitLabel(firstBenefit) : null,
    targetSummary: fact(obj(s?.audienceJson).description),
    thumbnail: thumbnail ? assetView(thumbnail) : null,
    tags: list(s?.tagsJson, str) ?? [],
    summaryStatus: s
      ? "READY"
      : n.publishedSummary &&
          n.publishedSummary.revisionId !== n.currentRevisionId
        ? "STALE"
        : "UNAVAILABLE",
    bookmark: loggedIn
      ? {
          saved: !!saved,
          deadlineReminderEnabled: saved?.deadlineReminderEnabled ?? null,
          savedAt: saved?.createdAt ?? null,
        }
      : null,
    recommendation: {
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
    },
    lastCheckedAt: n.lastCheckedAt,
  };
}
export function publicSummary(
  s: DetailSummary,
  warnings: { code: string; message: string }[],
) {
  const periods = s.periods.map((p) => ({
    id: String(p.id),
    role: p.role,
    label: p.label,
    start: boundary(p.startRaw, p.startPrecision, p.startDate, p.startAt),
    end: boundary(p.endRaw, p.endPrecision, p.endDate, p.endAt),
  }));
  const items = s.items.map((i) => ({
    id: String(i.id),
    title: i.title,
    organization: i.organization,
    originalUrl: httpsUrl(i.originalUrl, false)?.href ?? null,
    deadline: boundary(
      i.deadlineRaw,
      i.deadlinePrecision,
      i.deadlineDate,
      i.deadlineAt,
    ),
    facts: list(i.factsJson, fact) ?? [],
  }));
  const applies = s.applicationStatus !== "not_applicable";
  const applicationPeriods = applies
    ? periods.filter((p) => p.role === "APPLICATION")
    : [];
  return {
    id: String(s.id),
    revisionId: String(s.revisionId),
    versionNo: s.versionNo,
    noticeKind: s.kind,
    oneLineSummary: s.oneLineSummary,
    summary: list(s.summaryJson, fact) ?? [],
    application: {
      status: s.applicationStatus,
      methods: applies ? list(obj(s.applicationJson).methods, fact) : null,
      periods: applicationPeriods,
      deadlines: applies
        ? [
            ...applicationPeriods.flatMap((p) =>
              p.end
                ? [
                    {
                      reference: { kind: "notice_period", id: p.id },
                      label: p.label,
                      end: p.end,
                    },
                  ]
                : [],
            ),
            ...items.flatMap((i) =>
              i.deadline
                ? [
                    {
                      reference: { kind: "notice_item", id: i.id },
                      label: i.title,
                      end: i.deadline,
                    },
                  ]
                : [],
            ),
          ]
        : [],
    },
    audience: audience(s.audienceJson),
    activityPeriods: periods.filter((p) => p.role !== "APPLICATION"),
    benefits: list(s.benefitsJson, benefit),
    preparations: list(s.preparationsJson, (v) => {
      const p = obj(v),
        text = fact(v);
      return text
        ? {
            text,
            stage: [
              "application",
              "interview",
              "after_acceptance",
              "participation",
            ].includes(String(p.stage))
              ? String(p.stage)
              : "other",
            required: typeof p.required === "boolean" ? p.required : null,
            condition: str(p.condition),
          }
        : null;
    }),
    operationGuide: list(s.operationGuideJson, fact),
    details: (
      list(s.detailsJson, (v) => {
        const d = obj(v),
          label = str(d.label);
        return label ? { label, items: list(d.facts, fact) ?? [] } : null;
      }) ?? []
    ).map((d, i) => ({ ...d, key: "section-" + (i + 1) })),
    items,
    reviewedAt: s.reviewedAt,
    warnings,
  };
}
export function detailView(
  n: Metadata,
  s: DetailSummary | undefined,
  row: IndexRow,
  loggedIn: boolean,
  personalized: boolean,
) {
  const card = cardView(n, s, row, loggedIn, personalized);
  const warnings: { code: string; message: string }[] = [];
  if (!s)
    warnings.push({
      code: "SUMMARY_" + card.summaryStatus,
      message: "최신 원문에 대해 공개할 수 있는 요약이 없습니다.",
    });
  const limitations = reviewLimitations(s);
  return {
    card,
    currentRevisionId: String(n.currentRevisionId),
    summary: s ? publicSummary(s, limitations) : null,
    targetRules: publicTargets(s),
    ...publicAssets(n.currentRevision!.assets),
    bodyAvailable: !!s,
    warnings: [
      ...warnings,
      ...originalUrlWarnings(card.originalUrl),
      ...limitations,
    ],
  };
}

export function reviewLimitations(s: DetailSummary | undefined) {
  return Array.isArray(s?.reviewResolutionJson) &&
    s.reviewResolutionJson.some(
      (v) => obj(v).disposition === "accepted_limitation",
    )
    ? [
        {
          code: "SOURCE_CHECK_REQUIRED",
          message:
            "검토 과정에서 확인되지 않은 내용이 있습니다. 학교 원문을 함께 확인하세요.",
        },
      ]
    : [];
}
export function originalUrlWarnings(url: string | null) {
  return url
    ? []
    : [
        {
          code: "ORIGINAL_URL_UNAVAILABLE",
          message: "확인된 학교 원문 링크가 없습니다.",
        },
      ];
}
export function publicAssets(rows: AssetRow[]) {
  const assets = rows.map(assetView);
  return {
    images: assets.filter((a) => a.kind === "IMAGE"),
    attachments: assets.filter((a) => a.kind === "ATTACHMENT"),
  };
}
export function publicTargets(s: DetailSummary | undefined) {
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
