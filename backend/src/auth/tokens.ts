import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { SignJWT, jwtVerify, errors } from "jose";
import { securityConfig } from "../common/config.js";
import { ApiError } from "../common/errors.js";
import type { ApiRequest, ApiResponse, Principal } from "../common/http.js";

const ISSUER = "hsupick-api",
  AUDIENCE = "hsupick-web",
  COOKIE = "hsupick_refresh";
export const SESSION_MS = 7 * 86400_000;
export const refreshHash = (raw: string) =>
  createHash("sha256").update(raw).digest("hex");
export const newRefresh = () => randomBytes(32).toString("base64url");

@Injectable()
export class Tokens {
  private readonly config = securityConfig();
  async issue(userId: bigint, sessionId: bigint, expiresAt: Date) {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ sid: String(sessionId) })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(String(userId))
      .setJti(randomUUID())
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 900)
      .sign(this.config.key);
    return {
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: 900,
      accessTokenExpiresAt: new Date((now + 900) * 1000),
      refreshExpiresAt: expiresAt,
    };
  }
  async verify(raw: string): Promise<Principal> {
    try {
      const { payload } = await jwtVerify(raw, this.config.key, {
        algorithms: ["HS256"],
        issuer: ISSUER,
        audience: AUDIENCE,
        typ: "JWT",
        requiredClaims: ["sub", "sid", "iat", "exp"],
      });
      const positiveId = (v: unknown): v is string =>
        typeof v === "string" &&
        /^[1-9][0-9]{0,19}$/.test(v) &&
        BigInt(v) <= 18446744073709551615n;
      if (!positiveId(payload.sub) || !positiveId(payload.sid))
        throw new Error();
      return { userId: BigInt(payload.sub), sessionId: BigInt(payload.sid) };
    } catch (e) {
      if (e instanceof errors.JWTExpired)
        throw new ApiError(
          401,
          "ACCESS_TOKEN_EXPIRED",
          "인증 토큰이 만료되었습니다.",
        );
      throw new ApiError(
        401,
        "INVALID_TOKEN",
        "유효하지 않은 인증 토큰입니다.",
      );
    }
  }
  readCookie(req: ApiRequest) {
    const values = (req.headers.cookie ?? "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.startsWith(COOKIE + "="));
    const value = values[0]?.slice(COOKIE.length + 1);
    return values.length === 1 && value && /^[A-Za-z0-9_-]{43}$/.test(value)
      ? value
      : undefined;
  }
  cookie(res: ApiResponse, value = "", until?: Date) {
    const maxAge = until
      ? Math.max(0, Math.floor((until.getTime() - Date.now()) / 1000))
      : 0;
    res.setHeader(
      "Set-Cookie",
      COOKIE +
        "=" +
        value +
        "; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=" +
        maxAge +
        (this.config.production ? "; Secure" : ""),
    );
  }
}
