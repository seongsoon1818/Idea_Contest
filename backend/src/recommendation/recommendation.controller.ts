import { Body, Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import { AllowQuery, Public } from "../auth/session-access.js";
import { requestQuery, type ApiRequest } from "../common/http.js";
import { queryKeys } from "./recommendation.input.js";
import { RecommendationService } from "./recommendation.service.js";

@Public()
@Controller()
export class RecommendationController {
  constructor(private readonly recommendations: RecommendationService) {}
  @Get("recommendations")
  @AllowQuery(...queryKeys)
  list(@Req() req: ApiRequest) {
    return this.recommendations.list(
      requestQuery(req, queryKeys),
      req.principal?.userId,
    );
  }
  @Post("comparisons")
  @HttpCode(200)
  compare(@Body() body: unknown, @Req() req: ApiRequest) {
    return this.recommendations.compare(body, req.principal?.userId);
  }
}
