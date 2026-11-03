import type { ProgramRevision, Prisma } from "../generated/prisma/client.js";
import { categorySelect } from "../catalog/academic.js";
import {
  orderedAssets,
  httpsUrl,
  publicAssets,
  publicTargets,
  thumbnailView,
  scheduleView,
  bookmarkView,
  recommendationView,
  boundary,
} from "../content/content.view.js";
import type { IndexRow } from "../content/content.index.js";

const identity = {
  id: true,
  publicId: true,
  externalId: true,
  canonicalUrl: true,
  lastCheckedAt: true,
} as const;
const cardFields = {
  id: true,
  title: true,
  sourceCategory: true,
  category: { select: categorySelect },
  primaryTopic: { select: categorySelect },
  author: true,
  publishedDate: true,
  publicSummary: true,
  audienceText: true,
  points: true,
  pointsText: true,
  tagsJson: true,
  applicationStatus: true,
  gradeScope: true,
  academicScope: true,
  targetGrades: {
    where: { purpose: "REQUIRED" },
    orderBy: { grade: "asc" },
    select: { grade: true, purpose: true },
  },
  targetUnits: {
    where: { purpose: "REQUIRED" },
    orderBy: { academicUnitId: "asc" },
    select: {
      purpose: true,
      academicUnit: { select: { name: true } },
      includeDescendants: true,
    },
  },
  assets: { ...orderedAssets, where: { kind: "IMAGE" as const } },
} as const;
const dateFields = {
  applyStartRaw: true,
  applyStartPrecision: true,
  applyStartDate: true,
  applyStartAt: true,
  applyEndRaw: true,
  applyEndPrecision: true,
  applyEndDate: true,
  applyEndAt: true,
} as const;
const detailFields = {
  ...cardFields,
  ...dateFields,
  assets: orderedAssets,
  department: true,
  applicationPeriodText: true,
  location: true,
  deliveryFormat: true,
  participationMode: true,
  sourceApplicationState: true,
  bodyText: true,
  activityPeriodsJson: true,
  sessions: {
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      ...dateFields,
      id: true,
      sessionKey: true,
      title: true,
      originalUrl: true,
      points: true,
      pointsText: true,
      applicationPeriodText: true,
      activityPeriodsJson: true,
      audienceText: true,
      capacity: true,
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
} satisfies Prisma.ProgramRevisionSelect;

const bookmarkSelect = (userId: bigint | undefined) => ({
  where: { userId: userId ?? 0n },
  select: { createdAt: true, deadlineReminderEnabled: true },
});
export const cardSelect = (userId?: bigint) => ({
  ...identity,
  bookmarks: bookmarkSelect(userId),
  currentRevision: { select: cardFields },
});
export const detailSelect = (userId?: bigint, includeBody = true) => ({
  ...identity,
  bookmarks: bookmarkSelect(userId),
  currentRevision: { select: { ...detailFields, bodyText: includeBody } },
});
type Card = Prisma.ProgramGetPayload<{ select: ReturnType<typeof cardSelect> }>;
type Detail = Prisma.ProgramGetPayload<{
  select: ReturnType<typeof detailSelect>;
}>;

function programUrl(input: string | null, externalId?: string) {
  const u = httpsUrl(input, true);
  if (u?.hostname !== "hsportal.hansung.ac.kr") return null;
  const match = /^\/ko\/program\/[A-Za-z0-9_-]+\/view\/([0-9]+)\/?$/.exec(
    u.pathname,
  );
  if (!match || (externalId !== undefined && match[1] !== externalId))
    return null;
  if (externalId !== undefined) return u.origin + u.pathname;
  // A session selector can be essential. Do not turn an unrecognized session URL
  // into a different, seemingly verified link, or expose opaque tokens.
  for (const [key, value] of u.searchParams)
    if (
      !["session", "sessionId", "session_id", "sessionKey"].includes(key) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(value)
    )
      return null;
  return u.origin + u.pathname + u.search;
}
function tags(raw: unknown) {
  return Array.isArray(raw)
    ? raw.filter((s): s is string => typeof s === "string" && !!s.trim())
    : [];
}
function targetLabel(r: NonNullable<Card["currentRevision"]>) {
  if (r.audienceText?.trim()) return r.audienceText;
  const labels = {
    YEAR_1: "1학년",
    YEAR_2: "2학년",
    YEAR_3: "3학년",
    YEAR_4: "4학년",
    OTHER: "기타 학년",
  };
  const grades =
    r.gradeScope === "ALL"
      ? "전 학년"
      : r.gradeScope === "RESTRICTED"
        ? r.targetGrades
            .filter((t) => t.purpose === "REQUIRED")
            .map((t) => labels[t.grade])
            .join(", ")
        : null;
  const units =
    r.academicScope === "ALL"
      ? "소속 제한 없음"
      : r.academicScope === "RESTRICTED"
        ? r.targetUnits
            .filter((t) => t.purpose === "REQUIRED")
            .map(
              (t) =>
                t.academicUnit.name +
                (t.includeDescendants ? " (하위 소속 포함)" : ""),
            )
            .join(", ")
        : null;
  return [grades, units].filter(Boolean).join(" · ") || null;
}
export function programCard(
  p: Card,
  row: IndexRow,
  loggedIn: boolean,
  personalized: boolean,
) {
  const r = p.currentRevision!;
  return {
    id: p.publicId,
    type: "program" as const,
    externalId: p.externalId,
    title: r.title,
    oneLineSummary: r.publicSummary,
    noticeCategory: null,
    programCategory: r.category,
    primaryTopic: r.primaryTopic,
    sourceCategory: r.sourceCategory,
    author: r.author,
    publishedDate: r.publishedDate?.toISOString().slice(0, 10) ?? null,
    originalUrl: programUrl(p.canonicalUrl, p.externalId),
    applicationStatus: r.applicationStatus,
    ...scheduleView(row),
    benefitSummary:
      textValue(r.pointsText) ??
      (r.points !== null ? r.points.toString() + "pt" : null),
    targetSummary: targetLabel(r),
    thumbnail: thumbnailView(r.assets),
    tags: tags(r.tagsJson),
    summaryStatus: "NOT_APPLICABLE",
    bookmark: bookmarkView(loggedIn, p.bookmarks[0]),
    recommendation: recommendationView(row, personalized),
    lastCheckedAt: p.lastCheckedAt,
  };
}

type Bounds = Pick<ProgramRevision, keyof typeof dateFields>;
function bounds(r: Bounds) {
  return {
    start: boundary(
      r.applyStartRaw,
      r.applyStartPrecision,
      r.applyStartDate,
      r.applyStartAt,
    ),
    end: boundary(
      r.applyEndRaw,
      r.applyEndPrecision,
      r.applyEndDate,
      r.applyEndAt,
    ),
  };
}

const object = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const textValue = (v: unknown) =>
  typeof v === "string" && v.trim() ? v : null;
function activityBoundary(v: unknown) {
  const b = object(v),
    rawText = textValue(b.rawText);
  if (!rawText) return null;
  const value = textValue(b.value),
    date = value?.slice(0, 10);
  const civil =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(date + "T00:00:00Z")
      : null;
  if (
    value &&
    civil &&
    Number.isFinite(civil.getTime()) &&
    civil.toISOString().slice(0, 10) === date
  ) {
    if (b.precision === "date" && value === date)
      return { rawText, precision: "date" as const, value };
    if (
      b.precision === "datetime" &&
      /^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(
        value,
      ) &&
      Number.isFinite(Date.parse(value))
    )
      return {
        rawText,
        precision: "datetime" as const,
        value: new Date(value).toISOString(),
      };
  }
  return { rawText, precision: "unknown" as const, value: null };
}
function activities(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v) => {
    const p = object(v),
      label = textValue(p.label);
    if (!label || p.role === "APPLICATION") return [];
    return [
      {
        id: null,
        role: p.role === "RESULT" || p.role === "OTHER" ? p.role : "ACTIVITY",
        label,
        start: activityBoundary(p.start),
        end: activityBoundary(p.end),
      },
    ];
  });
}
export function programDetail(
  p: Detail,
  row: IndexRow,
  loggedIn: boolean,
  personalized: boolean,
) {
  const r = p.currentRevision!,
    card = programCard(p, row, loggedIn, personalized),
    assets = publicAssets(r.assets);
  const sessions = r.sessions.map((s) => {
    const dates = bounds(s);
    return {
      id: String(s.id),
      sessionKey: s.sessionKey,
      title: s.title,
      originalUrl: programUrl(s.originalUrl),
      applicationPeriodText: s.applicationPeriodText,
      applicationStart: dates.start,
      deadline: dates.end,
      activityPeriods: activities(s.activityPeriodsJson),
      audienceText: s.audienceText,
      points: s.points?.toFixed(2) ?? null,
      pointsText: s.pointsText,
      capacity: s.capacity,
    };
  });
  const root = bounds(r);
  const windows = [
    ...(r.applicationStatus === "stated" && (root.start || root.end)
      ? [
          {
            kind: "program_revision",
            id: String(r.id),
            label: r.title,
            ...root,
          },
        ]
      : []),
    ...(r.applicationStatus !== "not_applicable"
      ? sessions
          .filter((s) => s.applicationStart || s.deadline)
          .map((s) => ({
            kind: "program_session",
            id: s.id,
            label: s.title,
            start: s.applicationStart,
            end: s.deadline,
          }))
      : []),
  ];
  const warnings: { code: string; message: string }[] = [];
  if (!card.originalUrl)
    warnings.push({
      code: "ORIGINAL_URL_UNAVAILABLE",
      message: "확인된 프로그램 원문 링크가 없습니다.",
    });
  if (Number(row.source_conflict))
    warnings.push({
      code: "SOURCE_STATE_CONFLICT",
      message:
        "수집 당시 접수 상태와 신청 일정이 달라 학교 원문 확인이 필요합니다.",
    });
  const periodText =
    r.applicationStatus !== "stated"
      ? null
      : root.start && root.end
        ? root.start.rawText + " ~ " + root.end.rawText
        : root.start
          ? "시작: " + root.start.rawText
          : root.end
            ? "마감: " + root.end.rawText
            : null;
  return {
    card,
    revisionId: String(r.id),
    publicInfo: {
      summary: r.publicSummary,
      audience: card.targetSummary,
      applicationPeriod: textValue(r.applicationPeriodText) ?? periodText,
      points: r.points?.toFixed(2) ?? null,
      pointsText: r.pointsText,
      department: r.department,
      location: r.location,
      format: r.deliveryFormat,
      participationMode: r.participationMode,
      sourceApplicationState: r.sourceApplicationState,
    },
    application: {
      status: r.applicationStatus,
      methods: null,
      periods: windows.map((w) => ({
        id: null,
        role: "APPLICATION",
        label: w.label,
        start: w.start,
        end: w.end,
      })),
      deadlines: windows.flatMap((w) =>
        w.end
          ? [
              {
                reference: { kind: w.kind, id: w.id },
                label: w.label,
                end: w.end,
              },
            ]
          : [],
      ),
    },
    activityPeriods: activities(r.activityPeriodsJson),
    targetRules: publicTargets(r),
    sessions,
    body: r.bodyText?.trim()
      ? {
          id: p.publicId,
          revisionId: String(r.id),
          bodyText: r.bodyText,
          blocks: [{ kind: "text", text: r.bodyText }],
          ...assets,
        }
      : null,
    ...assets,
    warnings,
  };
}
