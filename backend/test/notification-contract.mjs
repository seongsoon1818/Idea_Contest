import assert from "node:assert/strict";
import { createECDH, createHash, randomBytes } from "node:crypto";
import { Tokens } from "../dist/auth/tokens.js";
import { PushTransport } from "../dist/notification/push.js";
import { NotificationWorker } from "../dist/notification/notification.worker.js";

export async function notificationContract(t, app, db, http) {
  const transport = app.get(PushTransport),
    worker = app.get(NotificationWorker);
  const messages = [];
  transport.send = async (sub, payload, ttl) => {
    messages.push({ payload: JSON.parse(payload), ttl });
    return { statusCode: 201 };
  };
  async function member(loginId) {
    const m = await db.user.create({
      data: {
        loginId,
        name: "원래 이름",
        passwordHash: "!",
        notificationSettings: { create: {} },
      },
    });
    const s = await db.userSession.create({
      data: {
        userId: m.id,
        refreshTokenHash: randomBytes(32).toString("hex"),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    return {
      id: m.id,
      token: (await app.get(Tokens).issue(m.id, s.id, s.expiresAt)).accessToken,
    };
  }
  const me = await member("notify_a"),
    other = await member("notify_b");
  const api = (method, path, status = 200, body, user = me) =>
    http(method, path, status, { token: user.token, body });
  const subs = "/users/me/push-subscriptions",
    inbox = "/users/me/notifications",
    account = "/users/me";
  const pref = (v) => ({ notificationSettings: v });
  const key = createECDH("prime256v1");
  key.generateKeys();
  const sub = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test-only",
    keys: {
      p256dh: key.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
    expirationTime: null,
    deviceLabel: "테스트 브라우저",
  };
  let subId;
  await t.test(
    "U01/U02 integrate settings atomically; T03–T06 validate subscriptions, redact secrets and isolate users",
    async () => {
      const initial = (await api("GET", account)).data.notificationSettings;
      assert(initial.deadlineInAppEnabled && !initial.deadlinePushEnabled);
      assert.equal(initial.activePushSubscriptionCount, 0);
      for (const v of [
        null,
        {},
        { deadlinePushEnabled: "true" },
        { activePushSubscriptionCount: 3 },
      ])
        await api("PATCH", account, 400, pref(v));
      const failed = await api("PATCH", account, 409, {
        name: "롤백",
        ...pref({ deadlinePushEnabled: true }),
      });
      assert.equal(failed.code, "ACTIVE_PUSH_SUBSCRIPTION_REQUIRED");
      assert.equal((await api("GET", account)).data.name, "원래 이름");
      await api("GET", account + "/notification-settings", 404);
      await api("PATCH", account + "/notification-settings", 404, {
        deadlinePushEnabled: true,
      });
      const config = (await http("GET", "/push/config", 200)).data;
      assert.deepEqual(Object.keys(config).sort(), [
        "enabled",
        "vapidPublicKey",
      ]);
      assert.equal(config.enabled, true);
      await http("GET", subs, 401);
      for (const bad of [
        { endpoint: "https://127.0.0.1/private" },
        { endpoint: "https://fcm.googleapis.com.evil.example/a" },
        { endpoint: "https://fcm.googleapis.com:444/a" },
        { expirationTime: 0 },
        {
          keys: { ...sub.keys, p256dh: Buffer.alloc(65).toString("base64url") },
        },
      ])
        await api("POST", subs, 400, { ...sub, ...bad });
      const created = (await api("POST", subs, 201, sub)).data;
      subId = created.id;
      assert.equal(
        (await api("POST", subs, 200, { ...sub, deviceLabel: "갱신" })).data.id,
        subId,
      );
      assert.equal(
        (await api("POST", subs, 409, sub, other)).code,
        "PUSH_SUBSCRIPTION_CONFLICT",
      );
      await api("DELETE", subs + "/" + subId, 404, undefined, other);
      assert.equal(
        (await api("GET", subs, 200, undefined, other)).data.pagination
          .totalItems,
        0,
      );
      const page = (await api("GET", subs + "?size=1")).data;
      assert.equal(page.items[0].deviceLabel, "갱신");
      assert(!JSON.stringify(page).includes(sub.keys.auth));
      assert(!("endpoint" in created));
      const before = (await api("GET", account)).data.notificationSettings;
      assert.equal(before.deadlinePushEnabled, false);
      assert.equal(before.activePushSubscriptionCount, 1);
      const updated = (
        await api("PATCH", account, 200, {
          name: "새 이름",
          ...pref({ deadlinePushEnabled: true }),
        })
      ).data;
      assert.equal(updated.user.name, "새 이름");
      assert.equal(updated.profile.completed, false);
      assert.equal(updated.notificationSettings.deadlinePushEnabled, true);
      await api("GET", subs + "?size=0", 400);
    },
  );

  // Seed already reserved jobs within their D-1 window, independently of the wall-clock date.
  const source = await db.source.create({
    data: {
      code: "nt_program",
      kind: "PROGRAM",
      name: "테스트",
      baseUrl: "https://hsportal.hansung.ac.kr",
      listUrl: "https://hsportal.hansung.ac.kr/list",
    },
  });
  const category = await db.programCategory.findUniqueOrThrow({
    where: { code: "other" },
  });
  async function due(seq, user = me, age = 60_000) {
    const now = new Date(),
      scheduledAt = new Date(now.getTime() - age),
      end = new Date(scheduledAt.getTime() + 86_400_000),
      publicId = "notify-" + seq;
    const p = await db.program.create({
      data: {
        sourceId: source.id,
        externalId: publicId,
        publicId,
        lastSeenAt: now,
        lastCheckedAt: now,
      },
    });
    const r = await db.programRevision.create({
      data: {
        programId: p.id,
        revisionNo: 1,
        sourceHash: "3".repeat(64),
        contentHash: "4".repeat(64),
        parserVersion: "test",
        title: "프로그램",
        categoryId: category.id,
        applicationStatus: "stated",
        applyEndPrecision: "datetime",
        applyEndRaw: end.toISOString(),
        applyEndAt: end,
        validationStatus: "VALID",
        validationIssuesJson: [],
        rawMetadataJson: {},
        collectedAt: now,
      },
    });
    await db.program.update({
      where: { id: p.id },
      data: { currentRevisionId: r.id },
    });
    await db.userProgramBookmark.create({
      data: { userId: user.id, programId: p.id },
    });
    const dedupKey = createHash("sha256")
      .update(
        JSON.stringify([
          "APPLICATION_DEADLINE_D1",
          "PROGRAM",
          String(p.id),
          "datetime",
          end.toISOString(),
        ]),
      )
      .digest("hex");
    const job = await db.deadlineReminder.create({
      data: {
        userId: user.id,
        programId: p.id,
        programRevisionId: r.id,
        dedupKey,
        deadlinePrecision: "datetime",
        deadlineAt: end,
        scheduledAt,
        deliverBefore: new Date(scheduledAt.getTime() + 3600000),
        nextAttemptAt: scheduledAt,
        policyVersion: "deadline-d1-v1",
        sourceRefsJson: [
          { id: String(r.id), kind: "PROGRAM_ROOT", label: r.title },
        ],
      },
    });
    return { p, r, job };
  }
  let first, n1, n2;
  await t.test(
    "due reservation materializes once, with independent inbox and encrypted-push transport work items",
    async () => {
      first = await due(1);
      await Promise.all([
        worker.deliverReminder(first.job.id),
        worker.deliverReminder(first.job.id),
      ]);
      n1 = await db.notification.findUniqueOrThrow({
        where: { reminderId: first.job.id },
      });
      assert(n1.inAppVisible);
      const push = await db.notificationPushDelivery.findFirstOrThrow({
        where: { notificationId: n1.id },
      });
      await Promise.all([
        worker.deliverPush(push.id),
        worker.deliverPush(push.id),
      ]);
      const sent = await db.notificationPushDelivery.findUniqueOrThrow({
        where: { id: push.id },
      });
      assert.equal(sent.status, "ACCEPTED");
      assert.equal(messages.length, 1);
      assert(messages[0].ttl > 0 && messages[0].ttl <= 3600);
      assert.equal(messages[0].payload.navigation.contentId, first.p.publicId);
      assert.equal(messages[0].payload.notificationId, String(n1.id));
      const second = await due(2);
      await worker.deliverReminder(second.job.id);
      n2 = await db.notification.findUniqueOrThrow({
        where: { reminderId: second.job.id },
      });
      const result = (await api("GET", inbox + "?size=1")).data;
      assert.equal(result.pagination.totalItems, 2);
      assert.equal(result.items[0].id, String(n2.id));
      assert.equal((await api("GET", inbox + "/unread-count")).data.count, 2);
      assert.equal(
        (await api("GET", inbox + "/unread-count", 200, undefined, other)).data
          .count,
        0,
      );
    },
  );
  await t.test(
    "T07–T11 ownership, cutoff, idempotent read/hide, source masking and invalidation",
    async () => {
      await http("GET", inbox, 401);
      await api("GET", inbox + "?unreadOnly=1", 400);
      await api(
        "PATCH",
        inbox + "/" + n1.id + "/read",
        404,
        { read: true },
        other,
      );
      await api("PATCH", inbox + "/" + n1.id + "/read", 400, { read: false });
      await api("POST", inbox + "/read-all", 400, {
        throughCreatedAt: new Date(Date.now() + 60000).toISOString(),
      });
      const cutoff = n1.createdAt.toISOString();
      assert.equal(
        (
          await api("POST", inbox + "/read-all", 200, {
            throughCreatedAt: cutoff,
          })
        ).data.updatedCount,
        1,
      );
      assert.equal(
        (
          await api("POST", inbox + "/read-all", 200, {
            throughCreatedAt: cutoff,
          })
        ).data.updatedCount,
        0,
      );
      const read = (
        await api("PATCH", inbox + "/" + n2.id + "/read", 200, { read: true })
      ).data;
      assert.deepEqual(
        (await api("PATCH", inbox + "/" + n2.id + "/read", 200, { read: true }))
          .data,
        read,
      );
      await db.program.update({
        where: { id: first.p.id },
        data: { visibility: "HIDDEN" },
      });
      const masked = (await api("GET", inbox)).data.items.find(
        (i) => i.id === String(n1.id),
      );
      assert.equal(masked.availability, "UNAVAILABLE");
      assert.equal(masked.title, "내용을 확인할 수 없음");
      await worker.tick();
      assert.equal(
        (await api("GET", inbox + "?includeInvalidated=false")).data.pagination
          .totalItems,
        1,
      );
      await api("DELETE", inbox + "/" + n1.id, 404, undefined, other);
      await api("DELETE", inbox + "/" + n1.id);
      await api("DELETE", inbox + "/" + n1.id);
      await api("PATCH", inbox + "/" + n1.id + "/read", 404, { read: true });
      assert.equal((await api("GET", inbox + "/unread-count")).data.count, 0);
    },
  );
  await t.test(
    "push-only delivery, retries, 410, expired leases and a disabled bookmark never disclose to other accounts",
    async () => {
      await api("PATCH", account, 200, pref({ deadlineInAppEnabled: false }));
      const d = await due(3);
      await worker.deliverReminder(d.job.id);
      const n = await db.notification.findUniqueOrThrow({
        where: { reminderId: d.job.id },
      });
      assert.equal(n.inAppVisible, false);
      await api("DELETE", inbox + "/" + n.id, 404);
      await api("PATCH", inbox + "/" + n.id + "/read", 404, { read: true });
      let p = await db.notificationPushDelivery.findFirstOrThrow({
        where: { notificationId: n.id },
      });
      transport.send = async () => {
        throw { statusCode: 429, headers: { "retry-after": "120" } };
      };
      await worker.deliverPush(p.id);
      p = await db.notificationPushDelivery.findUniqueOrThrow({
        where: { id: p.id },
      });
      assert.equal(p.status, "RETRY_WAIT");
      assert(p.nextAttemptAt.getTime() > Date.now() + 110000);
      await db.notificationPushDelivery.update({
        where: { id: p.id },
        data: {
          status: "PROCESSING",
          lockToken: "0".repeat(36),
          lockedUntil: new Date(Date.now() - 1000),
        },
      });
      transport.send = async () => {
        throw { statusCode: 410 };
      };
      await worker.deliverPush(p.id);
      assert.equal((await api("GET", subs)).data.pagination.totalItems, 0);
      assert(
        (await api("GET", account)).data.notificationSettings
          .deadlinePushEnabled,
      );
      await api("DELETE", subs + "/" + subId);
      await api("DELETE", subs + "/" + subId);
      const inactive = await due(4, other);
      await db.userProgramBookmark.deleteMany({
        where: { programId: inactive.p.id, userId: other.id },
      });
      await worker.deliverReminder(inactive.job.id);
      assert.equal(
        (
          await db.deadlineReminder.findUniqueOrThrow({
            where: { id: inactive.job.id },
          })
        ).status,
        "CANCELLED",
      );
      assert.equal(
        await db.notification.count({ where: { reminderId: inactive.job.id } }),
        0,
      );
      const late = await due(5, other, 7200000);
      await worker.deliverReminder(late.job.id);
      assert.equal(
        (
          await db.deadlineReminder.findUniqueOrThrow({
            where: { id: late.job.id },
          })
        ).status,
        "EXPIRED",
      );
      assert.equal(
        await db.notification.count({ where: { reminderId: late.job.id } }),
        0,
      );
      const gap = await due(6, me);
      await api("PATCH", account, 200, pref({ deadlineInAppEnabled: true }));
      await worker.deliverReminder(gap.job.id);
      assert.equal(
        (
          await db.deadlineReminder.findUniqueOrThrow({
            where: { id: gap.job.id },
          })
        ).status,
        "CANCELLED",
      );
      assert.equal(
        await db.notification.count({ where: { reminderId: gap.job.id } }),
        0,
      );
    },
  );
}
