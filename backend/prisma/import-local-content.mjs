// Run from backend with its local .env. --dry-run is read-only, --apply commits the batch.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { PrismaService } from "../dist/prisma/prisma.service.js";
import { loadRecords, sources } from "./local-content-records.mjs";

async function catalog(tx) {
  const entries = await Promise.all([tx.noticeCategory, tx.programCategory, tx.topic, tx.academicUnit]
    .map(model => model.findMany({select: {code: true, id: true}})));
  return entries.map(rows => new Map(rows.map(r => [r.code, r.id])));
}

function required(map, code) {
  const id = map.get(code);
  assert(id, "DB 카탈로그에 없는 코드: " + code);
  return id;
}

function nextNumber(aggregate, key) {
  return (aggregate._max[key] ?? 0) + 1;
}

async function importNotice(tx, r, notice, sourceId, categoryId, primaryTopicId, apply) {
  const prior = await tx.noticeAnalysis.findUnique({where: {importKey: r.analysis.importKey},
    select: {revision: {select: {noticeId: true}}, summaries: {select: {projectionVersion: true}}}});
  if (prior) {
    assert(notice && prior.revision.noticeId === notice.id && prior.summaries.some(s => s.projectionVersion === r.summary.projectionVersion),
      "기존 분석과 요약 연결을 확인하세요");
    return "동일";
  }
  const action = notice ? "변경" : "신규";
  if (!apply) return action;
  notice ??= await tx.notice.create({data: {...r.identity, sourceId}});
  const noticeId = notice.id;
  let revision = await tx.noticeRevision.findFirst({where: {noticeId, sourceHash: r.revision.sourceHash,
    preprocessVersion: r.revision.preprocessVersion}, orderBy: {revisionNo: "desc"}});
  if (!revision) {
    const previous = await tx.noticeRevision.aggregate({where: {noticeId}, _max: {revisionNo: true}});
    revision = await tx.noticeRevision.create({data: {...r.revision, noticeId, revisionNo: nextNumber(previous, "revisionNo"),
      assets: {create: r.assets}}});
  }
  const analysis = await tx.noticeAnalysis.create({data: {...r.analysis, revisionId: revision.id}, select: {id: true}});
  const previous = await tx.noticeSummary.aggregate({where: {noticeId}, _max: {versionNo: true}});
  const fresh = +new Date(r.identity.lastSeenAt) >= +notice.lastSeenAt;
  const publish = fresh && r.summary.validationStatus === "VALID";
  const approval = publish ? {
    reviewStatus: "APPROVED", reviewedAt: new Date(), reviewNote: "AUTO_PUBLISHED_ON_VALIDATION",
  } : {};
  const summary = await tx.noticeSummary.create({select: {id: true}, data: {...r.summary, ...approval,
    noticeId, revisionId: revision.id, analysisId: analysis.id,
    categoryId, primaryTopicId, versionNo: nextNumber(previous, "versionNo"),
    periods: {create: r.periods}, items: {create: r.items}}});
  // Advance both pointers together. A pending replacement leaves the previous public pair intact.
  if (fresh) await tx.notice.update({where: {id: noticeId}, data: {
    currentRevisionId: publish || !notice.publishedSummaryId ? revision.id : notice.currentRevisionId,
    ...(publish ? {publishedSummaryId: summary.id} : {}),
    canonicalUrl: r.identity.canonicalUrl, lastSeenAt: r.identity.lastSeenAt, lastCheckedAt: r.identity.lastCheckedAt}});
  return action;
}

async function importProgram(tx, r, program, sourceId, categoryId, primaryTopicId, units, apply) {
  const targetUnits = r.targetUnits.map(({academicUnitCode, ...rest}) =>
    ({...rest, academicUnitId: required(units, academicUnitCode)}));
  if (program && await tx.programRevision.findFirst({where: {programId: program.id, contentHash: r.revision.contentHash},
    select: {id: true}})) return "동일";
  const action = program ? "변경" : "신규";
  if (!apply) return action;
  program ??= await tx.program.create({data: {...r.identity, sourceId}});
  const programId = program.id;
  const previous = await tx.programRevision.aggregate({where: {programId}, _max: {revisionNo: true}});
  const rev = await tx.programRevision.create({data: {...r.revision, programId, categoryId, primaryTopicId,
    revisionNo: nextNumber(previous, "revisionNo"), sessions: {create: r.sessions}, assets: {create: r.assets},
    targetGrades: {create: r.targetGrades}, targetUnits: {create: targetUnits}}, select: {id: true}});
  if (+new Date(r.identity.lastSeenAt) >= +program.lastSeenAt) {
    await tx.program.update({where: {id: programId}, data: {
      currentRevisionId: r.revision.validationStatus === "VALID" ? rev.id : program.currentRevisionId,
      canonicalUrl: r.identity.canonicalUrl, lastSeenAt: r.identity.lastSeenAt, lastCheckedAt: r.identity.lastCheckedAt}});
  }
  return action;
}

async function run(db, records, apply) {
  return db.$transaction(async tx => {
    const [noticeCategories, programCategories, topics, units] = await catalog(tx);
    const sourceIds = {};
    for (const [kind, spec] of Object.entries(sources)) {
      const where = {code: spec.code};
      const source = apply ? await tx.source.upsert({where, create: spec, update: {}})
        : await tx.source.findUnique({where});
      if (!source) continue;
      assert.equal(source.kind, spec.kind, "기존 출처 유형 불일치");
      sourceIds[kind] = source.id;
      if (apply) await tx.$queryRaw`SELECT id FROM sources WHERE id=${source.id} FOR UPDATE`;
    }
    const report = {notice: {신규: 0, 변경: 0, 동일: 0}, program: {신규: 0, 변경: 0, 동일: 0}};
    for (const r of records) {
      const {kind, identity: {publicId, externalId}} = r;
      try {
        const isNotice = kind === "notice";
        const existing = await tx[kind].findUnique({where: {publicId}});
        const sourceId = sourceIds[kind];
        if (existing) assert(existing.sourceId === sourceId && existing.externalId === externalId, "DB 식별자 충돌");
        if (!existing && sourceId) {
          const alias = await tx[kind].findUnique({where: {sourceId_externalId: {sourceId, externalId}}, select: {publicId: true}});
          assert(!alias, "같은 원문 번호에 다른 공개 ID 존재");
        }
        const categoryId = required(isNotice ? noticeCategories : programCategories, r.category);
        // Only shared catalog codes have a direct notice-category → topic mapping.
        const topic = isNotice ? (topics.has(r.category) ? r.category : null) : r.topic;
        const topicId = topic ? required(topics, topic) : null;
        const action = isNotice
          ? await importNotice(tx, r, existing, sourceId, categoryId, topicId, apply)
          : await importProgram(tx, r, existing, sourceId, categoryId, topicId, units, apply);
        report[kind][action]++;
      } catch (err) {
        throw new Error(publicId + ": " + err.message, {cause: err});
      }
    }
    return report;
  }, {isolationLevel: apply ? "ReadCommitted" : "RepeatableRead", maxWait: 15000, timeout: 180000});
}

const args = process.argv.slice(2);
assert(args.length === 0 || args.length === 1 && ["--apply", "--dry-run"].includes(args[0]),
  "사용법: node prisma/import-local-content.mjs [--dry-run | --apply]");
const url = new URL(process.env.DATABASE_URL);
assert(url.protocol === "mysql:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
  "로컬 MySQL DATABASE_URL을 지정하세요.");
const records = await loadRecords(fileURLToPath(new URL("../../../", import.meta.url)));
const apply = args[0] === "--apply";
console.log((apply ? "로컬 DB 적용" : "읽기 전용 미리보기"), url.hostname + ":" + (url.port || "3306") + url.pathname);
const db = new PrismaService();
try {
  console.table(await run(db, records, apply));
} finally {
  await db.$disconnect();
}
