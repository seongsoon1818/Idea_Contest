import { Prisma } from "../generated/prisma/client.js";
import type { ContentQuery } from "../content/content.query.js";
import { pageIndex } from "../content/content.index.js";
import { jsonArrayContains } from "../content/content.search.js";
import type { MatchingProfile } from "../content/matching-profile.js";

const sql = Prisma.sql;
function search(term: string) {
  const contains = (expr: Prisma.Sql) =>
    sql`LOCATE(LOWER(${term}), LOWER(${expr}))>0`;
  // Search visible values, not raw_metadata_json (which can contain internal/importer fields).
  return sql`AND (${contains(sql`r.title`)} OR ${contains(sql`r.public_summary`)} OR ${contains(sql`c.name`)}
    OR ${contains(sql`t.name`)} OR ${contains(sql`r.source_category`)} OR ${contains(sql`r.audience_text`)}
    OR ${contains(sql`r.points_text`)} OR ${contains(sql`CONCAT(TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM CAST(r.points AS CHAR))),'pt')`)}
    OR ${jsonArrayContains(sql`r.tags_json`, term)})`;
}
export function programSources(
  query: ContentQuery,
  publicId?: string,
  bookmarkUserId?: bigint,
) {
  const base = sql`SELECT p.id,p.public_id,r.id AS ready_id,r.published_date,r.application_status,r.primary_topic_id,
    r.grade_scope,r.academic_scope,r.collected_at AS observed_at,
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.eligibility_basis_json,'$.hasExceptions'))='true',0) AS has_exceptions,
    (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.eligibility_basis_json,'$.requiresSourceCheck'))='true',0) OR
     COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.eligibility_basis_json,'$.hasExceptions'))='true',0)) AS manual_check,
    CASE REPLACE(LOWER(TRIM(r.source_application_state)),' ','')
      WHEN '접수중' THEN 'open' WHEN '모집중' THEN 'open' WHEN '신청중' THEN 'open' WHEN 'open' THEN 'open'
      WHEN '마감' THEN 'closed' WHEN '접수마감' THEN 'closed' WHEN '모집마감' THEN 'closed' WHEN '신청마감' THEN 'closed'
      WHEN '접수종료' THEN 'closed' WHEN '모집종료' THEN 'closed' WHEN '신청종료' THEN 'closed' WHEN 'closed' THEN 'closed'
      WHEN '모집예정' THEN 'upcoming' WHEN '접수예정' THEN 'upcoming' WHEN '신청예정' THEN 'upcoming' WHEN 'upcoming' THEN 'upcoming' END AS reported_state
    FROM programs p JOIN program_revisions r ON r.id=p.current_revision_id AND r.program_id=p.id AND r.validation_status='VALID'
    JOIN program_categories c ON c.id=r.category_id LEFT JOIN topics t ON t.id=r.primary_topic_id WHERE p.visibility='PUBLIC'
    ${publicId === undefined ? Prisma.empty : sql`AND p.public_id=${publicId}`}
    ${query.category ? sql`AND c.code=${query.category}` : Prisma.empty}
    ${query.topic ? sql`AND t.code=${query.topic}` : Prisma.empty}
    ${query.q ? search(query.q) : Prisma.empty}`;

  const routes = sql`SELECT b.id,0 AS source_kind,r.id AS route_id,0 AS sort_order,
    r.apply_start_raw AS start_raw,r.apply_start_precision AS start_precision,r.apply_start_date AS start_date,r.apply_start_at AS start_at,
    r.apply_end_raw AS end_raw,r.apply_end_precision AS end_precision,r.apply_end_date AS end_date,r.apply_end_at AS end_at
    FROM base b JOIN program_revisions r ON r.id=b.ready_id WHERE b.application_status='stated'
      AND (r.apply_start_precision IS NOT NULL OR r.apply_end_precision IS NOT NULL)
    UNION ALL
    SELECT b.id,1,s.id,s.sort_order,s.apply_start_raw,s.apply_start_precision,s.apply_start_date,s.apply_start_at,
      s.apply_end_raw,s.apply_end_precision,s.apply_end_date,s.apply_end_at
    FROM base b JOIN program_sessions s ON s.revision_id=b.ready_id WHERE b.application_status<>'not_applicable'`;
  return {
    kind: "program" as const,
    base,
    routes,
    bookmarkUserId,
  };
}

export function readProgramIndex(
  tx: Prisma.TransactionClient,
  query: ContentQuery,
  profile: MatchingProfile | null,
  now: Date,
  publicId?: string,
  bookmarkUserId?: bigint,
) {
  return pageIndex(
    tx,
    query,
    profile,
    now,
    programSources(query, publicId, bookmarkUserId),
  );
}
