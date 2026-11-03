import { Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiError, invalid } from "../common/errors.js";
import { requestQuery, type ApiRequest } from "../common/http.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ensureSession } from "./session-access.js";
import { Tokens } from "./tokens.js";

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: PrismaService,
    private readonly tokens: Tokens,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<ApiRequest>();
    const targets = [ctx.getHandler(), ctx.getClass()];
    requestQuery(
      req,
      this.reflector.getAllAndOverride<string[]>("hsupick:query", targets) ??
        [],
    );
    if (
      (req.method === "GET" ||
        this.reflector.getAllAndOverride("hsupick:no-body", targets)) &&
      (Number(req.headers["content-length"] ?? 0) > 0 ||
        req.headers["transfer-encoding"])
    )
      invalid("body", "요청 본문을 받지 않습니다.");
    // These two handlers independently authenticate the cookie; an old Bearer
    // header must neither prevent logout nor authorize a cookie operation.
    if (this.reflector.getAllAndOverride("hsupick:cookie-only", targets))
      return true;
    if (req.headers.authorization === undefined) {
      if (this.reflector.getAllAndOverride("hsupick:public", targets))
        return true;
      throw new ApiError(401, "AUTH_REQUIRED", "로그인이 필요합니다.");
    }
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization);
    if (!match)
      throw new ApiError(
        401,
        "INVALID_TOKEN",
        "유효하지 않은 인증 헤더입니다.",
      );
    const principal = await this.tokens.verify(match[1]!);
    await ensureSession(this.db, principal);
    req.principal = principal;
    return true;
  }
}
