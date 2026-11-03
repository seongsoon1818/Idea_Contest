import test from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import https from "node:https";
import { EventEmitter } from "node:events";
import webpush from "web-push";
import { PushTransport } from "../dist/notification/push.js";
import { SignJWT } from "jose";
import { profileInput } from "../dist/user/profile.input.js";
import { selectable } from "../dist/catalog/academic.js";
import {
  hashPassword,
  verifyPassword,
  passwordInput,
  loginIdInput,
} from "../dist/auth/credentials.js";
import { Tokens, refreshHash, newRefresh } from "../dist/auth/tokens.js";
import { requestQuery } from "../dist/common/http.js";
import { readFile } from "node:fs/promises";

process.env.JWT_SECRET = randomBytes(48).toString("base64url");
process.env.ALLOWED_ORIGINS = "http://localhost:8080";
test("web push stays disabled without keys and sends a signed encrypted request with a bounded TTL", async (t) => {
  const names = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];
  const old = names.map((k) => process.env[k]);
  t.after(() =>
    names.forEach((k, i) => {
      if (old[i] === undefined) delete process.env[k];
      else process.env[k] = old[i];
    }),
  );
  names.forEach((k) => delete process.env[k]);
  assert.deepEqual(new PushTransport().config(), {
    enabled: false,
    vapidPublicKey: null,
  });
  const pair = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = pair.publicKey;
  process.env.VAPID_PRIVATE_KEY = pair.privateKey;
  process.env.VAPID_SUBJECT = "mailto:test@example.org";
  const client = createECDH("prime256v1");
  client.generateKeys();
  const sub = {
    endpoint: "https://fcm.googleapis.com/fcm/send/mock-only",
    keys: {
      p256dh: client.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
  const payload = "private-notification-payload";
  const http = t.mock.method(https, "request", (options, onResponse) => {
    assert.equal(options.hostname, "fcm.googleapis.com");
    const headers = Object.fromEntries(
      Object.entries(options.headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    assert.equal(Number(headers.ttl), 123);
    assert.equal(headers["content-encoding"], "aes128gcm");
    assert.match(headers.authorization, /^vapid /);
    const req = new EventEmitter();
    req.write = (body) => {
      assert(
        Buffer.isBuffer(body) &&
          body.length > payload.length &&
          !body.includes(payload),
      );
    };
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 201;
      res.headers = {};
      onResponse(res);
      res.emit("end");
    };
    return req;
  });
  assert.equal(
    (await new PushTransport().send(sub, payload, 123)).statusCode,
    201,
  );
  assert.equal(http.mock.callCount(), 1);
});
test("login ID normalization, unmodified passwords, salted scrypt", async () => {
  assert.equal(loginIdInput("Test0001"), "test0001");
  for (const bad of ["short", "NO987654", "pass 123!", "비밀번호12!"])
    assert.throws(() => passwordInput(bad, "p", true));
  const a = await hashPassword("Testing123!"),
    b = await hashPassword("Testing123!");
  assert.notEqual(a, b);
  assert(await verifyPassword("Testing123!", a));
  assert.equal(await verifyPassword("wrong", a), false);
});
test("fixed JWT algorithm/issuer/audience, expiry and malformed claims", async () => {
  const tokens = new Tokens(),
    until = new Date(Date.now() + 86400_000);
  const issued = await tokens.issue(7n, 2n, until);
  assert.deepEqual(await tokens.verify(issued.accessToken), {
    userId: 7n,
    sessionId: 2n,
  });
  for (const [key, value, code] of [
    ["iss", "outsider", "INVALID_TOKEN"],
    ["aud", "other", "INVALID_TOKEN"],
    ["exp", 1, "ACCESS_TOKEN_EXPIRED"],
    ["sub", "0", "INVALID_TOKEN"],
  ]) {
    const raw = await new SignJWT({
      iss: "hsupick-api",
      aud: "hsupick-web",
      sub: "7",
      sid: "2",
      iat: 10,
      exp: Date.now() / 1000 + 900,
      [key]: value,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    await assert.rejects(tokens.verify(raw), { code });
  }
  await assert.rejects(tokens.verify("unsigned.invalid.token"), {
    code: "INVALID_TOKEN",
  });
  assert.equal(refreshHash(newRefresh()).length, 64);
});
test("partial vs full payload; reject unknown fields, duplicate slots/IDs and queries", () => {
  assert.equal(profileInput({ name: "  한성  " }, false).name, "한성");
  for (const input of [
    {},
    { role: "ADMIN" },
    { name: null },
    { interestCodes: [] },
    { interestCodes: ["study", "study"] },
    {
      academicUnits: [
        { slot: 1, academicUnitId: "2" },
        { slot: 2, academicUnitId: "2" },
      ],
    },
    { academicUnits: [{ slot: 1, academicUnitId: "18446744073709551616" }] },
  ])
    assert.throws(() => profileInput(input, false), {
      code: "VALIDATION_ERROR",
    });
  assert.throws(() => profileInput({ name: "한성" }, true));
  assert.throws(() => requestQuery({ url: "/catalog/topics?q=a&q=b" }, ["q"]));
  assert.throws(() => requestQuery({ url: "/catalog/topics?role=x" }, []));
});
test("catalog and profile share grade/slot rules; seed identities are unique and hierarchical", async () => {
  assert(selectable("YEAR_1", 1, "DEPARTMENT"));
  assert(!selectable("YEAR_1", 1, "TRACK"));
  assert(!selectable("YEAR_1", 2, "DEPARTMENT"));
  assert(selectable("OTHER", 1, "COLLEGE"));
  assert(!selectable("YEAR_3", 2, "COLLEGE"));
  const fixture = JSON.parse(
    await readFile(
      new URL("../prisma/catalog-data.json", import.meta.url),
      "utf8",
    ),
  );
  const seen = new Set();
  for (const unit of fixture.academicUnits) {
    assert(!seen.has(unit.code));
    assert(unit.parent === null || seen.has(unit.parent));
    assert(unit.code.length <= 64);
    seen.add(unit.code);
  }
  assert.deepEqual(
    [
      fixture.topics.length,
      fixture.noticeCategories.length,
      fixture.programCategories.length,
    ],
    [8, 8, 6],
  );
});
