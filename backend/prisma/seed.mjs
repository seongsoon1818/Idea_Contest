import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { PrismaService } from "../dist/prisma/prisma.service.js";

const data = JSON.parse(
  await readFile(new URL("./catalog-data.json", import.meta.url), "utf8"),
);

// Codes in the checked-in snapshot are immutable, even if a display name or order changes.
// Existing rows (including administrative edits/deactivations) are intentionally not overwritten.
export async function seedCatalog(db) {
  await db.$transaction(
    async (tx) => {
      for (const [model, values] of [
        [tx.topic, data.topics],
        [tx.noticeCategory, data.noticeCategories],
        [tx.programCategory, data.programCategories],
      ]) {
        for (const [sortOrder, [code, name]] of values.entries()) {
          await model.upsert({
            where: { code },
            create: { code, name, sortOrder },
            update: {},
          });
        }
      }
      const ids = new Map();
      for (const [sortOrder, unit] of data.academicUnits.entries()) {
        const parentId = unit.parent === null ? null : ids.get(unit.parent);
        if (parentId === undefined)
          throw new Error("Missing parent for " + unit.code);
        const row = await tx.academicUnit.upsert({
          where: { code: unit.code },
          create: {
            code: unit.code,
            name: unit.name,
            kind: unit.kind,
            note: unit.note ?? null,
            parentId,
            sortOrder,
          },
          update: {},
          select: { id: true },
        });
        ids.set(unit.code, row.id);
      }
    },
    { timeout: 60000 },
  );
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const db = new PrismaService();
  try {
    await seedCatalog(db);
    console.log("카탈로그 초기화 완료");
  } finally {
    await db.$disconnect();
  }
}
