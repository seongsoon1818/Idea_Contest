import type { Prisma } from "../generated/prisma/client.js";
import { ApiError, invalid } from "../common/errors.js";
import { objectInput } from "../common/input.js";
import { reserveOnChannelActivation } from "./reconcile.js";

export const channelChangeTransaction = {
  isolationLevel: "ReadCommitted",
  timeout: 30_000,
} as const;

export const activeSubscriptions = (userId: bigint, now: Date) => ({
  userId,
  revokedAt: null,
  OR: [{ expirationAt: null }, { expirationAt: { gt: now } }],
});
export function settingsInput(raw: unknown) {
  const path = "notificationSettings",
    keys = ["deadlineInAppEnabled", "deadlinePushEnabled"] as const;
  const b = objectInput(raw, keys, path);
  if (!Object.keys(b).length) invalid(path, "변경할 채널이 필요합니다.");
  const patch: Partial<Record<(typeof keys)[number], boolean>> = {};
  for (const k of keys)
    if (Object.hasOwn(b, k)) {
      if (typeof b[k] !== "boolean")
        invalid(path + "." + k, "true 또는 false가 필요합니다.");
      patch[k] = b[k];
    }
  return patch;
}
export async function settingsView(
  tx: Prisma.TransactionClient,
  userId: bigint,
  now = new Date(),
) {
  const row = await tx.userNotificationSettings.findUnique({
    where: { userId },
    select: {
      deadlineInAppEnabled: true,
      deadlinePushEnabled: true,
      updatedAt: true,
    },
  });
  if (!row)
    throw new ApiError(
      503,
      "SERVICE_UNAVAILABLE",
      "알림 수신 설정이 초기화되지 않았습니다.",
    );
  return {
    ...row,
    activePushSubscriptionCount: await tx.webPushSubscription.count({
      where: activeSubscriptions(userId, now),
    }),
  };
}
export function stopPush(
  tx: Prisma.TransactionClient,
  userId: bigint,
  reason: string,
  subscriptionId?: bigint,
) {
  return tx.notificationPushDelivery.updateMany({
    where: {
      userId,
      ...(subscriptionId === undefined ? {} : { subscriptionId }),
      status: { in: ["PENDING", "PROCESSING", "RETRY_WAIT"] },
    },
    data: {
      status: "CANCELLED",
      lockToken: null,
      lockedUntil: null,
      lastErrorCode: reason,
    },
  });
}
// Return true when there was no deliverable channel and pending work was stopped.
export async function stopWithoutChannel(
  tx: Prisma.TransactionClient,
  userId: bigint,
  now: Date,
) {
  const s = await tx.userNotificationSettings.findUnique({ where: { userId } });
  if (
    s?.deadlineInAppEnabled ||
    (s?.deadlinePushEnabled &&
      (await tx.webPushSubscription.count({
        where: activeSubscriptions(userId, now),
      })))
  )
    return false;
  await stopPush(tx, userId, "NO_DELIVERY_CHANNEL");
  await tx.deadlineReminder.updateMany({
    where: { userId, status: { in: ["PENDING", "PROCESSING"] } },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      cancelReason: "NO_DELIVERY_CHANNEL",
      lockToken: null,
      lockedUntil: null,
    },
  });
  return true;
}
export async function finishChannelChange(
  tx: Prisma.TransactionClient,
  userId: bigint,
  wasInactive: boolean,
  now: Date,
) {
  const inactive = await stopWithoutChannel(tx, userId, now);
  if (wasInactive && !inactive)
    await reserveOnChannelActivation(tx, userId, now);
}
export async function revokePush(
  tx: Prisma.TransactionClient,
  userId: bigint,
  reason: string,
  id?: bigint,
) {
  const now = new Date();
  await tx.webPushSubscription.updateMany({
    where: { userId, revokedAt: null, ...(id === undefined ? {} : { id }) },
    data: { revokedAt: now, revokeReason: reason },
  });
  await stopPush(tx, userId, reason, id);
  await stopWithoutChannel(tx, userId, now);
}
export async function updateSettings(
  tx: Prisma.TransactionClient,
  userId: bigint,
  patch: ReturnType<typeof settingsInput>,
) {
  const now = new Date(),
    old = await settingsView(tx, userId, now);
  if (patch.deadlinePushEnabled && !old.activePushSubscriptionCount)
    throw new ApiError(
      409,
      "ACTIVE_PUSH_SUBSCRIPTION_REQUIRED",
      "유효한 브라우저 구독을 먼저 등록해 주세요.",
    );
  // The last push subscription may have expired while the worker was offline.
  const wasInactive =
    !old.deadlineInAppEnabled &&
    !(old.deadlinePushEnabled && old.activePushSubscriptionCount);
  if (wasInactive) await stopWithoutChannel(tx, userId, now);
  await tx.userNotificationSettings.update({ where: { userId }, data: patch });
  if (patch.deadlinePushEnabled === false)
    await stopPush(tx, userId, "PUSH_DISABLED");
  await finishChannelChange(tx, userId, wasInactive, now);
}
