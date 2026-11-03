import { programCards } from "./program.cards.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { MatchingProfile } from "../content/matching-profile.js";
import { Injectable } from "@nestjs/common";
import { ApiError, invalid } from "../common/errors.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { contentQuery } from "../content/content.query.js";
import { listProfile, pageResponse } from "../content/content.page.js";
import { matchingProfile } from "../content/matching-profile.js";
import { readProgramIndex } from "./program.index.js";
import { detailSelect, programDetail } from "./program.view.js";

export async function readProgramDetail(
  tx: Prisma.TransactionClient,
  publicId: string,
  userId: bigint | undefined,
  profile: MatchingProfile | null,
  now: Date,
  includeBody = true,
) {
  const {
    rows: [row],
  } = await readProgramIndex(
    tx,
    contentQuery({ status: "all" }, "programCategory"),
    profile,
    now,
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
    select: detailSelect(userId, includeBody),
  });
  return programDetail(p, row, userId !== undefined, !!profile);
}

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
        const items = await programCards(tx, rows, userId, !!profile);
        return pageResponse(items, total, q, !!profile, now);
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
        return readProgramDetail(tx, publicId, userId, profile, new Date());
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
}
