import { Prisma } from "../generated/prisma/client.js";
import { pageIndex } from "../content/content.index.js";
import type { MatchingProfile } from "../content/matching-profile.js";
import type { ContentQuery } from "../content/content.query.js";
const sql = Prisma.sql;
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

export function noticeSources(
  query: ContentQuery,
  publicId?: string,
  bookmarkUserId?: bigint,
) {
  const base = sql`      SELECT n.id,n.public_id,r.published_date,s.id AS ready_id,s.application_status,s.primary_topic_id,s.grade_scope,s.academic_scope,
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
      ${query.q ? search(query.q) : Prisma.empty}`;
  const routes = sql`      SELECT b.id,0 AS source_kind,p.id AS route_id,p.sort_order,
        p.start_raw,p.start_precision,p.start_date,p.start_at,p.end_raw,p.end_precision,p.end_date,p.end_at
      FROM base b JOIN notice_periods p ON p.summary_id=b.ready_id AND p.role='APPLICATION' WHERE b.application_status='stated'
      UNION ALL
      SELECT b.id,1,i.id,i.sort_order,NULL,NULL,NULL,NULL,i.deadline_raw,i.deadline_precision,i.deadline_date,i.deadline_at
      FROM base b JOIN notice_items i ON i.summary_id=b.ready_id WHERE b.application_status<>'not_applicable'`;
  return {
    base,
    routes,
    kind: "notice" as const,
    bookmarkUserId,
  };
}

export function readIndex(
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
    noticeSources(query, publicId, bookmarkUserId),
  );
}
