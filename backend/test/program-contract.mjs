import assert from "node:assert/strict";
import { Tokens } from "../dist/auth/tokens.js";
import { readProgramIndex } from "../dist/program/program.index.js";
import { contentQuery } from "../dist/content/content.query.js";

export async function programContract(t, app, db, http) {
  const now = new Date(),
    day = (diff) =>
      new Date(now.getTime() + diff * 86400_000 + 9 * 3600_000)
        .toISOString()
        .slice(0, 10);
  const date = (d) => new Date(d + "T00:00:00Z"),
    secret = "PRIVATE_IMPORT_DIAGNOSTICS";
  const category = await db.programCategory.findUniqueOrThrow({
    where: { code: "other" },
  });
  const topic = await db.topic.findUniqueOrThrow({ where: { code: "career" } });
  const source = await db.source.create({
    data: {
      code: "program_http_test",
      kind: "PROGRAM",
      name: "비교과",
      baseUrl: "https://hsportal.hansung.ac.kr",
      listUrl: "https://hsportal.hansung.ac.kr/ko/program",
    },
  });
  const range = (first, last) => ({
    applyStartPrecision: "date",
    applyStartRaw: first,
    applyStartDate: date(first),
    applyEndPrecision: "date",
    applyEndRaw: last,
    applyEndDate: date(last),
  });
  let seq = 14063;
  async function record(opts = {}) {
    const externalId = String(seq++),
      publicId = "hsportal-program-" + externalId,
      url = "https://hsportal.hansung.ac.kr/ko/program/all/view/" + externalId;
    const p = await db.program.create({
      data: {
        sourceId: source.id,
        externalId,
        publicId,
        canonicalUrl: opts.url === undefined ? url : opts.url,
        visibility: opts.visibility ?? "PUBLIC",
        lastSeenAt: now,
        lastCheckedAt: now,
      },
    });
    const values = {
      programId: p.id,
      revisionNo: 1,
      sourceHash: "a".repeat(64),
      contentHash: "b".repeat(64),
      parserVersion: "v1",
      categoryId: category.id,
      primaryTopicId: topic.id,
      title: "기타 프로그램",
      publishedDate: date(day(0)),
      rawMetadataJson: { private: secret },
      originalArtifactKey: secret,
      sanitizedHtml: secret,
      collectedAt: now,
      validationStatus: "VALID",
      validationIssuesJson: [],
      ...opts.revision,
    };
    const r = await db.programRevision.create({ data: values });
    if (!opts.noPointer)
      await db.program.update({
        where: { id: p.id },
        data: { currentRevisionId: r.id },
      });
    return { p, r, publicId, url, values };
  }
  const sample = await record({
    revision: {
      title: "현직자와 함께하는 직무 탐색 라운지",
      publicSummary: "마케팅·기획·개발 직무를 가까이에서 만나세요.",
      audienceText: "전 학년 · 트랙 무관",
      gradeScope: "ALL",
      academicScope: "ALL",
      points: "10.00",
      department: "진로취업지원팀",
      applicationStatus: "stated",
      ...range(day(-2), day(1)),
      sourceApplicationState: "접수 중",
      tagsJson: ["직무탐색"],
    },
  });
  const missing = await record({ url: null, revision: { points: 0 } });
  const multi = await record({
    revision: {
      pointsText: "조건 충족 시 최대 30pt",
      title: "회차별 모집",
      gradeScope: "RESTRICTED",
      academicScope: "ALL",
    },
  });
  await db.programTargetGrade.create({
    data: {
      revisionId: multi.r.id,
      purpose: "REQUIRED",
      grade: "YEAR_4",
      basisJson: { private: secret },
    },
  });
  await db.programTargetGrade.create({
    data: {
      revisionId: sample.r.id,
      purpose: "RECOMMENDED",
      grade: "YEAR_4",
      basisJson: { private: secret },
    },
  });
  const session = (r, key, sortOrder, extra) =>
    db.programSession.create({
      data: {
        revisionId: r.id,
        sessionKey: key,
        title: key,
        sortOrder,
        rawMetadataJson: { private: secret },
        ...extra,
      },
    });
  await session(multi.r, "둘째 회차", 2, {
    ...range(day(5), day(8)),
    points: "23.50",
    originalUrl: "javascript:alert(1)",
  });
  const first = await session(multi.r, "첫 회차", 1, {
    ...range(day(-2), day(2)),
    originalUrl: multi.url + "?session=1",
    points: "0.00",
    capacity: 0,
    activityPeriodsJson: [
      {
        label: "특강",
        start: {
          rawText: "11/13 17:00",
          precision: "datetime",
          value: "2026-11-13T17:00:00+09:00",
          evidence: [secret],
        },
        end: null,
      },
    ],
  });
  const conflicted = await record({
    revision: {
      applicationStatus: "stated",
      ...range(day(-2), day(3)),
      sourceApplicationState: "접수 마감",
    },
  });
  const closed = await record({
    revision: {
      applicationStatus: "stated",
      ...range(day(-4), day(-1)),
      sourceApplicationState: "접수중",
      collectedAt: new Date(now.getTime() - 3 * 86400_000),
    },
  });
  const general = await record({
    url: "https://hsportal.hansung.ac.kr.evil.example/ko/program/all/view/14068",
    revision: { applicationStatus: "not_applicable" },
  });
  const hs = await record({ visibility: "HIDDEN" }),
    removed = await record({ visibility: "REMOVED_AT_SOURCE" }),
    noPtr = await record({ noPointer: true });
  const invalid = await record({ revision: { title: "이전 버전으로 검색" } });
  const bad = await db.programRevision.create({
    data: {
      ...invalid.values,
      revisionNo: 2,
      validationStatus: "INVALID",
      title: secret,
    },
  });
  await db.program.update({
    where: { id: invalid.p.id },
    data: { currentRevisionId: bad.id },
  });
  const unreviewed = await record({
    revision: { validationStatus: "NEEDS_REVIEW" },
  });
  for (const [idx, sourceUrl, kind] of [
    [0, "file:///private", "IMAGE"],
    [1, "https://hsportal.hansung.ac.kr/assets/a.png", "IMAGE"],
    [2, "https://hsportal.hansung.ac.kr/file/a.pdf", "ATTACHMENT"],
  ])
    await db.programAsset.create({
      data: {
        revisionId: multi.r.id,
        assetKey: "asset" + idx,
        kind,
        sourceUrl,
        sortOrder: idx,
        objectKey: secret,
        sizeBytes: 512n,
      },
    });
  const list = async (q = "", options = {}) =>
    (await http("GET", "/programs" + q, 200, options)).data;
  const detail = async (n, options = {}) =>
    (await http("GET", "/programs/" + n.publicId, 200, options)).data;

  await t.test(
    "P01 public current VALID revisions only; search, category, filters, sorting and pagination",
    async () => {
      const open = await list();
      assert.deepEqual(
        open.items.map((c) => c.id),
        [sample.publicId, multi.publicId],
      );
      assert.equal(open.context.mode, "GENERAL");
      assert.equal(open.items[0].bookmark, null);
      assert.equal(open.items[0].type, "program");
      assert.equal(open.items[0].programCategory.code, "other");
      assert.equal(open.items[0].noticeCategory, null);
      assert.equal(open.items[0].summaryStatus, "NOT_APPLICABLE");
      assert.equal(open.items[0].benefitSummary, "10pt");
      for (const term of [
        "현직자",
        "마케팅",
        "직무탐색",
        "트랙 무관",
        "10pt",
        "기타",
        "진로·취업",
      ])
        assert(
          (await list("?q=" + encodeURIComponent(term))).items.some(
            (c) => c.id === sample.publicId,
          ),
          term,
        );
      assert.equal(
        (await list("?status=all&q=" + secret)).pagination.totalItems,
        0,
      );
      assert.equal(
        (await list("?q=" + encodeURIComponent("이전 버전") + "&status=all"))
          .pagination.totalItems,
        0,
      );
      assert.deepEqual(
        (
          await list(
            "?status=open&programCategory=other&topic=career&sort=deadline&deadlineWithinDays=1",
          )
        ).items.map((i) => i.id),
        [sample.publicId],
      );
      assert.equal(
        (await list("?status=all&size=1&page=2")).pagination.totalItems,
        6,
      );
      const empty = await list("?status=all&size=1&page=99");
      assert.deepEqual(empty.items, []);
      assert.equal(empty.pagination.totalItems, 6);
      assert(
        (await list("?status=closed")).items.some(
          (c) => c.id === closed.publicId,
        ),
      );
      assert.deepEqual(
        (await list("?status=not_applicable")).items.map((c) => c.id),
        [general.publicId],
      );
      for (const q of [
        "?noticeCategory=career",
        "?status=all&deadlineWithinDays=3",
        "?q=x&q=y",
        "?size=0",
        "?sort=bad",
        "?topic=invalid",
        "?programCategory=all",
      ])
        assert.equal(
          (await http("GET", "/programs" + q, 400)).code,
          "VALIDATION_ERROR",
        );
      await http("GET", "/programs?recommendedOnly=true", 409);
      await http("GET", "/programs", 401, { token: "bad" });
    },
  );
  await t.test(
    "P02 screen fields, safe original URL, zero vs missing vs conditional points and ordered sessions",
    async () => {
      const d = await detail(sample);
      assert.equal(d.publicInfo.summary, sample.r.publicSummary);
      assert.equal(d.publicInfo.audience, "전 학년 · 트랙 무관");
      assert.equal(d.publicInfo.department, "진로취업지원팀");
      assert.equal(d.publicInfo.points, "10.00");
      assert.equal(d.publicInfo.applicationPeriod, day(-2) + " ~ " + day(1));
      assert.equal(d.card.originalUrl, sample.url);
      assert.equal(d.publicInfo.location, null);
      assert.equal(d.publicInfo.format, null);
      assert.deepEqual(d.sessions, []);
      assert.equal(d.body, null);
      assert.equal(
        d.application.deadlines[0].reference.kind,
        "program_revision",
      );
      const m = await detail(multi);
      assert.equal(m.publicInfo.points, null);
      assert.equal(m.card.benefitSummary, multi.r.pointsText);
      assert.equal(m.card.deadline.value, day(2));
      assert.equal(m.card.targetSummary, "4학년 · 소속 제한 없음");
      assert.deepEqual(
        m.sessions.map((s) => s.sessionKey),
        ["첫 회차", "둘째 회차"],
      );
      assert.equal(m.sessions[0].points, "0.00");
      assert.equal(m.sessions[0].capacity, 0);
      assert.equal(m.sessions[1].points, "23.50");
      assert.equal(m.sessions[1].originalUrl, null);
      assert.equal(m.sessions[0].originalUrl, multi.url + "?session=1");
      assert.equal(
        m.sessions[0].activityPeriods[0].start.value,
        "2026-11-13T08:00:00.000Z",
      );
      assert.equal(m.card.deadlineCount, 2);
      assert.deepEqual(m.application.deadlines[0].reference, {
        kind: "program_session",
        id: String(first.id),
      });
      assert.equal(m.images[0].url, null);
      assert.equal(m.card.thumbnail.url, m.images[1].url);
      assert.equal(m.attachments[0].sizeBytes, "512");
      assert.equal((await detail(missing)).publicInfo.points, "0.00");
      assert.equal((await detail(missing)).card.benefitSummary, "0pt");
      assert.equal((await detail(missing)).publicInfo.summary, null);
      assert.equal((await detail(missing)).card.originalUrl, null);
      assert.equal((await detail(general)).card.originalUrl, null);
      assert(!JSON.stringify(m).includes(secret));
      assert(!JSON.stringify(d).includes("objectKey"));
      for (const n of [
        hs,
        removed,
        noPtr,
        unreviewed,
        invalid,
        { publicId: "not-found" },
      ])
        assert.equal(
          (await http("GET", "/programs/" + n.publicId, 404)).code,
          "RESOURCE_NOT_FOUND",
        );
      await http("GET", "/programs/bad%21id", 400);
      await http("GET", "/programs/" + sample.publicId + "?q=x", 400);
    },
  );
  await t.test(
    "collected state conflict vs natural time passage; deadline precision and missing start",
    async () => {
      const conflict = await detail(conflicted);
      assert.equal(conflict.card.recruitmentStatus, "unknown");
      assert(conflict.warnings.some((w) => w.code === "SOURCE_STATE_CONFLICT"));
      assert.equal(conflict.publicInfo.sourceApplicationState, "접수 마감");
      assert.equal((await detail(closed)).card.recruitmentStatus, "closed");
      const fixed = await record({
        revision: {
          applicationStatus: "stated",
          ...range("2030-02-01", "2030-02-02"),
        },
      });
      const at = async (time) =>
        db.$transaction(
          async (tx) =>
            (
              await readProgramIndex(
                tx,
                contentQuery({ status: "all" }, "programCategory"),
                null,
                new Date(time),
                fixed.publicId,
              )
            ).rows[0],
        );
      assert.equal((await at("2030-02-02T14:59:59.999Z")).recruitment, "open");
      assert.equal((await at("2030-02-02T15:00:00Z")).recruitment, "closed");
      await db.programRevision.update({
        where: { id: fixed.r.id },
        data: {
          applyEndPrecision: "datetime",
          applyEndDate: null,
          applyEndAt: new Date("2030-02-02T09:00:00Z"),
        },
      });
      assert.equal((await at("2030-02-02T09:00:00Z")).recruitment, "closed");
      await db.programRevision.update({
        where: { id: fixed.r.id },
        data: {
          applyStartPrecision: null,
          applyStartDate: null,
          applyStartRaw: null,
        },
      });
      assert.equal((await at("2030-02-02T08:59:59Z")).recruitment, "unknown");
    },
  );
  await t.test(
    "personalization and bookmark ownership with program-specific targets",
    async () => {
      const [track, second] = await db.academicUnit.findMany({
        where: { kind: "TRACK", parentId: { not: null } },
        orderBy: { id: "asc" },
        take: 2,
      });
      async function viewer(loginId, complete) {
        const member = await db.user.create({
          data: {
            loginId,
            name: "회원",
            passwordHash: "!",
            ...(complete
              ? {
                  profile: { create: { grade: "YEAR_2", completedAt: now } },
                  topics: { create: { topicId: topic.id } },
                  academicUnits: {
                    create: [
                      { slot: 1, academicUnitId: track.id },
                      { slot: 2, academicUnitId: second.id },
                    ],
                  },
                }
              : {}),
          },
        });
        const s = await db.userSession.create({
          data: {
            userId: member.id,
            refreshTokenHash: (complete ? "6" : "7").repeat(64),
            expiresAt: new Date(now.getTime() + 86400000),
          },
        });
        const { accessToken: token } = await app
          .get(Tokens)
          .issue(member.id, s.id, s.expiresAt);
        return { member, token };
      }
      const me = await viewer("program01", true),
        other = await viewer("program02", false);
      await db.userProgramBookmark.create({
        data: {
          userId: me.member.id,
          programId: sample.p.id,
          deadlineReminderEnabled: false,
        },
      });
      await http("GET", "/programs?recommendedOnly=true", 409, {
        token: other.token,
      });
      assert.equal(
        (await detail(sample, { token: other.token })).card.bookmark.saved,
        false,
      );
      const mine = (await detail(sample, { token: me.token })).card;
      assert(mine.bookmark.saved && !mine.bookmark.deadlineReminderEnabled);
      assert.equal(mine.recommendation.score, 100);
      assert.equal(mine.recommendation.eligibility.status, "MATCH");
      assert.equal(
        (await detail(multi, { token: me.token })).card.recommendation
          .eligibility.status,
        "MISMATCH",
      );
      const picks = await list("?recommendedOnly=true&sort=recommended", {
        token: me.token,
      });
      assert(picks.items.some((c) => c.id === sample.publicId));
      assert(!picks.items.some((c) => c.id === multi.publicId));
      assert.equal(picks.context.mode, "PERSONALIZED");
      await db.programRevision.update({
        where: { id: multi.r.id },
        data: { gradeScope: "ALL", academicScope: "RESTRICTED" },
      });
      await db.programTargetGrade.deleteMany({
        where: { revisionId: multi.r.id },
      });
      await db.programTargetUnit.create({
        data: {
          revisionId: multi.r.id,
          academicUnitId: track.parentId,
          includeDescendants: true,
          purpose: "REQUIRED",
          basisJson: {},
        },
      });
      assert.equal(
        (await detail(multi, { token: me.token })).card.recommendation.score,
        120,
      );
    },
  );
}
