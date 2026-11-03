import type { Prisma } from "../generated/prisma/client.js";
import {
  activeStatuses,
  type Kind,
  type ReminderPlan,
  reminderScope,
} from "./deadline-plans.js";

async function cancelPending(
  tx: Prisma.TransactionClient,
  userId: bigint,
  where: Prisma.DeadlineReminderWhereInput,
  now: Date,
  reason: string,
) {
  const scope = { ...where, userId };
  await tx.deadlineReminder.updateMany({
    where: { ...scope, status: { in: [...activeStatuses] } },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      cancelReason: reason,
      lockedUntil: null,
      lockToken: null,
    },
  });
  // A COMPLETED reminder can still own an unsent push.
  await tx.notificationPushDelivery.updateMany({
    where: {
      userId,
      status: { in: ["PENDING", "PROCESSING", "RETRY_WAIT"] },
      notification: { reminder: scope },
    },
    data: {
      status: "CANCELLED",
      lockedUntil: null,
      lockToken: null,
      lastErrorCode: reason,
    },
  });
}
export function cancelBookmarkReminders(
  tx: Prisma.TransactionClient,
  kind: Kind,
  userId: bigint,
  id: bigint,
  now: Date,
  reason: string,
) {
  return cancelPending(
    tx,
    userId,
    reminderScope(kind, userId, id),
    now,
    reason,
  );
}
export async function invalidateObsolete(
  tx: Prisma.TransactionClient,
  kind: Kind,
  userId: bigint,
  id: bigint,
  plan: ReminderPlan,
  now: Date,
) {
  const scope = reminderScope(kind, userId, id);
  const keys = [...plan.candidates.keys()];
  const obsolete = {
    ...scope,
    ...(keys.length ? { dedupKey: { notIn: keys } } : {}),
  };
  await cancelPending(tx, userId, obsolete, now, "SOURCE_CHANGED");
  await tx.notification.updateMany({
    where: { userId, invalidatedAt: null, reminder: obsolete },
    data: { invalidatedAt: now },
  });
}
// Both the bookmark API and the worker hold the account lock before the content lock.
export async function reconcileReminders(
  tx: Prisma.TransactionClient,
  kind: Kind,
  userId: bigint,
  id: bigint,
  readyId: bigint | null,
  plan: ReminderPlan,
  now: Date,
) {
  const scope = reminderScope(kind, userId, id);
  await invalidateObsolete(tx, kind, userId, id, plan, now);
  if (!plan.channel) {
    await cancelPending(tx, userId, scope, now, "NO_DELIVERY_CHANNEL");
    return;
  }
  const inserts: Prisma.DeadlineReminderCreateManyInput[] = [];
  await reserveDeadlines(tx, kind, userId, id, readyId, plan, now, inserts);
  if (inserts.length) await tx.deadlineReminder.createMany({ data: inserts });
}

// Update existing jobs under the account/content locks; collect new jobs for one batch insert.
export async function reserveDeadlines(
  tx: Prisma.TransactionClient,
  kind: Kind,
  userId: bigint,
  id: bigint,
  readyId: bigint | null,
  plan: ReminderPlan,
  now: Date,
  inserts: Prisma.DeadlineReminderCreateManyInput[],
) {
  if (!plan.channel || plan.review || readyId === null || !plan.candidates.size)
    return;
  const scope = reminderScope(kind, userId, id);
  const history = new Map(plan.history.map((h) => [h.dedupKey, h]));
  for (const candidate of plan.candidates.values()) {
    const old = history.get(candidate.dedupKey);
    if (
      old &&
      (old.status === "COMPLETED" ||
        old.status === "FAILED" ||
        old.status === "EXPIRED")
    )
      continue;
    const active = old?.status === "PENDING" || old?.status === "PROCESSING";
    if (active && candidate.deliverBefore <= now) {
      await tx.deadlineReminder.updateMany({
        where: { id: old.id, status: { in: [...activeStatuses] } },
        data: { status: "EXPIRED", lockToken: null, lockedUntil: null },
      });
      continue;
    }
    if (!active && candidate.scheduledAt <= now) continue;
    const version =
      kind === "notice"
        ? { noticeSummaryId: readyId }
        : { programRevisionId: readyId };
    if (active) {
      if (
        (old.noticeSummaryId ?? old.programRevisionId) !== readyId ||
        old.scheduledAt.getTime() !== candidate.scheduledAt.getTime() ||
        old.deliverBefore.getTime() !== candidate.deliverBefore.getTime()
      ) {
        await tx.deadlineReminder.updateMany({
          where: { id: old.id, status: { in: [...activeStatuses] } },
          data: {
            ...version,
            ...candidate,
            nextAttemptAt: candidate.scheduledAt,
            policyVersion: "deadline-d1-v1",
            status: "PENDING",
            lockToken: null,
            lockedUntil: null,
          },
        });
      }
      continue;
    }
    const data = {
      ...scope,
      ...version,
      ...candidate,
      policyVersion: "deadline-d1-v1",
      nextAttemptAt: candidate.scheduledAt,
    };
    if (old) {
      await tx.deadlineReminder.updateMany({
        where: { id: old.id, status: "CANCELLED" },
        data: {
          ...data,
          status: "PENDING",
          cancelledAt: null,
          cancelReason: null,
          lastError: null,
          attemptCount: 0,
        },
      });
    } else inserts.push(data);
  }
}
