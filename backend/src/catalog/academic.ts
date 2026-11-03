import type {
  AcademicUnit,
  AcademicUnitKind,
  GradeCode,
} from "../generated/prisma/client.js";

export const GRADES = [
  "YEAR_1",
  "YEAR_2",
  "YEAR_3",
  "YEAR_4",
  "OTHER",
] as const;
export const KINDS = ["COLLEGE", "DEPARTMENT", "TRACK"] as const;
export function selectable(
  grade: GradeCode,
  slot: number,
  kind: AcademicUnitKind,
) {
  if (grade === "YEAR_1") return slot === 1 && kind !== "TRACK";
  return slot === 1 || ((slot === 2 || slot === 3) && kind !== "COLLEGE");
}
export function academicView(row: AcademicUnit) {
  return {
    id: String(row.id),
    code: row.code,
    name: row.name,
    kind: row.kind,
    parentId: row.parentId?.toString() ?? null,
    aliases: Array.isArray(row.aliasesJson)
      ? row.aliasesJson.filter((s): s is string => typeof s === "string")
      : [],
    note: row.note,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}
export const categorySelect = {
  code: true,
  name: true,
  sortOrder: true,
} as const;
