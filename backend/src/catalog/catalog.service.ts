import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { enumInput, idInput, textInput } from "../common/input.js";
import { invalid } from "../common/errors.js";
import {
  academicView,
  categorySelect,
  GRADES,
  KINDS,
  selectable,
} from "./academic.js";

@Injectable()
export class CatalogService {
  constructor(private readonly db: PrismaService) {}
  async units(params: Record<string, string>) {
    const { q, kind, parentId, grade, slot } = params;
    if ((grade === undefined) !== (slot === undefined))
      invalid("slot", "학년과 슬롯은 함께 지정하세요.");
    const g =
      grade === undefined ? undefined : enumInput(grade, GRADES, "grade");
    const s =
      slot === undefined
        ? undefined
        : Number(enumInput(slot, ["1", "2", "3"] as const, "slot"));
    if (g === "YEAR_1" && s !== 1)
      invalid("slot", "1학년은 1번 슬롯만 선택합니다.");
    const term =
      q === undefined ? undefined : textInput(q, "q", 100).toLowerCase();
    const rows = await this.db.academicUnit.findMany({
      where: {
        isActive: true,
        ...(kind !== undefined ? { kind: enumInput(kind, KINDS, "kind") } : {}),
        ...(parentId !== undefined
          ? { parentId: idInput(parentId, "parentId") }
          : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return {
      items: rows
        .map(academicView)
        .filter(
          (unit) =>
            (!g || selectable(g, s!, unit.kind)) &&
            (!term ||
              [unit.name, ...unit.aliases].some((s) =>
                s.toLowerCase().includes(term),
              )),
        ),
    };
  }
  async categories(kind: "topic" | "noticeCategory" | "programCategory") {
    const options = {
      where: { isActive: true },
      select: categorySelect,
      orderBy: [{ sortOrder: "asc" as const }, { code: "asc" as const }],
    };
    const items =
      kind === "topic"
        ? await this.db.topic.findMany(options)
        : kind === "noticeCategory"
          ? await this.db.noticeCategory.findMany(options)
          : await this.db.programCategory.findMany(options);
    return { items };
  }
}
