import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import webpush from "web-push";

export async function withTestApi(url, run) {
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = randomBytes(48).toString("base64url");
  process.env.NODE_ENV = "test";
  const vapid = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
  process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  process.env.VAPID_SUBJECT = "mailto:test@example.org";
  const origin = (process.env.ALLOWED_ORIGINS = "http://localhost:8080");
  const { createApp } = await import("../dist/app.js");
  const { PrismaService } = await import("../dist/prisma/prisma.service.js");
  const { seedCatalog } = await import("../prisma/seed.mjs");
  const app = await createApp();
  try {
    await app.listen(0, "127.0.0.1");
    const db = app.get(PrismaService);
    const base = (await app.getUrl()) + "/api/v1";
    async function http(
      method,
      route,
      status,
      { body, token, cookie, headers = {}, raw } = {},
    ) {
      const response = await fetch(base + route, {
        method,
        headers: {
          origin,
          "X-CSRF-Guard": "1",
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body !== undefined || raw !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...headers,
        },
        ...(raw !== undefined || body !== undefined
          ? { body: raw ?? JSON.stringify(body) }
          : {}),
      });
      const json = await response.json();
      if (status !== null)
        assert.equal(
          response.status,
          status,
          method + " " + route + " (" + (json.error?.code ?? "success") + ")",
        );
      assert.equal(json.success, response.ok);
      assert.equal(json.meta?.requestId, response.headers.get("x-request-id"));
      assert.equal(response.headers.get("cache-control"), "no-store");
      if (!response.ok) {
        assert(!("data" in json));
        assert(Array.isArray(json.error.fieldErrors));
      }
      const setCookie = response.headers.get("set-cookie");
      return {
        status: response.status,
        data: json.data,
        code: json.error?.code,
        cookie: setCookie?.split(";")[0],
        setCookie,
        headers: response.headers,
      };
    }
    await run({ app, db, http, seedCatalog });
  } finally {
    await app.close();
  }
}
