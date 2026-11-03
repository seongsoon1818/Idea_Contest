import { Injectable } from "@nestjs/common";
import { ApiError, invalid } from "../common/errors.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { contentQuery } from "../content/content.query.js";
import { listProfile, pageResponse } from "../content/content.page.js";
import { matchingProfile } from "../content/matching-profile.js";
import { readProgramIndex } from "./program.index.js";
import {
  cardSelect,
  detailSelect,
  programCard,
  programDetail,
} from "./program.view.js";

@Injectable()
export class ProgramService {
  constructor(private readonly db: PrismaService) {}
  async list(params: Record<string, string>, userId?: bigint) {
    const q = contentQuery(params, "programCategory");
    return this.db.$transaction(
      async (tx) => {
        const profile = await listProfile(tx, q, "program", userId),
          now = new Date();
        const { rows, total } = await readProgramIndex(tx, q, profile, now);
        const programs = rows.length
          ? await tx.program.findMany({
              where: { id: { in: rows.map((r) => r.id) } },
              select: cardSelect(userId),
            })
          : [];
        const byId = new Map(programs.map((p) => [p.id, p]));
        return pageResponse(
          rows.map((r) =>
            programCard(byId.get(r.id)!, r, userId !== undefined, !!profile),
          ),
          total,
          q,
          !!profile,
          now,
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async detail(publicId: string, userId?: bigint) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(publicId))
      invalid("programId", "프로그램 publicId 형식이 잘못되었습니다.");
    return this.db.$transaction(
      async (tx) => {
        const profile = await matchingProfile(tx, userId);
        const {
          rows: [row],
        } = await readProgramIndex(
          tx,
          contentQuery({ status: "all" }, "programCategory"),
          profile,
          new Date(),
          publicId,
        );
        if (!row)
          throw new ApiError(
            404,
            "RESOURCE_NOT_FOUND",
            "프로그램을 찾을 수 없습니다.",
          );
        const p = await tx.program.findUniqueOrThrow({
          where: { id: row.id },
          select: detailSelect(userId),
        });
        return programDetail(p, row, userId !== undefined, !!profile);
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
}
