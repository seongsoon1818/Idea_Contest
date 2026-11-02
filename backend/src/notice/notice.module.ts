import { Module } from "@nestjs/common";
import { NoticeController } from "./notice.controller.js";
import { NoticeService } from "./notice.service.js";
@Module({ controllers: [NoticeController], providers: [NoticeService] })
export class NoticeModule {}
