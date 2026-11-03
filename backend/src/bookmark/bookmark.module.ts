import { Module } from "@nestjs/common";
import { BookmarkController } from "./bookmark.controller.js";
import { BookmarkService } from "./bookmark.service.js";
@Module({ controllers: [BookmarkController], providers: [BookmarkService] })
export class BookmarkModule {}
