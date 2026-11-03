import { createHash } from "node:crypto";
import { Prisma, type DatePrecision } from "../generated/prisma/client.js";
import type { IndexRow } from "../content/content.index.js";

export type Kind = "notice" | "program";
export const reminderScope = (kind: Kind, userId: bigint, id: bigint) =>
  kind === "notice" ? { userId, noticeId: id } : { userId, programId: id };
export const activeStatuses = ["PENDING", "PROCESSING"] as const;
const HOUR = 3_600_000;
type Source = {
  version_id: bigint;
  kind: "NOTICE_PERIOD" | "NOTICE_ITEM" | "PROGRAM_ROOT" | "PROGRAM_SESSION";
  id: bigint;
  label: string;
  end_precision: DatePrecision | null;
  day: Date | null;
  instant: Date | null;
};
type Plan = {
  dedupKey: string;
  deadlinePrecision: "date" | "datetime";
  deadlineDate: Date | null;
  deadlineAt: Date | null;
  scheduledAt: Date;
  deliverBefore: Date;
  sourceRefsJson: { kind: Source["kind"]; id: string; label: string }[];
};

// version IDs come exclusively from the public, current, validated content index.
async function sources(
  tx: Prisma.TransactionClient,
  kind: Kind,
  versions: bigint[],
) {
  if (!versions.length) return [];
  const ids = Prisma.join(versions);
  return tx.$queryRaw<Source[]>(
    kind === "notice"
      ? Prisma.sql`
    SELECT s.id version_id,'NOTICE_PERIOD' kind,p.id,p.label,p.end_precision AS end_precision,p.end_date AS day,p.end_at AS instant
    FROM notice_summaries s JOIN notice_periods p ON p.summary_id=s.id
    WHERE s.id IN (${ids}) AND s.application_status='stated' AND p.role='APPLICATION'
    UNION ALL SELECT s.id,'NOTICE_ITEM',i.id,i.title,i.deadline_precision,i.deadline_date,i.deadline_at
    FROM notice_summaries s JOIN notice_items i ON i.summary_id=s.id
    WHERE s.id IN (${ids}) AND s.application_status<>'not_applicable' ORDER BY version_id,kind,id`
      : Prisma.sql`SELECT r.id version_id,'PROGRAM_ROOT' kind,r.id,r.title label,r.apply_end_precision AS end_precision,r.apply_end_date AS day,r.apply_end_at AS instant
    FROM program_revisions r WHERE r.id IN (${ids}) AND r.application_status='stated'
    UNION ALL SELECT r.id,'PROGRAM_SESSION',s.id,s.title,s.apply_end_precision,s.apply_end_date,s.apply_end_at
    FROM program_revisions r JOIN program_sessions s ON s.revision_id=r.id
    WHERE r.id IN (${ids}) AND r.application_status<>'not_applicable' ORDER BY version_id,kind,id`,
  );
}
function addPlan(
  plans: Map<string, Plan>,
  kind: Kind,
  entityId: bigint,
  s: Source,
) {
  const { end_precision: precision, day, instant } = s;
  const end =
    precision === "date" ? day : precision === "datetime" ? instant : null;
  if (!end || (precision !== "date" && precision !== "datetime")) return;
  const normalized =
    precision === "date" ? end.toISOString().slice(0, 10) : end.toISOString();
  const dedupKey = createHash("sha256")
    .update(
      JSON.stringify([
        "APPLICATION_DEADLINE_D1",
        kind.toUpperCase(),
        entityId.toString(),
        precision,
        normalized,
      ]),
    )
    .digest("hex");
  // MySQL DATE is read at UTC midnight (= 09:00 Seoul). Datetimes are real UTC instants.
  const scheduledAt = new Date(end.getTime() - 24 * HOUR);
  const plan = plans.get(dedupKey) ?? {
    dedupKey,
    deadlinePrecision: precision,
    deadlineDate: day,
    deadlineAt: instant,
    scheduledAt,
    deliverBefore: new Date(scheduledAt.getTime() + HOUR),
    sourceRefsJson: [],
  };
  plan.sourceRefsJson.push({
    kind: s.kind,
    id: s.id.toString(),
    label: s.label,
  });
  plans.set(dedupKey, plan);
}
const historySelect = {
  id: true,
  noticeId: true,
  programId: true,
  noticeSummaryId: true,
  programRevisionId: true,
  dedupKey: true,
  status: true,
  scheduledAt: true,
  deliverBefore: true,
} as const;
type History = Prisma.DeadlineReminderGetPayload<{
  select: typeof historySelect;
}>;
export function reminderHistory(
  tx: Prisma.TransactionClient,
  kind: Kind,
  userId: bigint,
  ids: bigint[],
) {
  return tx.deadlineReminder.findMany({
    where: {
      userId,
      ...(kind === "notice"
        ? { noticeId: { in: ids } }
        : { programId: { in: ids } }),
    },
    select: historySelect,
  });
}
export type ReminderPlan = {
  review: boolean;
  channel: boolean;
  candidates: Map<string, Plan>;
  history: History[];
};
export async function loadPlans(
  tx: Prisma.TransactionClient,
  kind: Kind,
  userId: bigint,
  rows: Pick<IndexRow, "id" | "ready_id" | "source_conflict">[],
  now: Date,
) {
  const plans = new Map<bigint, ReminderPlan>();
  if (!rows.length) return plans;
  const settings = await tx.userNotificationSettings.findUnique({
    where: { userId },
    select: { deadlineInAppEnabled: true, deadlinePushEnabled: true },
  });
  const channel =
    !!settings?.deadlineInAppEnabled ||
    (!!settings?.deadlinePushEnabled &&
      !!(await tx.webPushSubscription.findFirst({
        where: {
          userId,
          revokedAt: null,
          OR: [{ expirationAt: null }, { expirationAt: { gt: now } }],
        },
        select: { id: true },
      })));
  const byVersion = new Map<bigint, bigint>();
  for (const row of rows) {
    const review = row.ready_id == null || !!Number(row.source_conflict);
    plans.set(row.id, { review, channel, candidates: new Map(), history: [] });
    if (!review && row.ready_id != null) byVersion.set(row.ready_id, row.id);
  }
  for (const s of await sources(tx, kind, [...byVersion.keys()])) {
    const id = byVersion.get(s.version_id)!;
    addPlan(plans.get(id)!.candidates, kind, id, s);
  }
  const history = await reminderHistory(
    tx,
    kind,
    userId,
    rows.map((r) => r.id),
  );
  for (const h of history)
    plans.get((kind === "notice" ? h.noticeId : h.programId)!)!.history.push(h);
  return plans;
}
export function preview(state: string, nextScheduledAt: Date | null = null) {
  return { state, nextScheduledAt };
}
export function reminderPreview(
  plan: ReminderPlan,
  enabled: boolean,
  readyId: bigint | null,
  now: Date,
) {
  if (!enabled) return preview("DISABLED");
  if (plan.review) return preview("AWAITING_REVIEW");
  if (!plan.candidates.size) return preview("NO_CONFIRMED_DEADLINE");
  if (!plan.channel) return preview("NO_ACTIVE_CHANNEL");
  const history = new Map(plan.history.map((h) => [h.dedupKey, h]));
  let next: Date | null = null,
    pending = false,
    notified = false,
    failed = false;
  for (const p of plan.candidates.values()) {
    const h = history.get(p.dedupKey);
    if (h?.status === "COMPLETED") notified = true;
    else if (h?.status === "FAILED") failed = true;
    else if (
      h &&
      (h.status === "PENDING" || h.status === "PROCESSING") &&
      h.deliverBefore > now &&
      (h.noticeSummaryId ?? h.programRevisionId) === readyId &&
      h.scheduledAt.getTime() === p.scheduledAt.getTime()
    ) {
      if (!next || h.scheduledAt < next) next = h.scheduledAt;
    } else if (p.scheduledAt > now && h?.status !== "EXPIRED") pending = true;
  }
  if (next) return preview("SCHEDULED", next);
  if (pending) return preview("PENDING_RECONCILIATION");
  return preview(notified ? "ALREADY_NOTIFIED" : failed ? "NONE" : "TOO_LATE");
}
