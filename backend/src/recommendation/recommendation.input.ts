import { invalid } from "../common/errors.js";
import { enumInput, objectInput } from "../common/input.js";
import { contentQuery, contentQueryKeys } from "../content/content.query.js";

export const queryKeys = [
  ...contentQueryKeys("noticeCategory").filter(
    (key) => key !== "recommendedOnly",
  ),
  "programCategory",
  "type",
];
export function recommendationQuery(params: Record<string, string>) {
  const type = enumInput(
    params.type ?? "all",
    ["notice", "program", "all"] as const,
    "type",
  );
  if (params.noticeCategory !== undefined && type !== "notice")
    invalid("noticeCategory", "공지 탭에서만 사용할 수 있습니다.");
  if (params.programCategory !== undefined && type !== "program")
    invalid("programCategory", "프로그램 탭에서만 사용할 수 있습니다.");
  const q = contentQuery(
    { ...params, sort: params.sort ?? "recommended" },
    type === "program" ? "programCategory" : "noticeCategory",
  );
  return { type, q };
}
export function comparisonItems(raw: unknown) {
  const { items } = objectInput(raw, ["items"]);
  if (!Array.isArray(items) || items.length < 2 || items.length > 3)
    invalid("items", "비교할 공지 또는 프로그램을 2~3개 선택하세요.");
  const seen = new Set<string>();
  return items.map((item, i) => {
    const path = "items[" + i + "]",
      ref = objectInput(item, ["type", "id"], path);
    const type = enumInput(
        ref.type,
        ["notice", "program"] as const,
        path + ".type",
      ),
      id = ref.id;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id))
      invalid(path + ".id", "콘텐츠 publicId 형식이 잘못되었습니다.");
    const key = type + ":" + id;
    if (seen.has(key))
      invalid(path, "같은 항목을 중복 선택할 수 없습니다.", "DUPLICATE");
    seen.add(key);
    return { type, id };
  });
}
