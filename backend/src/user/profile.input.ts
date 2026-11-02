import { invalid } from "../common/errors.js";
import { enumInput, idInput, objectInput, textInput } from "../common/input.js";
import { GRADES } from "../catalog/academic.js";

const keys = ["name", "grade", "academicUnits", "interestCodes"];
export function profileInput(raw: unknown, full: boolean) {
  const b = objectInput(raw, keys);
  if (!Object.keys(b).length) invalid("body", "변경할 필드가 필요합니다.");
  if (full)
    for (const key of keys)
      if (!Object.hasOwn(b, key)) invalid(key, "필수 필드입니다.", "REQUIRED");
  return {
    name: b.name === undefined ? undefined : textInput(b.name, "name", 30),
    grade:
      b.grade === undefined ? undefined : enumInput(b.grade, GRADES, "grade"),
    units:
      b.academicUnits === undefined ? undefined : unitsInput(b.academicUnits),
    interests:
      b.interestCodes === undefined
        ? undefined
        : interestsInput(b.interestCodes),
  };
}
function unitsInput(raw: unknown) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 3)
    invalid("academicUnits", "소속은 1~3개입니다.");
  const slots = new Set<number>(),
    ids = new Set<bigint>();
  return raw.map((entry, i) => {
    const path = "academicUnits[" + i + "]";
    const u = objectInput(entry, ["slot", "academicUnitId"], path);
    if (typeof u.slot !== "number" || ![1, 2, 3].includes(u.slot))
      invalid(path + ".slot", "슬롯은 1, 2, 3 중 하나입니다.");
    const academicUnitId = idInput(u.academicUnitId, path + ".academicUnitId");
    if (slots.has(u.slot))
      invalid(path + ".slot", "중복 슬롯입니다.", "DUPLICATE");
    if (ids.has(academicUnitId))
      invalid(
        path + ".academicUnitId",
        "같은 소속을 중복 선택할 수 없습니다.",
        "DUPLICATE",
      );
    slots.add(u.slot);
    ids.add(academicUnitId);
    return { slot: u.slot, academicUnitId };
  });
}
function interestsInput(raw: unknown) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 4)
    invalid("interestCodes", "관심 분야는 1~4개입니다.");
  const values = raw.map((v, i) => {
    if (typeof v !== "string" || !/^[a-z][a-z0-9_-]{0,31}$/.test(v))
      invalid("interestCodes[" + i + "]", "관심 분야 코드가 잘못되었습니다.");
    return v;
  });
  if (new Set(values).size !== values.length)
    invalid("interestCodes", "중복 관심 분야입니다.", "DUPLICATE");
  return values;
}
