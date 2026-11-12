import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "../dist/generated/prisma/client.js";
import { articleUrl } from "../dist/notice/notice.view.js";

export const sources = {
  notice: { code: "hansung_notice_2127", kind: "NOTICE", name: "한성대학교 공지사항", boardKey: "hansung/2127",
    baseUrl: "https://www.hansung.ac.kr", listUrl: "https://www.hansung.ac.kr/bbs/hansung/2127/artclList.do" },
  program: { code: "hsportal_program", kind: "PROGRAM", name: "한성대학교 비교과 프로그램",
    baseUrl: "https://hsportal.hansung.ac.kr", listUrl: "https://hsportal.hansung.ac.kr/ko/program/all" },
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableHash(data) {
  return sha256(JSON.stringify(data, (_, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value));
}

// Direct-MHTML exports use sorted keys and JSON separators ", " and ": " for this checksum.
function exportJson(value) {
  if (Array.isArray(value)) return "[" + value.map(exportJson).join(", ") + "]";
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value).sort().map(key => JSON.stringify(key) + ": " + exportJson(value[key]));
    return "{" + entries.join(", ") + "}";
  }
  return JSON.stringify(value);
}

function unique(values, label) {
  assert(values.every(value => typeof value === "string" && value.length), label + " 값 누락");
  assert.equal(new Set(values).size, values.length, label + " 중복");
}

function dateOnly(value) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
  const date = new Date(value + "T00:00:00Z");
  assert.equal(date.toISOString().slice(0, 10), value);
  return date;
}

function instant(value) {
  assert.match(value, /(?:Z|[+-]\d\d:\d\d)$/);
  const date = new Date(value);
  assert(Number.isFinite(date.getTime()), "시각 형식 오류");
  return date;
}

function boundary(prefix, value) {
  if (value) {
    assert(value.rawText && ["date", "datetime", "unknown"].includes(value.precision), "일정 경계 형식 오류");
    if (value.precision === "unknown") assert.equal(value.value, null);
  }
  return {
    [prefix + "Raw"]: value?.rawText ?? null,
    [prefix + "Precision"]: value?.precision ?? null,
    [prefix + "Date"]: value?.precision === "date" ? dateOnly(value.value) : null,
    [prefix + "At"]: value?.precision === "datetime" ? instant(value.value) : null,
  };
}

function validateEvidence(node, ids) {
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "evidence" && Array.isArray(value)) {
      for (const id of value) assert(ids.has(id), "없는 근거 ID " + id);
    } else validateEvidence(value, ids);
  }
}

function noticeProjection(d, captured, externalId) {
  const {source, evidence, run, ...fields} = d;
  assert.equal(d.schemaVersion, "1.2");
  assert.equal(run.status, "completed");
  assert.equal(typeof d.needsReview, "boolean");
  assert(d.title?.trim() && d.oneLineSummary?.trim() && [...d.oneLineSummary].length <= 180);
  const originalUrl = articleUrl(d.originalUrl, externalId, d.id);
  assert(originalUrl, "원문 URL과 공지 ID 불일치");
  unique(evidence.map(e => e.id), "근거 ID");
  validateEvidence(fields, new Set(evidence.map(e => e.id)));
  const periods = [];
  function addPeriod(role, p) {
    const dates = {...boundary("start", p.start), ...boundary("end", p.end)};
    if (p.start && p.start.precision === p.end?.precision && p.start.value && p.end.value)
      assert(new Date(p.start.value) <= new Date(p.end.value), "시작·종료 역전: " + p.label);
    periods.push({role, label: p.label, sortOrder: periods.length, ...dates,
      evidenceJson: {start: p.start?.evidence ?? [], end: p.end?.evidence ?? []}});
  }
  for (const p of d.application.periods ?? []) addPeriod("APPLICATION", p);
  const deadline = d.application.deadline;
  if (deadline && !(d.application.periods ?? []).some(p => p.end?.rawText === deadline.rawText && p.end.value === deadline.value))
    addPeriod("APPLICATION", {label: "신청 마감", end: deadline});
  for (const p of d.activityPeriods ?? [])
    addPeriod(/결과 발표|서류 발표/.test(p.label) ? "RESULT" : "ACTIVITY", p);
  const items = (d.items ?? []).map((item, sortOrder) => ({
    title: item.title, organization: item.organization, originalUrl: item.url, sortOrder,
    ...boundary("deadline", item.deadline), factsJson: item.facts ?? Prisma.DbNull, evidenceJson: item.evidence,
  }));
  const assets = (source.images ?? []).map((im, sortOrder) => ({
    kind: "IMAGE", blockId: im.id, sortOrder, sourceUrl: im.sourceUrl, altText: im.alt || null,
    width: im.width, height: im.height, sha256: im.sha256, storageStatus: "REMOTE_ONLY",
  }));
  unique(assets.map(im => im.blockId), "이미지 ID");
  const observed = {firstCollectedAt: captured, lastSeenAt: captured, lastCheckedAt: captured};
  const revision = {sourceHash: source.sha256, contentHash: stableHash([d.title, d.publishedAt, d.author, d.sourceCategory, evidence, source.images]),
    preprocessVersion: "direct-mhtml-evidence-v1", title: d.title, author: d.author, sourceCategory: d.sourceCategory,
    publishedDate: dateOnly(d.publishedAt), preprocessedJson: {format: "direct-mhtml-evidence", sourceFile: source.file, blocks: evidence},
    collectedAt: captured};
  const inputFingerprint = stableHash([source.sha256, run, d.schemaVersion]);
  const analysis = {inputFingerprint, importKey: stableHash([d.id, d]), runKey: "local-direct-json-" + inputFingerprint,
    modelName: run.model, schemaVersion: d.schemaVersion, pipelineVersion: "direct-mhtml-json", configurationJson: run,
    status: "COMPLETED", needsReview: d.needsReview, reviewIssuesJson: d.reviewIssues, resultJson: d};
  const summary = {origin: "AI", projectionVersion: "2.1", kind: d.noticeKind, oneLineSummary: d.oneLineSummary,
    summaryJson: d.summary, applicationStatus: d.application.status, applicationJson: d.application,
    audienceJson: d.audience ?? Prisma.DbNull, activityPeriodsJson: d.activityPeriods ?? Prisma.DbNull,
    benefitsJson: d.benefits ?? Prisma.DbNull, preparationsJson: d.preparations ?? Prisma.DbNull,
    operationGuideJson: d.operationGuide ?? Prisma.DbNull, detailsJson: d.details ?? Prisma.DbNull,
    gradeScope: "UNKNOWN", academicScope: "UNKNOWN", eligibilityBasisJson: {sourcePath: "/audience", requiresSourceCheck: true},
    reviewStatus: "PENDING", validationStatus: d.needsReview || d.reviewIssues.length ? "NEEDS_REVIEW" : "VALID",
    validationIssuesJson: []};
  return {kind: "notice", identity: {publicId: d.id, externalId, canonicalUrl: originalUrl, ...observed},
    category: d.noticeCategory, revision, analysis, summary, periods, items, assets};
}

function programProjection(d, externalId) {
  assert.equal(d.program.externalId, externalId);
  assert.equal(d.program.publicId, "hsportal-program-" + externalId);
  assert.equal(d.lookups.sourceCode, sources.program.code);
  const url = new URL(d.program.canonicalUrl);
  assert.equal(url.origin, sources.program.baseUrl);
  assert(url.pathname.endsWith("/view/" + externalId));
  assert.match(d.revision.contentHash, /^[a-f0-9]{64}$/);
  if (d.revision.parserVersion === "hsportal-mhtml-direct-v1") {
    const {summaryInfo, ...record} = d;
    const {collectedAt, contentHash, sourceHash, parserVersion, ...revision} = record.revision;
    const {firstCollectedAt, lastSeenAt, lastCheckedAt, ...program} = record.program;
    assert.equal(sha256(exportJson({...record, program, revision})), contentHash, "프로그램 내용 해시 불일치");
  }
  unique(d.sessions.map(s => s.sessionKey), "회차 키");
  unique(d.assets.map(a => a.assetKey), "자산 키");
  function dates(row) {
    const data = {...row};
    for (const side of ["applyStart", "applyEnd"]) {
      if (data[side + "Date"]) data[side + "Date"] = dateOnly(data[side + "Date"]);
      if (data[side + "At"]) data[side + "At"] = instant(data[side + "At"]);
    }
    return data;
  }
  const revision = dates(d.revision);
  revision.rawMetadataJson = {...revision.rawMetadataJson, summaryInfo: d.summaryInfo};
  if (revision.publishedDate) revision.publishedDate = dateOnly(revision.publishedDate);
  return {kind: "program", identity: d.program, revision, category: d.lookups.categoryCode, topic: d.lookups.primaryTopicCode,
    sessions: d.sessions.map(dates), assets: d.assets.filter(a => a.kind === "IMAGE"),
    targetGrades: d.targetGrades, targetUnits: d.targetUnits};
}

export async function loadRecords(root) {
  const records = [];
  for (const [kind, folder, originals] of [["notice","공지사항","원본공지"], ["program","프로그램","원본프로그램"]]) {
    const dir = path.join(root, folder, "gemma");
    const files = (await readdir(dir)).filter(f => f.endsWith(".json") && !f.endsWith("_simple.json")).sort();
    assert(files.length, dir + " 상세 JSON 없음");
    for (const file of files) {
      try {
        const d = JSON.parse((await readFile(path.join(dir, file), "utf8")).replace(/^\uFEFF/, ""));
        const name = kind === "notice" ? d.source.file : d.summaryInfo.sourceFile;
        assert(name && path.basename(name) === name, "원본 파일명 오류");
        const bytes = await readFile(path.join(root, folder, originals, name));
        assert.equal(sha256(bytes), kind === "notice" ? d.source.sha256 : d.revision.sourceHash, "원본 SHA-256 불일치");
        if (kind === "notice") {
          const id = /^hansung-2127-(\d+)$/.exec(d.id)?.[1];
          assert(id, "게시판 ID 불일치");
          const date = /^Date:\s*([^\r\n]+)/im.exec(bytes.subarray(0, 16384).toString("latin1"))?.[1];
          const captured = new Date(date);
          assert(Number.isFinite(captured.getTime()), "MHTML 저장 시각 없음");
          records.push(noticeProjection(d, captured, id));
        } else {
          assert(/^\d+$/.test(d.program.externalId));
          records.push(programProjection(d, d.program.externalId));
        }
      } catch (err) {
        throw new Error(folder + "/" + file + ": " + err.message);
      }
    }
  }
  unique(records.map(r => r.identity.publicId), "콘텐츠 공개 ID");
  return records;
}
