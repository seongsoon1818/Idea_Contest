import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { UserModule } from "./user/user.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { NoticeModule } from "./notice/notice.module.js";

@Module({
  imports: [PrismaModule, AuthModule, UserModule, CatalogModule, NoticeModule],
})
export class AppModule {}
