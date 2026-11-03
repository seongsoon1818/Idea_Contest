import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { Tokens } from "../dist/auth/tokens.js";

// Called before any content is seeded.
export async function emptyHomeContract(t, http) {
  await t.test(
    "H01 guest home with an empty database; query and optional bearer validation",
    async () => {
      const { data } = await http("GET", "/home", 200);
      assert.equal(data.context.mode, "GENERAL");
      assert.equal(data.user, null);
      assert.deepEqual(data.stats, {
        pickCount: 0,
        urgentCount: 0,
        bookmarkCount: null,
        unreadNotificationCount: null,
      });
      assert.deepEqual(data.noticePicks, []);
      assert.deepEqual(data.programPicks, []);
      for (const query of [
        "limitPerType=0",
        "limitPerType=11",
        "limitPerType=1.5",
        "limitPerType=",
        "limitPerType=1&limitPerType=2",
        "userId=1",
        "status=all",
      ])
        await http("GET", "/home?" + query, 400);
      await http("GET", "/home", 401, { token: "invalid" });
    },
  );
}

export async function homeContract(t, app, db, http) {
  const now = new Date(),
    dayMs = 86_400_000;
  const day = (offset) =>
    new Date(
      new Date(now.getTime() + 9 * 3600_000 + offset * dayMs)
        .toISOString()
        .slice(0, 10) + "T00:00:00Z",
    );
  const topic = await db.topic.findUniqueOrThrow({ where: { code: "career" } });
  async function member(loginId, complete) {
    const u = await db.user.create({
      data: {
        loginId,
        name: "홈 회원",
        passwordHash: "!",
        ...(complete
          ? {
              profile: { create: { grade: "YEAR_2", completedAt: now } },
              topics: { create: { topicId: topic.id } },
            }
          : {}),
      },
    });
    const s = await db.userSession.create({
      data: {
        userId: u.id,
        refreshTokenHash: randomBytes(32).toString("hex"),
        expiresAt: new Date(now.getTime() + dayMs),
      },
    });
    return {
      id: u.id,
      token: (await app.get(Tokens).issue(u.id, s.id, s.expiresAt)).accessToken,
    };
  }
  const me = await member("home_profile", true),
    other = await member("home_general", false);
  const home = async (query = "", viewer) =>
    (
      await http(
        "GET",
        "/home" + query,
        200,
        viewer ? { token: viewer.token } : {},
      )
    ).data;
  const ns = await db.source.create({
    data: {
      code: "home_notices",
      kind: "NOTICE",
      name: "공지",
      baseUrl: "https://www.hansung.ac.kr",
      listUrl: "https://www.hansung.ac.kr/list",
    },
  });
  const nc = await db.noticeCategory.findUniqueOrThrow({
    where: { code: "career" },
  });
  const notice = await db.notice.create({
    data: {
      sourceId: ns.id,
      publicId: "home-notice",
      externalId: "101",
      canonicalUrl:
        "https://www.hansung.ac.kr/bbs/hansung/2127/101/artclView.do",
      lastSeenAt: now,
      lastCheckedAt: now,
    },
  });
  const revision = await db.noticeRevision.create({
    data: {
      noticeId: notice.id,
      revisionNo: 1,
      sourceHash: "1".repeat(64),
      contentHash: "2".repeat(64),
      preprocessVersion: "test",
      title: "취업 특강",
      preprocessedJson: {},
      collectedAt: now,
    },
  });
  const summary = await db.noticeSummary.create({
    data: {
      noticeId: notice.id,
      revisionId: revision.id,
      versionNo: 1,
      categoryId: nc.id,
      primaryTopicId: topic.id,
      origin: "HUMAN",
      projectionVersion: "test",
      kind: "general",
      oneLineSummary: "안내",
      summaryJson: [],
      applicationJson: {},
      applicationStatus: "stated",
      validationStatus: "VALID",
      validationIssuesJson: [],
      reviewStatus: "APPROVED",
      reviewedAt: now,
      periods: {
        create: {
          role: "APPLICATION",
          label: "신청",
          sortOrder: 0,
          startRaw: "시작",
          startPrecision: "date",
          startDate: day(-1),
          endRaw: "마감",
          endPrecision: "date",
          endDate: day(1),
        },
      },
    },
  });
  await db.notice.update({
    where: { id: notice.id },
    data: { currentRevisionId: revision.id, publishedSummaryId: summary.id },
  });
  const source = await db.source.create({
    data: {
      code: "home_test",
      kind: "PROGRAM",
      name: "홈",
      baseUrl: "https://hsportal.hansung.ac.kr",
      listUrl: "https://hsportal.hansung.ac.kr/list",
    },
  });
  const cat = await db.programCategory.findUniqueOrThrow({
    where: { code: "other" },
  });
  async function program(id, end, restricted = false, visibility = "PUBLIC") {
    const p = await db.program.create({
      data: {
        sourceId: source.id,
        externalId: id,
        publicId: "home-" + id,
        lastSeenAt: now,
        lastCheckedAt: now,
        visibility,
      },
    });
    const r = await db.programRevision.create({
      data: {
        programId: p.id,
        revisionNo: 1,
        sourceHash: "a".repeat(64),
        contentHash: "b".repeat(64),
        parserVersion: "v1",
        categoryId: cat.id,
        primaryTopicId: topic.id,
        title: p.publicId,
        applicationStatus: "stated",
        applyStartPrecision: "date",
        applyStartRaw: "시작",
        applyStartDate: day(-5),
        applyEndPrecision: "date",
        applyEndRaw: "마감",
        applyEndDate: day(end),
        gradeScope: restricted ? "RESTRICTED" : "UNKNOWN",
        academicScope: "ALL",
        rawMetadataJson: {},
        validationStatus: "VALID",
        validationIssuesJson: [],
        collectedAt: now,
        ...(restricted
          ? {
              targetGrades: {
                create: { grade: "YEAR_4", purpose: "REQUIRED", basisJson: {} },
              },
            }
          : {}),
      },
    });
    await db.program.update({
      where: { id: p.id },
      data: { currentRevisionId: r.id },
    });
    return { id: p.id, revisionId: r.id, end: day(end) };
  }
  for (let i = 0; i < 7; i++) await program("ongoing-" + i, 7);
  const beforeGuest = await home(),
    beforeMe = await home("", me);
  assert.equal(beforeGuest.programPicks.length, 6);
  assert.equal((await home("?limitPerType=10")).programPicks.length, 7);
  const today = await program("d0", 0),
    lastUrgent = await program("d3", 3),
    later = await program("d4", 4),
    restricted = await program("mismatch", 2, true);
  const closed = await program("closed", -1),
    hidden = await program("hidden", 1, false, "HIDDEN");

  await t.test(
    "H01 total and D-0 through D-3 counts use all open candidates independently of limit",
    async () => {
      const guest = await home("?limitPerType=1"),
        personal = await home("?limitPerType=1", me);
      assert.equal(guest.stats.pickCount - beforeGuest.stats.pickCount, 4);
      assert.equal(guest.stats.urgentCount - beforeGuest.stats.urgentCount, 3);
      assert.equal(personal.stats.pickCount - beforeMe.stats.pickCount, 3);
      assert.equal(personal.stats.urgentCount - beforeMe.stats.urgentCount, 2);
      assert.equal(guest.noticePicks.length, 1);
      assert.equal(guest.programPicks.length, 1);
      assert.deepEqual(
        (await home("?limitPerType=10", me)).stats,
        personal.stats,
      );
      assert.equal(personal.stats.bookmarkCount, 0);
      assert.equal(personal.stats.unreadNotificationCount, 0);
    },
  );
  await t.test(
    "H01 cards and counts match R01 for guest, incomplete and personalized profiles",
    async () => {
      for (const viewer of [undefined, other, me]) {
        const data = await home("", viewer),
          options = viewer ? { token: viewer.token } : {};
        const rec = async (query) =>
          (await http("GET", "/recommendations?" + query, 200, options)).data;
        const notices = await rec("type=notice&size=6"),
          programs = await rec("type=program&size=6"),
          urgent = await rec("deadlineWithinDays=3&size=1");
        assert.deepEqual(data.noticePicks, notices.items);
        assert.deepEqual(data.programPicks, programs.items);
        assert.equal(
          data.stats.pickCount,
          notices.pagination.totalItems + programs.pagination.totalItems,
        );
        assert.equal(data.stats.urgentCount, urgent.pagination.totalItems);
        assert.equal(
          data.context.mode,
          viewer === me ? "PERSONALIZED" : "GENERAL",
        );
        assert.equal(data.context.profileCompleted, viewer === me);
        if (viewer) {
          assert.equal(data.user.id, String(viewer.id));
          assert.equal(
            data.user.profileCompleted,
            data.context.profileCompleted,
          );
          assert.deepEqual(Object.keys(data.user).sort(), [
            "createdAt",
            "id",
            "loginId",
            "name",
            "profileCompleted",
            "role",
          ]);
        } else assert.equal(data.user, null);
      }
    },
  );
  await t.test(
    "H01 MY PICK includes saved hidden/closed items; unread count matches T08 and stays owner scoped",
    async () => {
      await db.userNoticeBookmark.create({
        data: { userId: me.id, noticeId: notice.id },
      });
      await db.userProgramBookmark.createMany({
        data: [closed, hidden].map((p) => ({ userId: me.id, programId: p.id })),
      });
      await db.userProgramBookmark.create({
        data: { userId: other.id, programId: later.id },
      });
      async function notify(userId, p, flags) {
        const scheduledAt = new Date(p.end.getTime() - dayMs);
        const reminder = await db.deadlineReminder.create({
          data: {
            userId,
            programId: p.id,
            programRevisionId: p.revisionId,
            dedupKey: createHash("sha256")
              .update(
                JSON.stringify([
                  "APPLICATION_DEADLINE_D1",
                  "PROGRAM",
                  String(p.id),
                  "date",
                  p.end.toISOString().slice(0, 10),
                ]),
              )
              .digest("hex"),
            policyVersion: "deadline-d1-v1",
            deadlinePrecision: "date",
            deadlineDate: p.end,
            sourceRefsJson: [
              { kind: "PROGRAM_ROOT", id: String(p.revisionId), label: "모집" },
            ],
            scheduledAt,
            nextAttemptAt: scheduledAt,
            deliverBefore: new Date(scheduledAt.getTime() + 3600_000),
            status: "COMPLETED",
            completedAt: now,
          },
        });
        await db.notification.create({
          data: {
            reminderId: reminder.id,
            userId,
            title: "마감",
            body: "확인",
            createdAt: now,
            inAppVisible: true,
            ...flags,
          },
        });
      }
      await notify(me.id, today, {});
      await notify(me.id, lastUrgent, { hiddenAt: now });
      await notify(me.id, later, { readAt: now });
      await notify(me.id, restricted, { invalidatedAt: now });
      await notify(me.id, closed, { inAppVisible: false });
      await notify(other.id, today, {});
      await notify(other.id, lastUrgent, {});
      for (const [viewer, saved, unread] of [
        [me, 3, 1],
        [other, 1, 2],
      ]) {
        const { stats } = await home("", viewer),
          options = { token: viewer.token };
        const bookmarks = async (type) =>
          (
            await http(
              "GET",
              "/users/me/bookmarks/" + type + "?size=1",
              200,
              options,
            )
          ).data.savedTotal;
        assert.equal(stats.bookmarkCount, saved);
        assert.equal(
          stats.bookmarkCount,
          (await bookmarks("notice")) + (await bookmarks("program")),
        );
        assert.equal(stats.unreadNotificationCount, unread);
        assert.equal(
          stats.unreadNotificationCount,
          (
            await http(
              "GET",
              "/users/me/notifications/unread-count",
              200,
              options,
            )
          ).data.count,
        );
      }
      const { stats } = await home();
      assert.equal(stats.bookmarkCount, null);
      assert.equal(stats.unreadNotificationCount, null);
    },
  );
}
