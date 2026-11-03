import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Tokens } from "../dist/auth/tokens.js";

export async function bookmarkContract(t, app, db, http) {
  const now = new Date(),
    day = 86400_000;
  const futureDate = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  futureDate.setUTCDate(futureDate.getUTCDate() + 6);
  const futureAt = new Date(now.getTime() + 4 * day + 123);
  async function viewer(suffix) {
    const user = await db.user.create({
      data: {
        loginId: "bookmark" + suffix,
        name: "회원",
        passwordHash: "!",
        notificationSettings: { create: {} },
      },
    });
    const session = await db.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: createHash("sha256")
          .update("bookmark" + suffix)
          .digest("hex"),
        expiresAt: new Date(now.getTime() + day),
      },
    });
    const { accessToken: token } = await app
      .get(Tokens)
      .issue(user.id, session.id, session.expiresAt);
    return { id: user.id, token };
  }
  const me = await viewer("a"),
    other = await viewer("b");
  const source = async (kind, host) =>
    db.source.create({
      data: {
        kind,
        code: "bk_" + kind,
        name: kind,
        baseUrl: host,
        listUrl: host + "/list",
      },
    });
  const ns = await source("NOTICE", "https://www.hansung.ac.kr"),
    ps = await source("PROGRAM", "https://hsportal.hansung.ac.kr");
  async function notice(publicId, title, withDeadline) {
    const n = await db.notice.create({
      data: {
        sourceId: ns.id,
        externalId: publicId,
        publicId,
        canonicalUrl: "https://www.hansung.ac.kr/" + publicId,
        lastSeenAt: now,
        lastCheckedAt: now,
      },
    });
    const rev = await db.noticeRevision.create({
      data: {
        noticeId: n.id,
        revisionNo: 1,
        sourceHash: "a".repeat(64),
        contentHash: "b".repeat(64),
        preprocessVersion: "test",
        title,
        preprocessedJson: {},
        collectedAt: now,
      },
    });
    const cat = await db.noticeCategory.findUniqueOrThrow({
      where: { code: "career" },
    });
    const summary = await db.noticeSummary.create({
      data: {
        noticeId: n.id,
        revisionId: rev.id,
        categoryId: cat.id,
        versionNo: 1,
        origin: "HUMAN",
        projectionVersion: "test",
        kind: "general",
        oneLineSummary: title,
        summaryJson: [],
        applicationStatus: withDeadline ? "stated" : "not_applicable",
        applicationJson: {},
        validationStatus: "VALID",
        validationIssuesJson: [],
        reviewStatus: "APPROVED",
        reviewedAt: now,
      },
    });
    const endRaw = futureDate.toISOString().slice(0, 10);
    if (withDeadline) {
      await db.noticePeriod.createMany({
        data: ["APPLICATION", "ACTIVITY"].map((role) => ({
          summaryId: summary.id,
          role,
          label: role,
          sortOrder: 0,
          startRaw: "today",
          startPrecision: "date",
          startDate: now,
          endPrecision: "date",
          endRaw,
          endDate:
            role === "APPLICATION"
              ? futureDate
              : new Date(futureDate.getTime() + day),
        })),
      });
      await db.noticeItem.create({
        data: {
          summaryId: summary.id,
          sortOrder: 0,
          title: "추가 경로",
          deadlineRaw: endRaw,
          deadlinePrecision: "date",
          deadlineDate: futureDate,
          evidenceJson: [],
        },
      });
    }
    await db.notice.update({
      where: { id: n.id },
      data: { currentRevisionId: rev.id, publishedSummaryId: summary.id },
    });
    return { ...n, summary };
  }
  const n = await notice("bk-notice", "MY PICK 채용 설명회", true),
    extra = await notice("bk-other", "학사 안내", false);
  const p = await db.program.create({
    data: {
      sourceId: ps.id,
      externalId: "bk-prog",
      publicId: "bk-program",
      lastSeenAt: now,
      lastCheckedAt: now,
    },
  });
  const cat = await db.programCategory.findUniqueOrThrow({
    where: { code: "other" },
  });
  const r = await db.programRevision.create({
    data: {
      programId: p.id,
      revisionNo: 1,
      sourceHash: "a".repeat(64),
      contentHash: "b".repeat(64),
      parserVersion: "test",
      categoryId: cat.id,
      title: "MY PICK 워크숍",
      points: 10,
      rawMetadataJson: {},
      collectedAt: now,
      validationStatus: "VALID",
      validationIssuesJson: [],
      applicationStatus: "stated",
      applyEndPrecision: "datetime",
      applyEndRaw: futureAt.toISOString(),
      applyEndAt: futureAt,
    },
  });
  await db.programSession.create({
    data: {
      revisionId: r.id,
      sessionKey: "1",
      title: "회차",
      sortOrder: 0,
      rawMetadataJson: {},
      applyEndPrecision: "datetime",
      applyEndRaw: futureAt.toISOString(),
      applyEndAt: futureAt,
    },
  });
  await db.program.update({
    where: { id: p.id },
    data: { currentRevisionId: r.id },
  });
  const base = "/users/me/bookmarks",
    nt = "/notices/" + n.publicId,
    pt = "/programs/" + p.publicId,
    et = "/notices/" + extra.publicId;
  const call = async (method, path, code = 200, body, user = me) =>
    (await http(method, base + path, code, { token: user.token, body })).data;
  const toggle = (v) => ({ deadlineReminderEnabled: v });
  const nwhere = { userId: me.id, noticeId: n.id },
    pwhere = { userId: me.id, programId: p.id };

  await t.test(
    "B01–B08 require a member and validate path, body and per-tab queries",
    async () => {
      for (const [method, path] of [
        ["GET", "/notice"],
        ["GET", "/program"],
        ...["PUT", "PATCH", "DELETE"].flatMap((v) => [
          [v, nt],
          [v, pt],
        ]),
      ])
        await http(method, base + path, 401);
      await call("GET", "/notice?programCategory=other", 400);
      await call("GET", "/program?type=all", 400);
      await call("GET", "/notice?sort=bogus", 400);
      await call("GET", "/program?recommendedOnly=true", 409);
      await call("PUT", nt, 400, {});
      await call("PUT", "/programs/bad!", 400);
      await call("PUT", "/programs/bk-missing", 404);
      await call("PATCH", nt, 404, toggle(false));
      for (const body of [
        {},
        toggle("true"),
        { ...toggle(false), userId: "1" },
      ])
        await call("PATCH", pt, 400, body);
      assert.deepEqual((await call("GET", "/program")).items, []);
    },
  );
  await t.test(
    "saving is idempotent and reserves only distinct confirmed D-1 deadlines in both domains",
    async () => {
      const [a, b] = await Promise.all([call("PUT", nt), call("PUT", nt)]);
      assert.deepEqual(a, b);
      assert.equal(a.reminder.state, "SCHEDULED");
      assert.equal(
        a.reminder.nextScheduledAt,
        new Date(futureDate.getTime() - day).toISOString(),
      );
      const program = await call("PUT", pt);
      assert.equal(
        program.reminder.nextScheduledAt,
        new Date(futureAt.getTime() - day).toISOString(),
      );
      assert.equal(
        (await call("PUT", et)).reminder.state,
        "NO_CONFIRMED_DEADLINE",
      );
      for (const [where, k, value] of [
        [nwhere, "NOTICE", futureDate.toISOString().slice(0, 10)],
        [pwhere, "PROGRAM", futureAt.toISOString()],
      ]) {
        const jobs = await db.deadlineReminder.findMany({ where });
        assert.equal(jobs.length, 1);
        const [h] = jobs;
        assert.equal(h.sourceRefsJson.length, 2);
        assert.equal(
          h.deliverBefore.getTime() - h.scheduledAt.getTime(),
          3_600_000,
        );
        assert.equal(
          h.dedupKey,
          createHash("sha256")
            .update(
              JSON.stringify([
                "APPLICATION_DEADLINE_D1",
                k,
                String(h.noticeId ?? h.programId),
                h.deadlinePrecision,
                value,
              ]),
            )
            .digest("hex"),
        );
      }
      await call("PUT", nt, 200, undefined, other);
      assert.equal(
        (await call("GET", "/program", 200, undefined, other)).savedTotal,
        0,
      );
    },
  );
  await t.test(
    "MY PICK counts, filters, saved sorting, pagination and hidden placeholders match the selected tab",
    async () => {
      const first = await call("GET", "/notice?size=1");
      assert.equal(first.savedTotal, 2);
      assert.equal(first.pagination.totalItems, 2);
      assert.equal(first.items[0].content.id, extra.publicId);
      assert.equal(first.items[0].content.bookmark.saved, true);
      const next = await call("GET", "/notice?size=1&page=2");
      assert.equal(next.items[0].content.id, n.publicId);
      assert.equal(next.items[0].reminder.state, "SCHEDULED");
      for (const sort of ["saved", "deadline", "recommended", "latest"]) {
        const filtered = await call(
          "GET",
          "/notice?status=open&noticeCategory=career&q=MY&sort=" + sort,
        );
        assert.equal(filtered.pagination.totalItems, 1);
        assert.equal(filtered.savedTotal, 2);
        assert.equal(filtered.items[0].content.id, n.publicId);
      }
      const programs = await call(
        "GET",
        "/program?programCategory=other&q=10pt",
      );
      assert.equal(programs.items[0].content.benefitSummary, "10pt");
      assert.equal(programs.savedTotal, 1);
      await db.notice.update({
        where: { id: extra.id },
        data: { visibility: "HIDDEN" },
      });
      const hidden = (await call("GET", "/notice?size=1")).items[0];
      assert.equal(hidden.availability, "UNAVAILABLE");
      assert.equal(hidden.content, null);
      assert.equal(hidden.contentRef.id, extra.publicId);
      assert.equal(
        (await call("GET", "/notice?q=" + encodeURIComponent("학사")))
          .pagination.totalItems,
        0,
      );
      await call("PUT", et, 404);
      await call("PATCH", et, 200, toggle(false));
      await call("DELETE", et);
      assert.equal(
        (await call("GET", "/notice?page=99")).pagination.totalItems,
        1,
      );
    },
  );
  await t.test(
    "B05/B08 cancel leases and outbox, preserve other users, reactivate the same job and never resend completed events",
    async () => {
      const old = await db.deadlineReminder.findFirstOrThrow({ where: nwhere });
      await db.deadlineReminder.update({
        where: { id: old.id },
        data: {
          status: "PROCESSING",
          lockToken: "a".repeat(36),
          lockedUntil: futureAt,
        },
      });
      const disabled = await call("PATCH", nt, 200, toggle(false));
      assert.equal(disabled.reminder.state, "DISABLED");
      assert.deepEqual(await call("PUT", nt), disabled);
      assert.deepEqual(await call("PATCH", nt, 200, toggle(false)), disabled);
      const cancelled = await db.deadlineReminder.findUniqueOrThrow({
        where: { id: old.id },
      });
      assert.equal(cancelled.status, "CANCELLED");
      assert.equal(cancelled.lockToken, null);
      assert.equal(
        await db.deadlineReminder.count({
          where: { userId: other.id, noticeId: n.id, status: "PENDING" },
        }),
        1,
      );
      assert.equal(
        (await call("PATCH", nt, 200, toggle(true))).reminder.state,
        "SCHEDULED",
      );
      assert.equal(await db.deadlineReminder.count({ where: nwhere }), 1);
      const job = await db.deadlineReminder.findFirstOrThrow({ where: pwhere });
      await db.deadlineReminder.update({
        where: { id: job.id },
        data: { status: "COMPLETED", completedAt: now },
      });
      const notif = await db.notification.create({
        data: {
          userId: me.id,
          reminderId: job.id,
          title: "test",
          body: "test",
          inAppVisible: true,
        },
      });
      const sub = await db.webPushSubscription.create({
        data: {
          userId: me.id,
          endpoint: "https://push.example/test",
          endpointHash: "d".repeat(64),
          p256dh: "test",
          auth: "test",
          lastSeenAt: now,
        },
      });
      const push = await db.notificationPushDelivery.create({
        data: {
          notificationId: notif.id,
          userId: me.id,
          subscriptionId: sub.id,
          status: "PROCESSING",
          lockToken: "b".repeat(36),
          lockedUntil: futureAt,
          nextAttemptAt: now,
        },
      });
      assert.equal(
        (await call("PATCH", pt, 200, toggle(false))).reminder.state,
        "DISABLED",
      );
      const stopped = await db.notificationPushDelivery.findUniqueOrThrow({
        where: { id: push.id },
      });
      assert.equal(stopped.status, "CANCELLED");
      assert.equal(stopped.lockToken, null);
      const removed = await call("DELETE", pt);
      assert.equal(removed.reminder.state, "NONE");
      assert.equal(removed.savedAt, null);
      assert.deepEqual(await call("DELETE", pt), removed);
      assert.equal((await call("PUT", pt)).reminder.state, "ALREADY_NOTIFIED");
      assert.equal(
        await db.notification.count({
          where: { id: notif.id, invalidatedAt: null },
        }),
        1,
      );
      await call("DELETE", nt);
      assert.equal(
        await db.deadlineReminder.count({
          where: { ...nwhere, status: "CANCELLED" },
        }),
        1,
      );
      await call("DELETE", "/notices/nonexistent");
      await call("PATCH", nt, 404, toggle(true));
    },
  );
  await t.test(
    "no active channel, unreviewed source and past schedule never create a new D-1 job",
    async () => {
      await db.userNotificationSettings.update({
        where: { userId: me.id },
        data: { deadlineInAppEnabled: false },
      });
      assert.equal((await call("PUT", nt)).reminder.state, "NO_ACTIVE_CHANNEL");
      await db.userNotificationSettings.update({
        where: { userId: me.id },
        data: { deadlinePushEnabled: true },
      });
      assert.equal(
        (await call("PATCH", nt, 200, toggle(true))).reminder.state,
        "SCHEDULED",
      );
      await db.webPushSubscription.updateMany({
        where: { userId: me.id },
        data: { expirationAt: now },
      });
      assert.equal(
        (await call("PATCH", nt, 200, toggle(true))).reminder.state,
        "NO_ACTIVE_CHANNEL",
      );
      await db.userNotificationSettings.update({
        where: { userId: me.id },
        data: { deadlineInAppEnabled: true },
      });
      await db.notice.update({
        where: { id: n.id },
        data: { publishedSummaryId: null },
      });
      assert.equal(
        (await call("PATCH", nt, 200, toggle(true))).reminder.state,
        "AWAITING_REVIEW",
      );
      await db.programRevision.update({
        where: { id: r.id },
        data: { applyEndAt: new Date(now.getTime() + 12 * 3600_000) },
      });
      await db.programSession.deleteMany({ where: { revisionId: r.id } });
      assert.equal(
        (await call("PATCH", pt, 200, toggle(true))).reminder.state,
        "TOO_LATE",
      );
      assert.equal(
        await db.deadlineReminder.count({
          where: { ...pwhere, status: "PENDING" },
        }),
        0,
      );
    },
  );
}
