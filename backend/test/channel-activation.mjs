import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import { NotificationWorker } from "../dist/notification/notification.worker.js";
import { PushTransport } from "../dist/notification/push.js";

export async function channelActivationContract(t, app, db, http) {
  const day = 86_400_000;
  // A date-only deadline fires at UTC midnight (09:00 in Seoul); the program uses an exact time.
  const d1 =
    Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z") + day;
  t.mock.timers.enable({ apis: ["Date"], now: d1 - 2000 });
  const now = new Date(),
    end = new Date(d1 + day);
  const worker = app.get(NotificationWorker);
  const payloads = [];
  app.get(PushTransport).send = async (_sub, payload) => {
    payloads.push(JSON.parse(payload));
    return { statusCode: 201 };
  };
  const source = await db.source.create({
    data: {
      code: "activate_prog",
      kind: "PROGRAM",
      name: "비교과",
      baseUrl: "https://hsportal.hansung.ac.kr",
      listUrl: "https://hsportal.hansung.ac.kr/list",
    },
  });
  const nc = await db.noticeCategory.findUniqueOrThrow({
    where: { code: "career" },
  });
  const pc = await db.programCategory.findUniqueOrThrow({
    where: { code: "other" },
  });
  const ns = await db.source.create({
    data: {
      code: "activate_notice",
      kind: "NOTICE",
      name: "공지",
      baseUrl: "https://www.hansung.ac.kr",
      listUrl: "https://www.hansung.ac.kr/list",
    },
  });
  const n = await db.notice.create({
    data: {
      publicId: "activation-notice",
      externalId: "42",
      sourceId: ns.id,
      canonicalUrl:
        "https://www.hansung.ac.kr/bbs/hansung/2127/42/artclView.do",
      lastSeenAt: now,
      lastCheckedAt: now,
    },
  });
  const rev = await db.noticeRevision.create({
    data: {
      noticeId: n.id,
      revisionNo: 1,
      preprocessVersion: "test",
      title: "날짜 마감",
      sourceHash: "a".repeat(64),
      contentHash: "b".repeat(64),
      preprocessedJson: {},
      collectedAt: now,
    },
  });
  const summary = await db.noticeSummary.create({
    data: {
      noticeId: n.id,
      revisionId: rev.id,
      categoryId: nc.id,
      versionNo: 1,
      origin: "HUMAN",
      projectionVersion: "test",
      kind: "general",
      oneLineSummary: "모집",
      summaryJson: [],
      applicationStatus: "stated",
      applicationJson: {},
      reviewStatus: "APPROVED",
      reviewedAt: now,
      validationStatus: "VALID",
      validationIssuesJson: [],
      periods: {
        create: {
          role: "APPLICATION",
          sortOrder: 0,
          label: "신청",
          endPrecision: "date",
          endDate: end,
          endRaw: end.toISOString().slice(0, 10),
        },
      },
    },
  });
  await db.notice.update({
    where: { id: n.id },
    data: { currentRevisionId: rev.id, publishedSummaryId: summary.id },
  });

  const signup = async (loginId) => {
    const { data } = await http("POST", "/auth/signup", 201, {
      body: { loginId, password: "ApiTest!123", name: "회원" },
    });
    return { id: BigInt(data.user.id), token: data.accessToken };
  };
  const me = await signup("activation1"),
    other = await signup("activation2"),
    push = await signup("activation3");
  const settings = (u, patch) =>
    http("PATCH", "/users/me", 200, {
      token: u.token,
      body: { notificationSettings: patch },
    });
  const save = (u, kind, p) =>
    http("PUT", "/users/me/bookmarks/" + kind + "/" + p.publicId, 200, {
      token: u.token,
    });
  const common = { sourceId: source.id, lastSeenAt: now, lastCheckedAt: now };
  // A first page of unavailable bookmarks must not hide an eligible second page.
  await db.program.createMany({
    data: Array.from({ length: 100 }, (_, i) => ({
      ...common,
      externalId: "old-" + i,
      publicId: "activation-old-" + i,
    })),
  });
  const unavailable = await db.program.findMany({
    where: { sourceId: source.id },
    select: { id: true },
  });
  await db.userProgramBookmark.createMany({
    data: unavailable.map((p) => ({ userId: me.id, programId: p.id })),
  });
  async function program(name, deadline = end) {
    const p = await db.program.create({
      data: { ...common, publicId: "activation-" + name, externalId: name },
    });
    const r = await db.programRevision.create({
      data: {
        programId: p.id,
        revisionNo: 1,
        parserVersion: "test",
        title: name,
        categoryId: pc.id,
        sourceHash: "1".repeat(64),
        contentHash: "2".repeat(64),
        validationStatus: "VALID",
        validationIssuesJson: [],
        rawMetadataJson: {},
        collectedAt: now,
        applicationStatus: "stated",
        applyEndPrecision: "datetime",
        applyEndAt: deadline,
        applyEndRaw: deadline.toISOString(),
      },
    });
    await db.program.update({
      where: { id: p.id },
      data: { currentRevisionId: r.id },
    });
    return p;
  }
  const p = await program("future"),
    past = await program("past", new Date(end.getTime() - 5000)),
    off = await program("off"),
    foreign = await program("foreign");
  await settings(me, { deadlineInAppEnabled: false });
  await settings(other, { deadlineInAppEnabled: false });
  await settings(push, { deadlineInAppEnabled: false });
  await save(me, "notices", n);
  for (const item of [p, past, off]) await save(me, "programs", item);
  await http("PATCH", "/users/me/bookmarks/programs/" + off.publicId, 200, {
    token: me.token,
    body: { deadlineReminderEnabled: false },
  });
  await save(other, "programs", foreign);
  await save(push, "programs", p);
  const jobs = (u) =>
    db.deadlineReminder.findMany({
      where: { userId: u.id },
      orderBy: { id: "asc" },
    });
  assert.equal((await jobs(me)).length, 0);
  await Promise.all([
    settings(me, { deadlineInAppEnabled: true }),
    settings(me, { deadlineInAppEnabled: true }),
  ]);
  const siteJobs = await jobs(me);
  assert.equal(siteJobs.length, 2);
  assert(
    siteJobs.some(
      (j) => j.noticeId === n.id && j.noticeSummaryId === summary.id,
    ),
  );
  assert(siteJobs.some((j) => j.programId === p.id));
  assert(
    siteJobs.every(
      (j) => j.status === "PENDING" && j.scheduledAt.getTime() === d1,
    ),
  );
  assert.equal((await jobs(other)).length, 0);

  const key = createECDH("prime256v1");
  key.generateKeys();
  const sub = {
    endpoint: "https://fcm.googleapis.com/fcm/send/channel-activation",
    keys: {
      p256dh: key.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
    expirationTime: null,
  };
  const register = (status, expirationTime = null) =>
    http("POST", "/users/me/push-subscriptions", status, {
      token: push.token,
      body: { ...sub, expirationTime },
    });
  const { data: device } = await register(201);
  assert.equal((await jobs(push)).length, 0);
  await settings(push, { deadlinePushEnabled: true });
  const [initial] = await jobs(push);
  assert.equal(initial.status, "PENDING");
  const unsubscribe = () =>
    http("DELETE", "/users/me/push-subscriptions/" + device.id, 200, {
      token: push.token,
    });
  await unsubscribe();
  assert.equal((await jobs(push))[0].status, "CANCELLED");
  await register(200);
  await register(200);
  assert.deepEqual(
    (await jobs(push)).map((j) => [j.id, j.status]),
    [[initial.id, "PENDING"]],
  );
  // The last device can expire without T06; renewal must restore the same job before D-1.
  await register(200, d1 - 1500);
  t.mock.timers.setTime(d1 - 1000);
  assert.equal(
    (
      await http("GET", "/users/me/push-subscriptions", 200, {
        token: push.token,
      })
    ).data.pagination.totalItems,
    0,
  );
  await register(200);
  assert.deepEqual(
    (await jobs(push)).map((j) => [j.id, j.status]),
    [[initial.id, "PENDING"]],
  );

  // The worker's first pass is AFTER the trigger time; a late new opt-in must still skip that event.
  t.mock.timers.setTime(d1 + 1000);
  await settings(other, { deadlineInAppEnabled: true });
  assert.equal((await jobs(other)).length, 0);
  await worker.tick();
  await worker.tick();
  assert.equal(
    await db.notification.count({
      where: { userId: me.id, inAppVisible: true },
    }),
    2,
  );
  assert.equal(
    await db.notification.count({
      where: { userId: push.id, inAppVisible: false },
    }),
    1,
  );
  assert.equal(await db.notification.count({ where: { userId: other.id } }), 0);
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].type, "APPLICATION_DEADLINE_D1");
  assert.deepEqual(payloads[0].contentRef, { type: "program", id: p.publicId });
  assert.deepEqual(payloads[0].navigation, {
    screen: "programs",
    contentId: p.publicId,
  });
  assert.equal(payloads[0].expiresAt, new Date(d1 + 3600_000).toISOString());
  await unsubscribe();
  await register(200);
  assert.deepEqual(
    (await jobs(push)).map((j) => [j.id, j.status]),
    [[initial.id, "COMPLETED"]],
  );
}
