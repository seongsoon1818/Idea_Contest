import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AccessGuard } from "./access.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { Tokens } from "./tokens.js";

@Module({
  controllers: [AuthController],
  providers: [
    Tokens,
    AuthService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [AuthService, Tokens],
})
export class AuthModule {}
