import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  Req,
} from "@nestjs/common";
import { AllowQuery, NoBody, Viewer } from "../auth/session-access.js";
import {
  requestQuery,
  type ApiRequest,
  type Principal,
} from "../common/http.js";
import { contentQueryKeys } from "../content/content.query.js";
import { BookmarkService } from "./bookmark.service.js";
const noticeKeys = contentQueryKeys("noticeCategory"),
  programKeys = contentQueryKeys("programCategory");
@Controller("users/me/bookmarks")
export class BookmarkController {
  constructor(private readonly bookmarks: BookmarkService) {}
  @Get("notice")
  @AllowQuery(...noticeKeys)
  noticeList(@Req() req: ApiRequest, @Viewer() viewer: Principal) {
    return this.bookmarks.list(
      "notice",
      requestQuery(req, noticeKeys),
      viewer.userId,
    );
  }
  @Put("notices/:noticeId")
  @NoBody()
  saveNotice(@Param("noticeId") id: string, @Viewer() viewer: Principal) {
    return this.bookmarks.change("notice", id, viewer, "save");
  }
  @Delete("notices/:noticeId")
  @NoBody()
  removeNotice(@Param("noticeId") id: string, @Viewer() viewer: Principal) {
    return this.bookmarks.change("notice", id, viewer, "remove");
  }
  @Patch("notices/:noticeId")
  settingNotice(
    @Param("noticeId") id: string,
    @Viewer() viewer: Principal,
    @Body() body: unknown,
  ) {
    return this.bookmarks.change("notice", id, viewer, "setting", body);
  }
  @Get("program")
  @AllowQuery(...programKeys)
  programList(@Req() req: ApiRequest, @Viewer() viewer: Principal) {
    return this.bookmarks.list(
      "program",
      requestQuery(req, programKeys),
      viewer.userId,
    );
  }
  @Put("programs/:programId")
  @NoBody()
  saveProgram(@Param("programId") id: string, @Viewer() viewer: Principal) {
    return this.bookmarks.change("program", id, viewer, "save");
  }
  @Delete("programs/:programId")
  @NoBody()
  removeProgram(@Param("programId") id: string, @Viewer() viewer: Principal) {
    return this.bookmarks.change("program", id, viewer, "remove");
  }
  @Patch("programs/:programId")
  settingProgram(
    @Param("programId") id: string,
    @Viewer() viewer: Principal,
    @Body() body: unknown,
  ) {
    return this.bookmarks.change("program", id, viewer, "setting", body);
  }
}
