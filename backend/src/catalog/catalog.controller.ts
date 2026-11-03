import { Controller, Get, Req } from "@nestjs/common";
import { AllowQuery, Public } from "../auth/session-access.js";
import { requestQuery, type ApiRequest } from "../common/http.js";
import { CatalogService } from "./catalog.service.js";

const keys = ["q", "kind", "parentId", "grade", "slot"];
@Public()
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get("academic-units")
  @AllowQuery(...keys)
  units(@Req() req: ApiRequest) {
    return this.catalog.units(requestQuery(req, keys));
  }
  @Get("topics") topics() {
    return this.catalog.categories("topic");
  }
  @Get("notice-categories") notices() {
    return this.catalog.categories("noticeCategory");
  }
  @Get("program-categories") programs() {
    return this.catalog.categories("programCategory");
  }
}
