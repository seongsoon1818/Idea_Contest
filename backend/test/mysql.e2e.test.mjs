import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { withTestApi } from "./mysql-api.mjs";
import { withMysql } from "./mysql-fixture.mjs";
import { noticeContract } from "./notice-contract.mjs";
import { programContract } from "./program-contract.mjs";
import { bookmarkContract } from "./bookmark-contract.mjs";
import { notificationContract } from "./notification-contract.mjs";
import { recommendationContract } from "./recommendation-contract.mjs";
import { emptyHomeContract, homeContract } from "./home-contract.mjs";

test(
  "HTTP contracts and deadline worker against a disposable MySQL instance",
  { timeout: 180000 },
  async (t) =>
    withMysql(async (url) => {
      await withTestApi(url, async ({ app, db, http, seedCatalog }) => {
        const password = "ApiTest!123",
          nextPassword = "Changed!123";
        const signup = (loginId) =>
          http("POST", "/auth/signup", 201, {
            body: { loginId, password, name: "한성" },
          });
        const login = (loginId, pw = password) =>
          http("POST", "/auth/login", 200, { body: { loginId, password: pw } });
        await seedCatalog(db);
        await seedCatalog(db);

        await t.test(
          "all four catalogs, hierarchy/aliases, active and grade/slot filters",
          async () => {
            const all = (await http("GET", "/catalog/academic-units", 200)).data
              .items;
            assert.equal(all.length, 89);
            const college = all.find((u) => u.kind === "COLLEGE");
            await db.academicUnit.update({
              where: { id: BigInt(college.id) },
              data: { aliasesJson: ["테스트 별칭"] },
            });
            assert.equal(
              (
                await http(
                  "GET",
                  "/catalog/academic-units?q=" + encodeURIComponent("별칭"),
                  200,
                )
              ).data.items[0].id,
              college.id,
            );
            assert(
              (
                await http(
                  "GET",
                  "/catalog/academic-units?parentId=" + college.id,
                  200,
                )
              ).data.items.every((x) => x.parentId === college.id),
            );
            assert(
              (
                await http(
                  "GET",
                  "/catalog/academic-units?grade=YEAR_1&slot=1",
                  200,
                )
              ).data.items.every((x) => x.kind !== "TRACK"),
            );
            assert(
              (
                await http(
                  "GET",
                  "/catalog/academic-units?grade=OTHER&slot=2",
                  200,
                )
              ).data.items.every((x) => x.kind !== "COLLEGE"),
            );
            for (const path of [
              "?grade=YEAR_1&slot=2",
              "?grade=YEAR_1",
              "?q=x&q=y",
              "?slot=4",
              "?extra=y",
            ])
              assert.equal(
                (await http("GET", "/catalog/academic-units" + path, 400)).code,
                "VALIDATION_ERROR",
              );
            for (const [resource, n] of [
              ["topics", 8],
              ["program-categories", 6],
              ["notice-categories", 8],
            ])
              assert.equal(
                (await http("GET", "/catalog/" + resource, 200)).data.items
                  .length,
                n,
              );
          },
        );
        await t.test(
          "request envelope, CSRF, optional bearer, input media and size",
          async () => {
            assert.equal(
              (await http("GET", "/users/me", 401)).code,
              "AUTH_REQUIRED",
            );
            assert.equal(
              (
                await http("GET", "/catalog/topics", 401, {
                  token: "not-a-jwt",
                })
              ).code,
              "INVALID_TOKEN",
            );
            assert.equal(
              (
                await http("POST", "/auth/login", 403, {
                  headers: { origin: "https://untrusted.example" },
                })
              ).code,
              "CSRF_REJECTED",
            );
            assert.equal(
              (
                await http("POST", "/auth/login", 403, {
                  headers: { "X-CSRF-Guard": "" },
                })
              ).code,
              "CSRF_REJECTED",
            );
            assert.equal(
              (
                await http("POST", "/auth/login", 415, {
                  raw: "loginId=x",
                  headers: { "Content-Type": "text/plain" },
                })
              ).code,
              "UNSUPPORTED_MEDIA_TYPE",
            );
            assert.equal(
              (await http("POST", "/auth/login", 400, { raw: "{" })).code,
              "VALIDATION_ERROR",
            );
            assert.equal(
              (
                await http("POST", "/auth/login", 413, {
                  body: { value: "x".repeat(65536) },
                })
              ).code,
              "PAYLOAD_TOO_LARGE",
            );
          },
        );

        const alice = await signup("Alice01"),
          a = BigInt(alice.data.user.id),
          first = alice.data.accessToken;
        await t.test(
          "signup is atomic, tokens/hashes and default settings match the contract",
          async () => {
            assert.equal(alice.data.user.loginId, "alice01");
            assert(!alice.data.user.profileCompleted);
            assert.match(alice.setCookie, /HttpOnly/);
            assert.match(alice.setCookie, /Path=\/api\/v1\/auth/);
            const session = await db.userSession.findFirstOrThrow({
              where: { userId: a },
            });
            assert.equal(
              session.refreshTokenHash,
              createHash("sha256")
                .update(alice.cookie.split("=")[1])
                .digest("hex"),
            );
            const settings =
              await db.userNotificationSettings.findUniqueOrThrow({
                where: { userId: a },
              });
            assert(
              settings.deadlineInAppEnabled && !settings.deadlinePushEnabled,
            );
            assert.equal(
              (
                await http("POST", "/auth/signup", 409, {
                  body: { loginId: "ALICE01", password, name: "복제" },
                })
              ).code,
              "LOGIN_ID_TAKEN",
            );
            assert.equal(await db.user.count(), 1);
            assert.equal(
              (
                await http("POST", "/auth/login", 401, {
                  body: { loginId: "nobody", password },
                })
              ).code,
              "INVALID_CREDENTIALS",
            );
            assert.equal(
              (
                await http("POST", "/auth/login", 401, {
                  body: { loginId: "alice01", password: "wrong" },
                })
              ).code,
              "INVALID_CREDENTIALS",
            );
            assert.equal(
              (await http("GET", "/users/me", 200, { token: first })).data.name,
              "한성",
            );
          },
        );
        await t.test(
          "U02 partial vs U04 full, completedAt preservation, validation rollback and concurrent patches",
          async () => {
            const patch = (body, status = 200) =>
              http("PATCH", "/users/me", status, { body, token: first });
            const profile = async () =>
              (await http("GET", "/users/me/profile", 200, { token: first }))
                .data;
            assert.equal((await profile()).grade, null);
            assert.equal(
              (await patch({ name: "이름수정" })).data.profile.completed,
              false,
            );
            await patch({ grade: "YEAR_2" }, 400);
            await patch({ role: "ADMIN" }, 400);
            const all = (await http("GET", "/catalog/academic-units", 200)).data
              .items;
            const tracks = all.filter((u) => u.kind === "TRACK").slice(0, 2);
            const units = tracks.map((u, i) => ({
              slot: i + 1,
              academicUnitId: u.id,
            }));
            const filled = {
              name: "첫저장",
              grade: "YEAR_2",
              academicUnits: units,
              interestCodes: ["career", "study"],
            };
            const p = (
              await http("PUT", "/users/me/profile", 200, {
                body: filled,
                token: first,
              })
            ).data;
            assert(p.completed && p.completedAt);
            assert.equal(p.academicUnits.length, 2);
            await patch({ name: "롤백", grade: "YEAR_1" }, 400);
            assert.equal((await profile()).name, "첫저장");
            await patch(
              { name: "롤백", interestCodes: ["not-in-catalog"] },
              400,
            );
            await http("PUT", "/users/me/profile", 400, {
              body: { name: "불완전" },
              token: first,
            });
            const academicUnitId = all.find((u) => u.kind === "COLLEGE").id;
            await patch({
              grade: "YEAR_1",
              academicUnits: [{ slot: 1, academicUnitId }],
            });
            await Promise.all([
              patch({ name: "동시수정" }),
              patch({ interestCodes: ["contest"] }),
            ]);
            const current = await profile();
            assert.equal(current.name, "동시수정");
            assert.equal(current.completedAt, p.completedAt);
            assert.deepEqual(
              current.interests.map((i) => i.code),
              ["contest"],
            );
            assert.deepEqual(
              current.academicUnits.map((u) => u.unit.id),
              [academicUnitId],
            );
          },
        );

        const second = await login("ALICE01"),
          bob = await signup("Bob007");
        let rotated;
        await t.test(
          "one winner under simultaneous rotation; fixed expiry; stale cookies rejected without Set-Cookie",
          async () => {
            const pair = await Promise.all(
              [1, 2].map(() =>
                http("POST", "/auth/refresh", null, { cookie: alice.cookie }),
              ),
            );
            assert.deepEqual(pair.map((r) => r.status).sort(), [200, 401]);
            rotated = pair.find((r) => r.status === 200);
            const loser = pair.find((r) => r.status === 401);
            assert.equal(loser.code, "INVALID_REFRESH_TOKEN");
            assert.equal(loser.setCookie, null);
            assert.notEqual(rotated.cookie, alice.cookie);
            assert.equal(
              rotated.data.refreshExpiresAt,
              alice.data.refreshExpiresAt,
            );
            await http("POST", "/auth/refresh", 401, { cookie: alice.cookie });
          },
        );
        const sub = async (userId, label) =>
          db.webPushSubscription.create({
            data: {
              userId,
              endpoint: "https://push.example/" + label,
              endpointHash: createHash("sha256").update(label).digest("hex"),
              p256dh: "test-key",
              auth: "test-secret",
              lastSeenAt: new Date(),
            },
          });
        const mine = await sub(a, "device1"),
          otherDevice = await sub(a, "device2"),
          theirs = await sub(BigInt(bob.data.user.id), "bob");
        await t.test(
          "logout is owner-scoped and idempotent; another device stays signed in",
          async () => {
            await http("POST", "/auth/logout", 404, {
              cookie: rotated.cookie,
              body: { pushSubscriptionId: String(theirs.id) },
            });
            await http("GET", "/users/me", 200, { token: first }); // subscription mismatch rolled back session revocation
            const out = await http("POST", "/auth/logout", 200, {
              token: "stale-access-token",
              cookie: rotated.cookie,
              body: { pushSubscriptionId: String(mine.id) },
            });
            assert.match(out.setCookie, /Max-Age=0/);
            assert.equal(
              (await http("GET", "/users/me", 401, { token: first })).code,
              "SESSION_REVOKED",
            );
            await http("POST", "/auth/logout", 200, { cookie: rotated.cookie });
            await http("POST", "/auth/logout", 200);
            await http("GET", "/users/me", 200, {
              token: second.data.accessToken,
            });
            assert(
              (
                await db.webPushSubscription.findUnique({
                  where: { id: mine.id },
                })
              ).revokedAt,
            );
            assert.equal(
              (
                await db.webPushSubscription.findUnique({
                  where: { id: otherDevice.id },
                })
              ).revokedAt,
              null,
            );
            assert.equal(
              (
                await db.webPushSubscription.findUnique({
                  where: { id: theirs.id },
                })
              ).revokedAt,
              null,
            );
          },
        );
        await t.test(
          "A06 reauthentication revokes earlier sessions and push subscriptions",
          async () => {
            const change = (currentPassword, newPassword, status) =>
              http("POST", "/auth/password/change", status, {
                token: second.data.accessToken,
                body: { currentPassword, newPassword },
              });
            assert.equal(
              (await change("wrong", nextPassword, 403)).code,
              "REAUTH_FAILED",
            );
            await change(password, password, 400);
            assert.match(
              (await change(password, nextPassword, 200)).setCookie,
              /Max-Age=0/,
            );
            await http("GET", "/users/me", 401, {
              token: second.data.accessToken,
            });
            assert(
              (
                await db.webPushSubscription.findUnique({
                  where: { id: otherDevice.id },
                })
              ).revokedAt,
            );
            await http("POST", "/auth/refresh", 401, { cookie: second.cookie });
            await http("POST", "/auth/login", 401, {
              body: { loginId: "alice01", password },
            });
          },
        );
        await t.test(
          "withdrawal removes personal rows, preserves other users and public content",
          async () => {
            const current = await login("alice01", nextPassword);
            const source = await db.source.create({
              data: {
                code: "test",
                kind: "NOTICE",
                name: "테스트",
                baseUrl: "https://example.org",
                listUrl: "https://example.org/list",
              },
            });
            const notice = await db.notice.create({
              data: {
                sourceId: source.id,
                publicId: "test-1",
                externalId: "1",
                canonicalUrl: "https://example.org/1",
                lastSeenAt: new Date(),
                lastCheckedAt: new Date(),
              },
            });
            await db.userNoticeBookmark.create({
              data: { userId: a, noticeId: notice.id },
            });
            const withdraw = (currentPassword, status) =>
              http("POST", "/users/me/withdraw", status, {
                token: current.data.accessToken,
                body: { currentPassword, confirmation: "WITHDRAW" },
              });
            assert.equal((await withdraw("wrong", 403)).code, "REAUTH_FAILED");
            assert.match(
              (await withdraw(nextPassword, 200)).setCookie,
              /Max-Age=0/,
            );
            for (const table of [
              "userProfile",
              "userSession",
              "userTopic",
              "userAcademicUnit",
              "userNoticeBookmark",
              "userNotificationSettings",
              "webPushSubscription",
            ])
              assert.equal(
                await db[table].count({ where: { userId: a } }),
                0,
                table,
              );
            assert.equal(await db.user.count({ where: { id: a } }), 0);
            assert.equal(await db.notice.count(), 1);
            await http("GET", "/users/me", 401, {
              token: current.data.accessToken,
            });
            await http("GET", "/users/me", 200, {
              token: bob.data.accessToken,
            });
          },
        );
        await t.test(
          "disabled accounts cannot rotate; withdrawing a reviewer preserves only the audit reference",
          async () => {
            const id = BigInt(bob.data.user.id);
            await db.user.update({
              where: { id },
              data: { role: "REVIEWER", status: "SUSPENDED" },
            });
            assert.equal(
              (
                await http("GET", "/users/me", 403, {
                  token: bob.data.accessToken,
                })
              ).code,
              "ACCOUNT_DISABLED",
            );
            assert.equal(
              (await http("POST", "/auth/refresh", 403, { cookie: bob.cookie }))
                .code,
              "ACCOUNT_DISABLED",
            );
            await db.user.update({ where: { id }, data: { status: "ACTIVE" } });
            await http("POST", "/auth/refresh", 200, { cookie: bob.cookie }); // failed rotation rolled back
            const notice = await db.notice.findFirstOrThrow();
            const revision = await db.noticeRevision.create({
              data: {
                noticeId: notice.id,
                revisionNo: 1,
                sourceHash: "a".repeat(64),
                contentHash: "b".repeat(64),
                preprocessVersion: "test",
                title: "공개 공지",
                preprocessedJson: {},
                collectedAt: new Date(),
              },
            });
            const category = await db.noticeCategory.findUniqueOrThrow({
              where: { code: "academic" },
            });
            const summary = await db.noticeSummary.create({
              data: {
                noticeId: notice.id,
                revisionId: revision.id,
                categoryId: category.id,
                versionNo: 1,
                origin: "HUMAN",
                projectionVersion: "test",
                kind: "general",
                oneLineSummary: "안내",
                summaryJson: [],
                applicationStatus: "not_applicable",
                applicationJson: {},
                validationStatus: "VALID",
                validationIssuesJson: [],
                reviewStatus: "APPROVED",
                reviewedBy: id,
                reviewedAt: new Date(),
              },
            });
            await http("POST", "/users/me/withdraw", 200, {
              token: bob.data.accessToken,
              body: { currentPassword: password, confirmation: "WITHDRAW" },
            });
            const retired = await db.user.findUniqueOrThrow({ where: { id } });
            assert.equal(retired.status, "WITHDRAWN");
            assert.notEqual(retired.loginId, "bob007");
            assert.notEqual(retired.name, "한성");
            assert.equal(
              await db.userSession.count({ where: { userId: id } }),
              0,
            );
            assert.equal(
              await db.webPushSubscription.count({ where: { userId: id } }),
              0,
            );
            assert.equal(
              (
                await db.noticeSummary.findUniqueOrThrow({
                  where: { id: summary.id },
                })
              ).reviewedBy,
              id,
            );
          },
        );
        await noticeContract(t, app, db, http);
        await programContract(t, app, db, http);
        await bookmarkContract(t, app, db, http);
        await notificationContract(t, app, db, http);
        await recommendationContract(t, app, db, http);
      });
    }),
);

test(
  "home HTTP contract against a disposable MySQL instance",
  { timeout: 180000 },
  async (t) =>
    withMysql((url) =>
      withTestApi(url, async ({ app, db, http, seedCatalog }) => {
        await seedCatalog(db);
        await emptyHomeContract(t, http);
        await homeContract(t, app, db, http);
      }),
    ),
);
