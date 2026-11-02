import { Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ApiError, disabled, invalid, reauthFailed } from "../common/errors.js";
import type { Principal } from "../common/http.js";
import { idInput, objectInput, textInput } from "../common/input.js";
import {
  hashPassword,
  loginIdInput,
  passwordInput,
  verifyPassword,
} from "./credentials.js";
import { lockAccount, lockViewer } from "./session-access.js";
import { newRefresh, refreshHash, SESSION_MS, Tokens } from "./tokens.js";
import { userSelect, userView } from "../user/user.view.js";

const badLogin = () =>
  new ApiError(
    401,
    "INVALID_CREDENTIALS",
    "아이디 또는 비밀번호를 확인해 주세요.",
  );
const badRefresh = () =>
  new ApiError(401, "INVALID_REFRESH_TOKEN", "다시 로그인해 주세요.");

async function revokePush(
  tx: Prisma.TransactionClient,
  userId: bigint,
  reason: string,
  id?: bigint,
) {
  await tx.webPushSubscription.updateMany({
    where: { userId, revokedAt: null, ...(id ? { id } : {}) },
    data: { revokedAt: new Date(), revokeReason: reason },
  });
  await tx.notificationPushDelivery.updateMany({
    where: {
      userId,
      ...(id ? { subscriptionId: id } : {}),
      status: { in: ["PENDING", "PROCESSING", "RETRY_WAIT"] },
    },
    data: { status: "CANCELLED", lockToken: null, lockedUntil: null },
  });
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: PrismaService,
    private readonly tokens: Tokens,
  ) {}
  private async session(tx: Prisma.TransactionClient, userId: bigint) {
    const refresh = newRefresh(),
      until = new Date(Date.now() + SESSION_MS);
    const session = await tx.userSession.create({
      data: {
        userId,
        expiresAt: until,
        refreshTokenHash: refreshHash(refresh),
      },
    });
    return {
      refresh,
      data: await this.tokens.issue(userId, session.id, until),
    };
  }
  async signup(raw: unknown) {
    const b = objectInput(raw, ["loginId", "password", "name"]);
    const loginId = loginIdInput(b.loginId),
      name = textInput(b.name, "name", 30);
    const passwordHash = await hashPassword(
      passwordInput(b.password, "password", true),
    );
    return this.db.$transaction(async (tx) => {
      const row = await tx.user
        .create({
          data: {
            loginId,
            name,
            passwordHash,
            lastLoginAt: new Date(),
            profile: { create: {} },
            notificationSettings: {
              create: {
                deadlineInAppEnabled: true,
                deadlinePushEnabled: false,
              },
            },
          },
          select: userSelect,
        })
        .catch((error: unknown) => {
          if ((error as { code?: string })?.code === "P2002")
            throw new ApiError(
              409,
              "LOGIN_ID_TAKEN",
              "이미 사용 중인 아이디입니다.",
            );
          throw error;
        });
      const result = await this.session(tx, row.id);
      return { ...result, data: { ...result.data, user: userView(row) } };
    });
  }
  async login(raw: unknown) {
    const b = objectInput(raw, ["loginId", "password"]);
    const loginId = loginIdInput(b.loginId),
      password = passwordInput(b.password, "password");
    const attempt = await this.db.user.findUnique({
      where: { loginId },
      select: { id: true, passwordHash: true },
    });
    const ok = await verifyPassword(password, attempt?.passwordHash);
    if (!attempt || !ok) throw badLogin();
    return this.db.$transaction(async (tx) => {
      await lockAccount(tx, attempt.id);
      const current = await tx.user.findUnique({
        where: { id: attempt.id },
        select: { passwordHash: true, status: true },
      });
      if (!current || current.passwordHash !== attempt.passwordHash)
        throw badLogin();
      if (current.status !== "ACTIVE") throw disabled();
      const user = await tx.user.update({
        where: { id: attempt.id },
        data: { lastLoginAt: new Date() },
        select: userSelect,
      });
      const result = await this.session(tx, attempt.id);
      return { ...result, data: { ...result.data, user: userView(user) } };
    });
  }
  async refresh(cookie: string | undefined) {
    if (!cookie) throw badRefresh();
    const hash = refreshHash(cookie);
    const session = await this.db.userSession.findUnique({
      where: { refreshTokenHash: hash },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date())
      throw badRefresh();
    return this.db.$transaction(async (tx) => {
      await lockAccount(tx, session.userId);
      const refresh = newRefresh();
      const rotated = await tx.userSession.updateMany({
        where: {
          id: session.id,
          refreshTokenHash: hash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { refreshTokenHash: refreshHash(refresh) },
      });
      if (rotated.count !== 1) throw badRefresh();
      const account = await tx.user.findUnique({
        where: { id: session.userId },
        select: { status: true },
      });
      if (account?.status !== "ACTIVE") throw disabled(); // roll rotation back
      return {
        refresh,
        data: await this.tokens.issue(
          session.userId,
          session.id,
          session.expiresAt,
        ),
      };
    });
  }
  async logout(cookie: string | undefined, raw: unknown) {
    const b = objectInput(raw === undefined ? {} : raw, ["pushSubscriptionId"]);
    const id =
      b.pushSubscriptionId === undefined
        ? undefined
        : idInput(b.pushSubscriptionId, "pushSubscriptionId");
    if (cookie) {
      const hash = refreshHash(cookie);
      const session = await this.db.userSession.findUnique({
        where: { refreshTokenHash: hash },
      });
      if (session && !session.revokedAt && session.expiresAt > new Date())
        await this.db.$transaction(async (tx) => {
          await lockAccount(tx, session.userId);
          const changed = await tx.userSession.updateMany({
            where: {
              id: session.id,
              refreshTokenHash: hash,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            data: { revokedAt: new Date() },
          });
          if (!changed.count || id === undefined) return;
          if (
            !(await tx.webPushSubscription.findFirst({
              where: { id, userId: session.userId },
              select: { id: true },
            }))
          )
            throw new ApiError(
              404,
              "RESOURCE_NOT_FOUND",
              "구독을 찾을 수 없습니다.",
            );
          await revokePush(tx, session.userId, "LOGOUT", id);
        });
    }
    return { loggedOut: true };
  }
  // Verify the expensive password hash before locking; compare it again under the account lock.
  async withReauthentication<T>(
    viewer: Principal,
    password: string,
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    const old = await this.db.user.findUnique({
      where: { id: viewer.userId },
      select: { passwordHash: true },
    });
    if (!(await verifyPassword(password, old?.passwordHash)) || !old)
      throw reauthFailed();
    return this.db.$transaction(async (tx) => {
      await lockViewer(tx, viewer);
      const current = await tx.user.findUnique({
        where: { id: viewer.userId },
        select: { passwordHash: true },
      });
      if (current?.passwordHash !== old.passwordHash) throw reauthFailed();
      return action(tx);
    });
  }
  async changePassword(viewer: Principal, raw: unknown) {
    const b = objectInput(raw, ["currentPassword", "newPassword"]);
    const current = passwordInput(b.currentPassword, "currentPassword"),
      next = passwordInput(b.newPassword, "newPassword", true);
    if (current === next)
      invalid("newPassword", "기존 비밀번호와 다른 값을 입력하세요.");
    const passwordHash = await hashPassword(next);
    return this.withReauthentication(viewer, current, async (tx) => {
      await tx.user.update({
        where: { id: viewer.userId },
        data: { passwordHash },
      });
      await tx.userSession.updateMany({
        where: { userId: viewer.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await revokePush(tx, viewer.userId, "PASSWORD_CHANGED");
      return { changed: true, reauthenticationRequired: true };
    });
  }
}
