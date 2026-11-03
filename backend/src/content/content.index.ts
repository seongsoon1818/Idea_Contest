import { Prisma, type DatePrecision } from "../generated/prisma/client.js";
import type { MatchingProfile } from "./matching-profile.js";
import type { ContentQuery, RecruitmentStatus } from "./content.query.js";

type Match = "MATCH" | "MISMATCH" | "UNKNOWN";
export interface IndexRow {
  content_type: "notice" | "program";
  id: bigint;
  public_id: string;
  ready_id: bigint | null;
  recruitment: RecruitmentStatus;
  start_raw: string | null;
  start_precision: DatePrecision | null;
  start_date: Date | null;
  start_at: Date | null;
  end_raw: string | null;
  end_precision: DatePrecision | null;
  end_date: Date | null;
  end_at: Date | null;
  days_left: number | bigint | null;
  deadline_count: number | bigint;
  grade_match: Match;
  unit_match: Match;
  eligibility: Match;
  source_conflict: number | bigint;
  topic_points: number | bigint;
  grade_points: number | bigint;
  unit_points: number | bigint;
  saved_at?: Date;
  reminder_enabled?: number | bigint;
  unavailable?: number | bigint;
}
const sql = Prisma.sql;
const dueWithin = (days: number) => sql`days_left BETWEEN 0 AND ${days}`;
const ids = (values: bigint[]) =>
  values.length ? Prisma.join(values) : sql`NULL`;

type Sources = {
  kind: "notice" | "program";
  base: Prisma.Sql;
  routes: Prisma.Sql;
  bookmarkUserId?: bigint | undefined;
};
function matching(profile: MatchingProfile | null, kind: Sources["kind"]) {
  if (!profile)
    return { grade: sql`'UNKNOWN'`, unit: sql`'UNKNOWN'`, topic: sql`0` };
  const grades =
    kind === "program"
      ? sql`FROM program_target_grades g WHERE g.revision_id=b.ready_id AND g.purpose='REQUIRED'`
      : sql`FROM notice_target_grades g WHERE g.summary_id=b.ready_id AND g.purpose='REQUIRED'`;
  const units =
    kind === "program"
      ? sql`FROM program_target_units u WHERE u.revision_id=b.ready_id AND u.purpose='REQUIRED'`
      : sql`FROM notice_target_units u WHERE u.summary_id=b.ready_id AND u.purpose='REQUIRED'`;
  return {
    grade: sql`CASE WHEN b.grade_scope='ALL' THEN 'MATCH' WHEN b.grade_scope='RESTRICTED' THEN
      CASE WHEN EXISTS(SELECT 1 ${grades} AND g.grade=${profile.grade}) THEN 'MATCH'
      WHEN b.has_exceptions OR ${profile.grade}='OTHER' OR NOT EXISTS(SELECT 1 ${grades}) THEN 'UNKNOWN' ELSE 'MISMATCH' END
      ELSE 'UNKNOWN' END`,
    unit: sql`CASE WHEN b.academic_scope='ALL' THEN 'MATCH' WHEN b.academic_scope='RESTRICTED' THEN
      CASE WHEN EXISTS(SELECT 1 ${units} AND (u.academic_unit_id IN (${ids(profile.selected)})
        OR (u.include_descendants AND u.academic_unit_id IN (${ids(profile.ancestors)})))) THEN 'MATCH'
      WHEN b.has_exceptions OR ${profile.selected.length}=0 OR NOT EXISTS(SELECT 1 ${units})
        OR EXISTS(SELECT 1 ${units} AND u.academic_unit_id IN (${ids(profile.possibleDescendants)})) THEN 'UNKNOWN'
      ELSE 'MISMATCH' END ELSE 'UNKNOWN' END`,
    topic: sql`CASE WHEN b.primary_topic_id IN (${ids(profile.topics)}) THEN 100 ELSE 0 END`,
  };
}

// Give either domain the same exact-time / Seoul civil-day comparison.
function windowState(at: Prisma.Sql, day: Prisma.Sql) {
  return sql`CASE WHEN end_at<=${at} OR end_date<${day} THEN 'closed'
    WHEN start_at>${at} OR start_date>${day} THEN 'upcoming'
    WHEN (start_at IS NOT NULL OR start_date IS NOT NULL) AND (end_at IS NOT NULL OR end_date IS NOT NULL) THEN 'open'
    ELSE 'unknown' END`;
}
function aggregate(
  open: Prisma.Sql,
  unknown: Prisma.Sql,
  upcoming: Prisma.Sql,
) {
  return sql`CASE WHEN b.application_status='not_applicable' THEN 'not_applicable' WHEN ${open} THEN 'open'
    WHEN ${unknown} OR w.id IS NULL THEN 'unknown' WHEN ${upcoming} THEN 'upcoming' ELSE 'closed' END`;
}
export type IndexPage = { total: number; rows: IndexRow[] };
// Page a narrow index of public revisions/approved summaries, not original bodies or analysis JSON.
// All interpolated values are bound parameters; only the fixed sort clauses are SQL fragments.
function candidateTables(
  query: ContentQuery,
  profile: MatchingProfile | null,
  now: Date,
  sources: Sources,
) {
  const today = new Date(now.getTime() + 9 * 3600_000)
    .toISOString()
    .slice(0, 10);
  const match = matching(profile, sources.kind);
  const program = sources.kind === "program";
  const filters: Prisma.Sql[] = [];
  if (query.status !== "all") filters.push(sql`recruitment=${query.status}`);
  if (query.recommendedOnly) filters.push(sql`eligibility<>'MISMATCH'`);
  if (query.days !== null) filters.push(dueWithin(query.days));
  const uid = sources.bookmarkUserId;
  const includeUnavailable =
    query.status === "all" &&
    !query.q &&
    !query.topic &&
    !query.category &&
    !query.recommendedOnly &&
    query.days === null;
  const saved = program
    ? sql`SELECT p.id,p.public_id,b.created_at saved_at,b.deadline_reminder_enabled reminder_enabled FROM user_program_bookmarks b JOIN programs p ON p.id=b.program_id WHERE b.user_id=${uid}`
    : sql`SELECT n.id,n.public_id,b.created_at saved_at,b.deadline_reminder_enabled reminder_enabled FROM user_notice_bookmarks b JOIN notices n ON n.id=b.notice_id WHERE b.user_id=${uid}`;
  // Keep hidden bookmarks in the same database count, order and page as visible cards.
  const pageSource =
    uid === undefined
      ? sql`SELECT * FROM matches`
      : sql`
    SELECT m.*, b.id AS saved_id, b.public_id AS saved_public_id, b.saved_at, b.reminder_enabled, m.id IS NULL AS unavailable
    FROM saved b LEFT JOIN matches m ON m.id=b.id WHERE m.id IS NOT NULL
    ${includeUnavailable ? sql`OR NOT EXISTS(SELECT 1 FROM base v WHERE v.id=b.id)` : Prisma.empty}`;
  return sql`
    WITH ${uid === undefined ? Prisma.empty : sql`saved AS (${saved}),`} base AS (
      ${uid === undefined ? sources.base : sql`SELECT visible.* FROM (${sources.base}) visible JOIN saved ON saved.id=visible.id`}
    ), routes AS (
      ${sources.routes}
    ), boundaries AS (
      SELECT routes.*, COALESCE(end_date,DATE(DATE_ADD(end_at,INTERVAL 9 HOUR))) AS deadline_day,
        ${windowState(sql`${now}`, sql`${today}`)} AS window_state
        ${program ? sql`, ${windowState(sql`b.observed_at`, sql`DATE(DATE_ADD(b.observed_at,INTERVAL 9 HOUR))`)} AS observed_window` : Prisma.empty}
      FROM routes ${program ? sql`JOIN base b ON b.id=routes.id` : Prisma.empty}
    ), choices AS (
      SELECT boundaries.*,COUNT(end_precision) OVER(PARTITION BY id) AS deadline_count,
        MAX(window_state='open') OVER(PARTITION BY id) AS any_open,
        MAX(window_state='unknown') OVER(PARTITION BY id) AS any_unknown,
        MAX(window_state='upcoming') OVER(PARTITION BY id) AS any_upcoming,
        ${
          program
            ? sql`MAX(observed_window='open') OVER(PARTITION BY id) AS obs_open,
          MAX(observed_window='unknown') OVER(PARTITION BY id) AS obs_unknown,
          MAX(observed_window='upcoming') OVER(PARTITION BY id) AS obs_upcoming,`
            : Prisma.empty
        }
        ROW_NUMBER() OVER(PARTITION BY id ORDER BY CASE WHEN deadline_day IS NULL THEN 3
          WHEN window_state='open' THEN 0 WHEN window_state='upcoming' THEN 1 ELSE 2 END,
          CASE WHEN window_state IN ('open','upcoming') THEN deadline_day END,
          CASE WHEN window_state NOT IN ('open','upcoming') THEN deadline_day END DESC,
          end_at IS NULL,CASE WHEN window_state NOT IN ('open','upcoming') THEN end_at END DESC,end_at,source_kind,sort_order,route_id) AS choice_no
      FROM boundaries
    ), evaluated AS (
      SELECT b.*, ${sources.kind} AS content_type,w.start_raw,w.start_precision,w.start_date,w.start_at,w.end_raw,w.end_precision,w.end_date,w.end_at,w.deadline_day,
        DATEDIFF(w.deadline_day,${today}) AS days_left,COALESCE(w.deadline_count,0) AS deadline_count,
        ${aggregate(sql`w.any_open`, sql`w.any_unknown`, sql`w.any_upcoming`)} AS scheduled_state,
        ${program ? sql`${aggregate(sql`w.obs_open`, sql`w.obs_unknown`, sql`w.obs_upcoming`)} AS observed_state,` : Prisma.empty}
        ${match.grade} AS grade_match, ${match.unit} AS unit_match, ${match.topic} AS topic_points
      FROM base b LEFT JOIN choices w ON w.id=b.id AND w.choice_no=1
    ), classified AS (
      SELECT evaluated.*, ${program ? sql`COALESCE(reported_state IS NOT NULL AND observed_state IN ('open','closed','upcoming') AND reported_state<>observed_state,0)` : sql`0`} AS source_conflict
      FROM evaluated
    ), scored AS (
      SELECT classified.*,CASE WHEN source_conflict THEN 'unknown' ELSE scheduled_state END AS recruitment,
        CASE WHEN grade_match='MISMATCH' OR unit_match='MISMATCH' THEN 'MISMATCH'
        WHEN grade_match='MATCH' AND unit_match='MATCH' AND NOT manual_check THEN 'MATCH' ELSE 'UNKNOWN' END AS eligibility,
        CASE WHEN grade_scope='RESTRICTED' AND grade_match='MATCH' THEN 10 ELSE 0 END AS grade_points,
        CASE WHEN academic_scope='RESTRICTED' AND unit_match='MATCH' THEN 20 ELSE 0 END AS unit_points
      FROM classified
    ), matches AS (SELECT * FROM scored ${filters.length ? sql`WHERE ${Prisma.join(filters, " AND ")}` : Prisma.empty}),
    candidates AS (${pageSource})`;
}

// Both domains expose the same ranking and card fields. Only the selected page needs hydration.
const commonFields = sql`content_type,id,public_id,ready_id,published_date,recruitment,
  start_raw,start_precision,start_date,start_at,end_raw,end_precision,end_date,end_at,
  deadline_day,days_left,deadline_count,grade_match,unit_match,eligibility,source_conflict,topic_points,grade_points,unit_points`;
function orderBy(
  query: ContentQuery,
  profile: MatchingProfile | null,
  tie: Prisma.Sql,
) {
  const deadlineOrder = sql`deadline_day IS NULL, deadline_day, end_at IS NULL, end_at, ${tie}`;
  if (query.sort === "saved") return sql`saved_at DESC, ${tie}`;
  if (query.sort === "latest")
    return sql`published_date IS NULL, published_date DESC, ${tie}`;
  if (query.sort === "recommended" && profile)
    return sql`(topic_points+grade_points+unit_points) DESC, ${deadlineOrder}`;
  return deadlineOrder;
}

// Aggregate all open recommendation candidates before limiting this type's cards.
export async function homePickIndex(
  tx: Prisma.TransactionClient,
  query: ContentQuery,
  profile: MatchingProfile | null,
  now: Date,
  sources: Sources,
) {
  const rows = await tx.$queryRaw<
    (IndexRow & { total: bigint; urgent: bigint })[]
  >(sql`
    ${candidateTables(query, profile, now, sources)}
    SELECT candidates.*, COUNT(*) OVER () AS total,
      COUNT(CASE WHEN ${dueWithin(3)} THEN 1 END) OVER () AS urgent
    FROM candidates ORDER BY ${orderBy(query, profile, sql`public_id`)} LIMIT ${query.size}
  `);
  return {
    rows,
    total: Number(rows[0]?.total ?? 0),
    urgent: Number(rows[0]?.urgent ?? 0),
  };
}

export async function pageIndex(
  tx: Prisma.TransactionClient,
  query: ContentQuery,
  profile: MatchingProfile | null,
  now: Date,
  sources: Sources,
  second?: Sources,
): Promise<IndexPage> {
  const first = candidateTables(query, profile, now, sources);
  const tables = second
    ? sql`WITH candidates AS (
    SELECT * FROM (${first} SELECT ${commonFields} FROM candidates) first_type
    UNION ALL SELECT * FROM (${candidateTables(query, profile, now, second)} SELECT ${commonFields} FROM candidates) second_type
  )`
    : first;
  const tie = second
    ? sql`public_id,content_type`
    : sources.bookmarkUserId === undefined
      ? sql`public_id`
      : sql`saved_public_id`;
  const sort = orderBy(query, profile, tie);
  type Result = IndexRow & {
    total: bigint;
    saved_id?: bigint;
    saved_public_id?: string;
  };
  const result = await tx.$queryRaw<Result[]>(sql`${tables},
    totals AS (SELECT COUNT(*) AS total FROM candidates),
    paged AS (SELECT * FROM candidates ORDER BY ${sort} LIMIT ${query.size} OFFSET ${BigInt(query.page - 1) * BigInt(query.size)})
    SELECT totals.total,paged.* FROM totals LEFT JOIN paged ON TRUE ORDER BY ${sort}
  `);
  return {
    total: Number(result[0]?.total ?? 0),
    rows: result
      .filter((r) => r.id != null || r.saved_id != null)
      .map((r) =>
        r.saved_id != null && r.saved_public_id != null
          ? { ...r, id: r.saved_id, public_id: r.saved_public_id }
          : r,
      ),
  };
}
