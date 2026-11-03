import { Module } from "@nestjs/common";
import { ProgramController } from "./program.controller.js";
import { ProgramService } from "./program.service.js";
@Module({ controllers: [ProgramController], providers: [ProgramService] })
export class ProgramModule {}
