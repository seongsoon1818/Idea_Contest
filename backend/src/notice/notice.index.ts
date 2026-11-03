import { Prisma, type DatePrecision } from "../generated/prisma/client.js";
import type { MatchingProfile } from "./notice.context.js";
import type { NoticeQuery, RecruitmentStatus } from "./notice.query.js";

type Match = "MATCH" | "MISMATCH" | "UNKNOWN";
export interface IndexRow {
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
  topic_points: number | bigint;
  grade_points: number | bigint;
  unit_points: number | bigint;
}
const sql = Prisma.sql;
const ids = (values: bigint[]) =>
  values.length ? Prisma.join(values) : sql`NULL`;

function matching(profile: MatchingProfile | null) {
  if (!profile)
    return { grade: sql`'UNKNOWN'`, unit: sql`'UNKNOWN'`, topic: sql`0` };
  const grades = sql`FROM notice_target_grades g WHERE g.summary_id=b.ready_id AND g.purpose='REQUIRED'`;
  const units = sql`FROM notice_target_units u WHERE u.summary_id=b.ready_id AND u.purpose='REQUIRED'`;
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

// Search only public display fields. Searching the entire JSON would match evidence and internal notes.
function search(term: string) {
  const has = (expr: Prisma.Sql) =>
    sql`LOCATE(LOWER(${term}), LOWER(${expr}))>0`;
  return sql`AND (${has(sql`r.title`)} OR ${has(sql`s.one_line_summary`)} OR ${has(sql`c.name`)}
    OR ${has(sql`t.name`)} OR ${has(sql`r.source_category`)} OR ${has(sql`JSON_UNQUOTE(JSON_EXTRACT(s.audience_json,'$.description.text'))`)}
    OR EXISTS(SELECT 1 FROM JSON_TABLE(s.benefits_json,'$[*]' COLUMNS(txt TEXT PATH '$.text', cond TEXT PATH '$.condition')) benefit
      WHERE ${has(sql`benefit.txt`)} OR ${has(sql`benefit.cond`)})
    OR EXISTS(SELECT 1 FROM JSON_TABLE(s.tags_json,'$[*]' COLUMNS(txt TEXT PATH '$')) tag WHERE ${has(sql`tag.txt`)}))`;
}

export type IndexPage = { total: number; rows: IndexRow[] };
// Page a narrow index of public revisions/approved summaries, not original bodies or analysis JSON.
// All interpolated values are bound parameters; only the fixed sort clauses are SQL fragments.
export async function readIndex(
  tx: Prisma.TransactionClient,
  query: NoticeQuery,
  profile: MatchingProfile | null,
  now: Date,
  publicId?: string,
): Promise<IndexPage> {
  const today = new Date(now.getTime() + 9 * 3600_000)
    .toISOString()
    .slice(0, 10);
  const match = matching(profile);
  const filters: Prisma.Sql[] = [];
  if (query.status !== "all") filters.push(sql`recruitment=${query.status}`);
  if (query.recommendedOnly) filters.push(sql`eligibility<>'MISMATCH'`);
  if (query.days !== null)
    filters.push(sql`days_left BETWEEN 0 AND ${query.days}`);
  const deadlineOrder = sql`deadline_day IS NULL, deadline_day, end_at IS NULL, end_at, public_id`;
  const sort =
    query.sort === "latest"
      ? sql`published_date IS NULL, published_date DESC, public_id`
      : query.sort === "recommended" && profile
        ? sql`(topic_points+grade_points+unit_points) DESC, ${deadlineOrder}`
        : deadlineOrder;

  const result = await tx.$queryRaw<(IndexRow & { total: bigint })[]>(sql`
    WITH base AS (
      SELECT n.id,n.public_id,r.published_date,s.id AS ready_id,s.application_status,s.primary_topic_id,s.grade_scope,s.academic_scope,
        COALESCE(JSON_CONTAINS_PATH(s.audience_json,'one','$.qualifications[*].exceptions[0]','$.exclusions[*].exceptions[0]'),0) AS has_exceptions,
        COALESCE(JSON_CONTAINS_PATH(s.audience_json,'one','$.qualifications[0].text','$.exclusions[0].text'),0) AS manual_check
      FROM notices n JOIN notice_revisions r ON r.id=n.current_revision_id AND r.notice_id=n.id
      LEFT JOIN notice_summaries s ON s.id=n.published_summary_id AND s.notice_id=n.id AND s.revision_id=r.id
        AND s.review_status='APPROVED' AND s.validation_status='VALID'
      LEFT JOIN notice_categories c ON c.id=s.category_id LEFT JOIN topics t ON t.id=s.primary_topic_id
      WHERE n.visibility='PUBLIC'
      ${publicId !== undefined ? sql`AND n.public_id=${publicId}` : Prisma.empty}
      ${query.category ? sql`AND COALESCE(c.code,'unclassified')=${query.category}` : Prisma.empty}
      ${query.topic ? sql`AND t.code=${query.topic}` : Prisma.empty}
      ${query.q ? search(query.q) : Prisma.empty}
    ), routes AS (
      SELECT b.id,0 AS source_kind,p.id AS route_id,p.sort_order,
        p.start_raw,p.start_precision,p.start_date,p.start_at,p.end_raw,p.end_precision,p.end_date,p.end_at
      FROM base b JOIN notice_periods p ON p.summary_id=b.ready_id AND p.role='APPLICATION' WHERE b.application_status='stated'
      UNION ALL
      SELECT b.id,1,i.id,i.sort_order,NULL,NULL,NULL,NULL,i.deadline_raw,i.deadline_precision,i.deadline_date,i.deadline_at
      FROM base b JOIN notice_items i ON i.summary_id=b.ready_id WHERE b.application_status<>'not_applicable'
    ), boundaries AS (
      SELECT routes.*, COALESCE(end_date,DATE(DATE_ADD(end_at,INTERVAL 9 HOUR))) AS deadline_day,
        CASE WHEN end_at<=${now} OR end_date<${today} THEN 'closed'
             WHEN start_at>${now} OR start_date>${today} THEN 'upcoming'
             WHEN (start_at IS NOT NULL OR start_date IS NOT NULL) AND (end_at IS NOT NULL OR end_date IS NOT NULL) THEN 'open'
             ELSE 'unknown' END AS window_state
      FROM routes
    ), choices AS (
      SELECT boundaries.*,COUNT(end_precision) OVER(PARTITION BY id) AS deadline_count,
        MAX(window_state='open') OVER(PARTITION BY id) AS any_open,
        MAX(window_state='unknown') OVER(PARTITION BY id) AS any_unknown,
        MAX(window_state='upcoming') OVER(PARTITION BY id) AS any_upcoming,
        ROW_NUMBER() OVER(PARTITION BY id ORDER BY CASE WHEN deadline_day IS NULL THEN 3
          WHEN window_state='open' THEN 0 WHEN window_state='upcoming' THEN 1 ELSE 2 END,
          CASE WHEN window_state IN ('open','upcoming') THEN deadline_day END,
          CASE WHEN window_state NOT IN ('open','upcoming') THEN deadline_day END DESC,
          end_at IS NULL,CASE WHEN window_state NOT IN ('open','upcoming') THEN end_at END DESC,end_at,source_kind,sort_order,route_id) AS choice_no
      FROM boundaries
    ), evaluated AS (
      SELECT b.*,w.start_raw,w.start_precision,w.start_date,w.start_at,w.end_raw,w.end_precision,w.end_date,w.end_at,w.deadline_day,
        DATEDIFF(w.deadline_day,${today}) AS days_left,COALESCE(w.deadline_count,0) AS deadline_count,
        CASE WHEN b.application_status='not_applicable' THEN 'not_applicable' WHEN w.any_open THEN 'open'
          WHEN w.any_unknown OR w.id IS NULL THEN 'unknown' WHEN w.any_upcoming THEN 'upcoming' ELSE 'closed' END AS recruitment,
        ${match.grade} AS grade_match, ${match.unit} AS unit_match, ${match.topic} AS topic_points
      FROM base b LEFT JOIN choices w ON w.id=b.id AND w.choice_no=1
    ), scored AS (
      SELECT evaluated.*,CASE WHEN grade_match='MISMATCH' OR unit_match='MISMATCH' THEN 'MISMATCH'
        WHEN grade_match='MATCH' AND unit_match='MATCH' AND NOT manual_check THEN 'MATCH' ELSE 'UNKNOWN' END AS eligibility,
        CASE WHEN grade_scope='RESTRICTED' AND grade_match='MATCH' THEN 10 ELSE 0 END AS grade_points,
        CASE WHEN academic_scope='RESTRICTED' AND unit_match='MATCH' THEN 20 ELSE 0 END AS unit_points
      FROM evaluated
    ), matches AS (SELECT * FROM scored ${filters.length ? sql`WHERE ${Prisma.join(filters, " AND ")}` : Prisma.empty}),
    totals AS (SELECT COUNT(*) AS total FROM matches),
    paged AS (SELECT * FROM matches ORDER BY ${sort} LIMIT ${query.size} OFFSET ${BigInt(query.page - 1) * BigInt(query.size)})
    SELECT totals.total,paged.* FROM totals LEFT JOIN paged ON TRUE ORDER BY ${sort}
  `);
  return {
    total: Number(result[0]?.total ?? 0),
    rows: result.filter((r) => r.id != null),
  };
}
