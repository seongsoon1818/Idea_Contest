import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { ApiRequest, ApiResponse, Principal } from "../common/http.js";
import { NoBody, Public, RefreshCookieOnly, Viewer } from "./session-access.js";
import { AuthService } from "./auth.service.js";
import { Tokens } from "./tokens.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: Tokens,
  ) {}
  @Post("signup")
  @Public()
  async signup(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: ApiResponse,
  ) {
    const { refresh, data } = await this.auth.signup(body);
    this.tokens.cookie(res, refresh, data.refreshExpiresAt);
    return data;
  }
  @Post("login")
  @HttpCode(200)
  @Public()
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: ApiResponse,
  ) {
    const { refresh, data } = await this.auth.login(body);
    this.tokens.cookie(res, refresh, data.refreshExpiresAt);
    return data;
  }
  @Post("refresh")
  @HttpCode(200)
  @NoBody()
  @RefreshCookieOnly()
  async refresh(
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: ApiResponse,
  ) {
    const { refresh, data } = await this.auth.refresh(
      this.tokens.readCookie(req),
    );
    this.tokens.cookie(res, refresh, data.refreshExpiresAt);
    return data;
  }
  @Post("logout")
  @HttpCode(200)
  @RefreshCookieOnly()
  async logout(
    @Req() req: ApiRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: ApiResponse,
  ) {
    const data = await this.auth.logout(this.tokens.readCookie(req), body);
    this.tokens.cookie(res);
    return data;
  }
  @Post("password/change")
  @HttpCode(200)
  async change(
    @Viewer() viewer: Principal,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: ApiResponse,
  ) {
    const data = await this.auth.changePassword(viewer, body);
    this.tokens.cookie(res);
    return data;
  }
}
