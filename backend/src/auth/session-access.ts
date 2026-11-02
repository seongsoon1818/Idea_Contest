import { createParamDecorator, SetMetadata } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import type { ApiRequest, Principal } from "../common/http.js";
import { revoked, disabled } from "../common/errors.js";

export const Public = () => SetMetadata("hsupick:public", true);
export const RefreshCookieOnly = () => SetMetadata("hsupick:cookie-only", true);
export const AllowQuery = (...keys: string[]) =>
  SetMetadata("hsupick:query", keys);
export const NoBody = () => SetMetadata("hsupick:no-body", true);
export const Viewer = createParamDecorator(
  (_value: unknown, context: ExecutionContext): Principal =>
    context.switchToHttp().getRequest<ApiRequest>().principal!,
);

export async function ensureSession(
  db: Pick<Prisma.TransactionClient, "userSession">,
  principal: Principal,
) {
  const session = await db.userSession.findUnique({
    where: { id: principal.sessionId },
    select: {
      userId: true,
      revokedAt: true,
      expiresAt: true,
      user: { select: { status: true } },
    },
  });
  if (
    !session ||
    session.userId !== principal.userId ||
    session.revokedAt ||
    session.expiresAt <= new Date()
  )
    throw revoked();
  if (session.user.status !== "ACTIVE") throw disabled();
}

// All account mutations acquire this row first (including login, rotation and withdrawal).
export async function lockAccount(
  tx: Prisma.TransactionClient,
  userId: bigint,
) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
}
export async function lockViewer(
  tx: Prisma.TransactionClient,
  principal: Principal,
) {
  await lockAccount(tx, principal.userId);
  await ensureSession(tx, principal);
}
