import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  Res,
} from "@nestjs/common";
import { Viewer } from "../auth/session-access.js";
import { Tokens } from "../auth/tokens.js";
import type { Principal, ApiResponse } from "../common/http.js";
import { UserService } from "./user.service.js";

@Controller("users/me")
export class UserController {
  constructor(
    private readonly users: UserService,
    private readonly tokens: Tokens,
  ) {}
  @Get() account(@Viewer() viewer: Principal) {
    return this.users.account(viewer);
  }
  @Patch() patch(@Viewer() viewer: Principal, @Body() body: unknown) {
    return this.users.save(viewer, body, false);
  }
  @Get("profile") profile(@Viewer() viewer: Principal) {
    return this.users.profile(viewer);
  }
  @Put("profile") async put(
    @Viewer() viewer: Principal,
    @Body() body: unknown,
  ) {
    return (await this.users.save(viewer, body, true)).profile;
  }
  @Post("withdraw")
  @HttpCode(200)
  async withdraw(
    @Viewer() viewer: Principal,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: ApiResponse,
  ) {
    const data = await this.users.withdraw(viewer, body);
    this.tokens.cookie(res);
    return data;
  }
}
