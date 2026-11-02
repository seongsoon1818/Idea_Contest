import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Catch, HttpException, Injectable } from "@nestjs/common";
import type {
  ArgumentsHost,
  CallHandler,
  ExceptionFilter,
  ExecutionContext,
  NestInterceptor,
} from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { map } from "rxjs";
import { ApiError, invalid } from "./errors.js";
import { securityConfig } from "./config.js";

export type Principal = { userId: bigint; sessionId: bigint };
export type ApiRequest = IncomingMessage & {
  body?: unknown;
  principal?: Principal;
};
export type ApiResponse = ServerResponse;

function meta(res: ApiResponse) {
  return {
    requestId: String(res.getHeader("X-Request-Id")),
    timestamp: new Date().toISOString(),
  };
}
function respondError(res: ApiResponse, failure: ApiError) {
  res.statusCode = failure.status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      success: false,
      error: {
        code: failure.code,
        message: failure.message,
        fieldErrors: failure.fieldErrors,
      },
      meta: meta(res),
    }),
  );
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<ApiResponse>();
    if (res.headersSent) return;
    if (error instanceof ApiError) return respondError(res, error);
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : (error as { status?: number } | null)?.status;
    const dbError = error as { code?: string; errorCode?: string } | null;
    const code = dbError?.code ?? dbError?.errorCode ?? "";
    let mapped = new ApiError(
      500,
      "INTERNAL_ERROR",
      "요청을 처리하지 못했습니다.",
    );
    if (status === 404)
      mapped = new ApiError(
        404,
        "RESOURCE_NOT_FOUND",
        "대상을 찾을 수 없습니다.",
      );
    else if (status === 400)
      mapped = new ApiError(400, "VALIDATION_ERROR", "잘못된 요청입니다.");
    else if (status === 413)
      mapped = new ApiError(413, "PAYLOAD_TOO_LARGE", "요청이 너무 큽니다.");
    else if (status === 415)
      mapped = new ApiError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "JSON 형식이 필요합니다.",
      );
    else if (
      [
        "P1000",
        "P1001",
        "P1002",
        "P1008",
        "P1017",
        "P2024",
        "P2028",
        "P2034",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "ER_GET_CONNECTION_TIMEOUT",
      ].includes(code)
    )
      mapped = new ApiError(
        503,
        "SERVICE_UNAVAILABLE",
        "잠시 후 다시 시도해 주세요.",
      );
    if (mapped.status >= 500)
      console.error("API failure", meta(res).requestId, mapped.code, code); // No request body, tokens or raw DB error.
    respondError(res, mapped);
  }
}

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const res = context.switchToHttp().getResponse<ApiResponse>();
    return next
      .handle()
      .pipe(map((data) => ({ success: true, data, meta: meta(res) })));
  }
}

export function requestQuery(req: ApiRequest, allowed: readonly string[]) {
  const query: Record<string, string> = Object.create(null);
  for (const [key, value] of new URLSearchParams(
    (req.url ?? "").split("?").slice(1).join("?"),
  )) {
    if (!allowed.includes(key) || key in query)
      invalid(key, "지원하지 않거나 중복된 query입니다.");
    query[key] = value;
  }
  return query;
}

export function configureHttp(app: NestExpressApplication) {
  const { origins } = securityConfig();
  const counters = new Map<string, number>();
  let resetAt = Date.now() + 60_000;
  app.setGlobalPrefix("api/v1");
  app.use((req: ApiRequest, res: ApiResponse, next: () => void) => {
    res.setHeader("X-Request-Id", randomUUID());
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.enableCors({
    origin: [...origins],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-CSRF-Guard"],
    exposedHeaders: ["X-Request-Id", "Retry-After"],
  });
  app.use((req: ApiRequest, res: ApiResponse, next: () => void) => {
    const now = Date.now();
    if (now >= resetAt) {
      counters.clear();
      resetAt = now + 60_000;
    }
    const path = (req.url ?? "").split("?")[0]!.toLowerCase();
    const auth =
      path.startsWith("/api/v1/auth/") ||
      path.startsWith("/api/v1/users/me/withdraw");
    // Never trust an arbitrary X-Forwarded-For as the rate-limit identity.
    const key =
      (req.socket.remoteAddress ?? "unknown") + (auth ? ":auth" : ":api");
    const count = counters.get(key) ?? 0;
    if ((!count && counters.size >= 10_000) || count >= (auth ? 30 : 300)) {
      res.setHeader("Retry-After", Math.ceil((resetAt - now) / 1000));
      return respondError(
        res,
        new ApiError(429, "RATE_LIMITED", "잠시 후 다시 시도해 주세요."),
      );
    }
    counters.set(key, count + 1);
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method ?? "")) {
      if (
        !origins.has(req.headers.origin ?? "") ||
        req.headers["x-csrf-guard"] !== "1"
      )
        return respondError(
          res,
          new ApiError(403, "CSRF_REJECTED", "허용되지 않은 요청 출처입니다."),
        );
    }
    const hasBody =
      Number(req.headers["content-length"] ?? 0) > 0 ||
      !!req.headers["transfer-encoding"];
    if (
      hasBody &&
      req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !==
        "application/json"
    )
      return respondError(
        res,
        new ApiError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "application/json이 필요합니다.",
        ),
      );
    next();
  });
  app.useBodyParser("json", { limit: 65536 });
  app.useGlobalFilters(new ErrorFilter());
  app.useGlobalInterceptors(new EnvelopeInterceptor());
}
