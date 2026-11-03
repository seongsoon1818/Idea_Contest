import { Controller, Get, Req } from "@nestjs/common";
import { AllowQuery, Public } from "../auth/session-access.js";
import { requestQuery, type ApiRequest } from "../common/http.js";
import { HomeService } from "./home.service.js";

const queryKeys = ["limitPerType"];
@Public()
@Controller("home")
export class HomeController {
  constructor(private readonly home: HomeService) {}
  @Get()
  @AllowQuery(...queryKeys)
  get(@Req() req: ApiRequest) {
    const { limitPerType } = requestQuery(req, queryKeys);
    return this.home.get(limitPerType, req.principal?.userId);
  }
}
