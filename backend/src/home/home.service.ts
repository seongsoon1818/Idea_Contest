import { Injectable } from "@nestjs/common";
import { revoked, disabled } from "../common/errors.js";
import { homePickIndex } from "../content/content.index.js";
import { contentContext } from "../content/content.page.js";
import { integerQuery } from "../content/content.query.js";
import { matchingProfile } from "../content/matching-profile.js";
import { noticeCards } from "../notice/notice.cards.js";
import { noticeSources } from "../notice/notice.index.js";
import { unreadCount } from "../notification/inbox.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { programCards } from "../program/program.cards.js";
import { programSources } from "../program/program.index.js";
import { recommendationQuery } from "../recommendation/recommendation.input.js";
import { userSelect, userView } from "../user/user.view.js";

@Injectable()
export class HomeService {
  constructor(private readonly db: PrismaService) {}
  get(rawLimit: string | undefined, userId?: bigint) {
    const limit = integerQuery(rawLimit, "limitPerType", 6, 1, 10);
    return this.db.$transaction(
      async (tx) => {
        const now = new Date();
        const user =
          userId === undefined
            ? null
            : await tx.user.findUnique({
                where: { id: userId },
                select: {
                  ...userSelect,
                  status: true,
                  _count: {
                    select: { noticeBookmarks: true, programBookmarks: true },
                  },
                },
              });
        if (userId !== undefined && !user) throw revoked();
        if (user && user.status !== "ACTIVE") throw disabled();
        const profile = await matchingProfile(tx, userId);
        const query = {
          ...recommendationQuery({}).q,
          size: limit,
          recommendedOnly: profile !== null,
        };
        const notices = await homePickIndex(
          tx,
          query,
          profile,
          now,
          noticeSources(query),
        );
        const programs = await homePickIndex(
          tx,
          query,
          profile,
          now,
          programSources(query),
        );
        return {
          context: contentContext(!!profile, now),
          user: user ? userView(user) : null,
          stats: {
            pickCount: notices.total + programs.total,
            urgentCount: notices.urgent + programs.urgent,
            bookmarkCount: user
              ? user._count.noticeBookmarks + user._count.programBookmarks
              : null,
            unreadNotificationCount: user
              ? await unreadCount(tx, user.id)
              : null,
          },
          noticePicks: await noticeCards(tx, notices.rows, userId, !!profile),
          programPicks: await programCards(
            tx,
            programs.rows,
            userId,
            !!profile,
          ),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
}
