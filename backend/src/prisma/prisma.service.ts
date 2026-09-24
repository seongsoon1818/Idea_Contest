import "dotenv/config";

import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../generated/prisma/client.js";

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL 환경 변수가 설정되지 않았습니다.");
  }

  return databaseUrl;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaMariaDb(getDatabaseUrl());
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
