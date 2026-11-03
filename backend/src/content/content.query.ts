import { invalid } from "../common/errors.js";
import { enumInput, textInput } from "../common/input.js";

type CategoryKey = "noticeCategory" | "programCategory";
export const contentQueryKeys = (categoryKey: CategoryKey) => [
  "page",
  "size",
  "q",
  "status",
  "sort",
  "topic",
  categoryKey,
  "recommendedOnly",
  "deadlineWithinDays",
];
const statuses = [
  "open",
  "upcoming",
  "closed",
  "unknown",
  "not_applicable",
  "all",
] as const;
export type RecruitmentStatus = Exclude<(typeof statuses)[number], "all">;
export function integerQuery(
  v: string | undefined,
  field: string,
  fallback: number,
  min: number,
  max: number,
) {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!/^[0-9]+$/.test(v) || !Number.isSafeInteger(n) || n < min || n > max)
    invalid(field, "허용 범위의 정수가 필요합니다.");
  return n;
}
export function contentQuery(
  p: Record<string, string>,
  categoryKey: CategoryKey,
  bookmarks = false,
) {
  const status = enumInput(
    p.status ?? (bookmarks ? "all" : "open"),
    statuses,
    "status",
  );
  if (p.deadlineWithinDays !== undefined && status !== "open")
    invalid("deadlineWithinDays", "모집중 필터와 함께 사용하세요.");
  return {
    page: integerQuery(p.page, "page", 1, 1, Number.MAX_SAFE_INTEGER),
    size: integerQuery(p.size, "size", 20, 1, 100),
    q: p.q === undefined ? null : textInput(p.q, "q", 100),
    topic: p.topic === undefined ? null : textInput(p.topic, "topic", 32),
    category:
      p[categoryKey] === undefined
        ? null
        : textInput(p[categoryKey], categoryKey, 32),
    status,
    sort: enumInput(
      p.sort ?? (bookmarks ? "saved" : "latest"),
      bookmarks
        ? (["saved", "latest", "deadline", "recommended"] as const)
        : (["latest", "deadline", "recommended"] as const),
      "sort",
    ),
    recommendedOnly:
      enumInput(
        p.recommendedOnly ?? "false",
        ["true", "false"] as const,
        "recommendedOnly",
      ) === "true",
    days:
      p.deadlineWithinDays === undefined
        ? null
        : integerQuery(p.deadlineWithinDays, "deadlineWithinDays", 0, 0, 30),
  };
}
export type ContentQuery = ReturnType<typeof contentQuery>;
