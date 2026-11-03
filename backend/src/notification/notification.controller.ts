import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { AllowQuery, NoBody, Public, Viewer } from "../auth/session-access.js";
import {
  requestQuery,
  type ApiRequest,
  type ApiResponse,
  type Principal,
} from "../common/http.js";
import { InboxService } from "./inbox.service.js";
import { PushTransport } from "./push.js";
import { SubscriptionsService } from "./subscriptions.service.js";
const page = ["page", "size"],
  filters = [...page, "unreadOnly", "includeInvalidated"];
@Controller()
export class NotificationController {
  constructor(
    private readonly inbox: InboxService,
    private readonly subscriptions: SubscriptionsService,
    private readonly transport: PushTransport,
  ) {}
  @Public() @Get("push/config") config() {
    return this.transport.config();
  }
  @Get("users/me/push-subscriptions")
  @AllowQuery(...page)
  subscriptionsList(@Viewer() v: Principal, @Req() req: ApiRequest) {
    return this.subscriptions.list(v.userId, requestQuery(req, page));
  }
  @Post("users/me/push-subscriptions")
  async register(
    @Viewer() v: Principal,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: ApiResponse,
  ) {
    const { created, subscription } = await this.subscriptions.register(
      v,
      body,
    );
    res.statusCode = created ? 201 : 200;
    return subscription;
  }
  @Delete("users/me/push-subscriptions/:id")
  @NoBody()
  revoke(@Viewer() v: Principal, @Param("id") id: string) {
    return this.subscriptions.revoke(v, id);
  }
  @Get("users/me/notifications")
  @AllowQuery(...filters)
  list(@Viewer() v: Principal, @Req() req: ApiRequest) {
    return this.inbox.list(v.userId, requestQuery(req, filters));
  }
  @Get("users/me/notifications/unread-count")
  count(@Viewer() v: Principal) {
    return this.inbox.unread(v.userId);
  }
  @Patch("users/me/notifications/:id/read")
  read(@Viewer() v: Principal, @Param("id") id: string, @Body() body: unknown) {
    return this.inbox.read(v, id, body);
  }
  @Post("users/me/notifications/read-all")
  @HttpCode(200)
  readAll(@Viewer() v: Principal, @Body() body: unknown) {
    return this.inbox.readAll(v, body);
  }
  @Delete("users/me/notifications/:id")
  @NoBody()
  hide(@Viewer() v: Principal, @Param("id") id: string) {
    return this.inbox.hide(v, id);
  }
}
