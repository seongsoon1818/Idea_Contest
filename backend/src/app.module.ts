import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { UserModule } from "./user/user.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { NoticeModule } from "./notice/notice.module.js";

import { ProgramModule } from "./program/program.module.js";
import { BookmarkModule } from "./bookmark/bookmark.module.js";
import { NotificationModule } from "./notification/notification.module.js";
import { RecommendationModule } from "./recommendation/recommendation.module.js";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UserModule,
    CatalogModule,
    NoticeModule,
    ProgramModule,
    BookmarkModule,
    NotificationModule,
    RecommendationModule,
  ],
})
export class AppModule {}
