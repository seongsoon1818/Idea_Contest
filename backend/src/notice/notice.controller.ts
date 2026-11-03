import { Controller, Get, Param, Req } from "@nestjs/common";
import { AllowQuery, Public } from "../auth/session-access.js";
import { requestQuery, type ApiRequest } from "../common/http.js";
import { queryKeys } from "./notice.query.js";
import { NoticeService } from "./notice.service.js";

@Public()
@Controller("notices")
export class NoticeController {
  constructor(private readonly notices: NoticeService) {}
  @Get()
  @AllowQuery(...queryKeys)
  list(@Req() req: ApiRequest) {
    return this.notices.list(
      requestQuery(req, queryKeys),
      req.principal?.userId,
    );
  }
  @Get(":noticeId")
  detail(@Param("noticeId") noticeId: string, @Req() req: ApiRequest) {
    return this.notices.detail(noticeId, req.principal?.userId);
  }
  @Get(":noticeId/content")
  content(@Param("noticeId") noticeId: string) {
    return this.notices.content(noticeId);
  }
}
