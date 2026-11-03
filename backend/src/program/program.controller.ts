import { Controller, Get, Param, Req } from "@nestjs/common";
import { AllowQuery, Public } from "../auth/session-access.js";
import { requestQuery, type ApiRequest } from "../common/http.js";
import { contentQueryKeys } from "../content/content.query.js";
import { ProgramService } from "./program.service.js";
const queryKeys = contentQueryKeys("programCategory");
@Public()
@Controller("programs")
export class ProgramController {
  constructor(private readonly programs: ProgramService) {}
  @Get()
  @AllowQuery(...queryKeys)
  list(@Req() req: ApiRequest) {
    return this.programs.list(
      requestQuery(req, queryKeys),
      req.principal?.userId,
    );
  }
  @Get(":programId")
  detail(@Param("programId") id: string, @Req() req: ApiRequest) {
    return this.programs.detail(id, req.principal?.userId);
  }
}
