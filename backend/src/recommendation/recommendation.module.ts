import { Module } from "@nestjs/common";
import { RecommendationController } from "./recommendation.controller.js";
import { RecommendationService } from "./recommendation.service.js";

@Module({
  controllers: [RecommendationController],
  providers: [RecommendationService],
})
export class RecommendationModule {}
