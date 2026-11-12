import assert from "node:assert/strict";
import { Tokens } from "../dist/auth/tokens.js";
import { readIndex } from "../dist/notice/notice.index.js";
import { noticeQuery } from "../dist/notice/notice.query.js";

export async function noticeContract(t, app, db, http) {
  const now = new Date(),
    day = (offset) =>
      new Date(now.valueOf() + offset * 86400000 + 9 * 3600000)
        .toISOString()
        .slice(0, 10);
  const date = (d) => new Date(d + "T00:00:00Z");
  const category = await db.noticeCategory.findUniqueOrThrow({
    where: { code: "career" },
  });
  const topic = await db.topic.findUniqueOrThrow({ where: { code: "career" } });
  const source = await db.source.create({
    data: {
      code: "notice_http_test",
      kind: "NOTICE",
      name: "공지",
      baseUrl: "https://www.hansung.ac.kr",
      listUrl: "https://www.hansung.ac.kr/list",
    },
  });
  const secret = "DO_NOT_PUBLISH";
  const fact = (text) => ({ text, evidence: [secret] });
  let next = 300000;
  async function record(options = {}) {
    const externalId = String(++next),
      publicId = "hansung-2127-" + externalId;
    const canonicalUrl =
      "https://www.hansung.ac.kr/bbs/hansung/2127/" +
      externalId +
      "/artclView.do";
    const n = await db.notice.create({
      data: {
        sourceId: source.id,
        publicId,
        externalId,
        canonicalUrl: options.url ?? canonicalUrl + "?layout=unknown",
        lastSeenAt: now,
        lastCheckedAt: now,
        visibility: options.visibility ?? "PUBLIC",
      },
    });
    if (options.noRevision) return { n, publicId };
    const revisionData = {
      noticeId: n.id,
      revisionNo: 1,
      sourceHash: "a".repeat(64),
      contentHash: "b".repeat(64),
      preprocessVersion: "1",
      title: options.title ?? "공개 제목",
      publishedDate: date(day(0)),
      sourceCategory: "한성공지",
      author: "작성부서",
      bodyText: secret,
      sanitizedHtml: "<b>" + secret + "</b>",
      preprocessedJson: { private: secret },
      collectedAt: now,
    };
    const r = await db.noticeRevision.create({ data: revisionData });
    let s;
    if (!options.noSummary) {
      s = await db.noticeSummary.create({
        data: {
          noticeId: n.id,
          revisionId: r.id,
          versionNo: 1,
          origin: "HUMAN",
          projectionVersion: "test",
          categoryId: category.id,
          primaryTopicId: topic.id,
          kind: "education",
          oneLineSummary: options.line ?? "학생 안내",
          summaryJson: [fact("요약 본문")],
          applicationJson: { methods: [fact("온라인 신청")] },
          applicationStatus: options.applicationStatus ?? "stated",
          gradeScope: "ALL",
          academicScope: "ALL",
          validationStatus: "VALID",
          validationIssuesJson: [],
          reviewStatus: options.review ?? "APPROVED",
          reviewedAt: now,
          tagsJson: ["태그"],
          ...options.summary,
        },
      });
    }
    const current = options.stale
      ? await db.noticeRevision.create({
          data: { ...revisionData, revisionNo: 2, title: "새 원문 제목" },
        })
      : r;
    await db.notice.update({
      where: { id: n.id },
      data: {
        currentRevisionId: current.id,
        publishedSummaryId: s?.id ?? null,
      },
    });
    return { n, r, s, publicId, canonicalUrl };
  }
  const range = (start, end) => ({
    startPrecision: "date",
    startRaw: start,
    startDate: date(start),
    endPrecision: "date",
    endRaw: end,
    endDate: date(end),
  });
  const period = (s, fields, sortOrder = 0, role = "APPLICATION") =>
    db.noticePeriod.create({
      data: {
        summaryId: s.id,
        label: role + sortOrder,
        role,
        sortOrder,
        ...fields,
      },
    });
  const good = await record({
    title: "취업 장학 지원",
    summary: {
      tagsJson: ["태그", { evidence: secret }, "WorkSHOP%_!\\lab"],
      audienceJson: {
        description: fact("재학생 안내"),
        qualifications: null,
        exclusions: [
          {
            ...fact("성적 70점 미만"),
            exceptions: [fact("신입생 첫 학기 예외")],
          },
        ],
        preferences: [fact("보훈 우대")],
        recommended: [fact("관련 전공자 추천")],
      },
      benefitsJson: [
        {
          ...fact("교재 지원"),
          availability: "conditional",
          condition: "출석 시",
        },
      ],
      preparationsJson: [
        {
          ...fact("지원서"),
          stage: "application",
          required: true,
          condition: "접수 시",
        },
      ],
      detailsJson: [{ label: "전형", facts: [fact("면접")] }],
      reviewResolutionJson: [
        { disposition: "accepted_limitation", note: secret },
      ],
    },
  });
  await period(good.s, range(day(-1), day(1)));
  await period(good.s, range(day(-3), day(-2)), 1, "ACTIVITY");
  await db.noticeItem.create({
    data: {
      summaryId: good.s.id,
      sortOrder: 0,
      title: "추가 모집",
      deadlineRaw: "선착순",
      deadlinePrecision: "unknown",
      factsJson: [fact("개별 항목")],
      evidenceJson: [secret],
    },
  });
  for (const [i, url, kind] of [
    [0, "https://www.hansung.ac.kr.evil.example/a", "IMAGE"],
    [1, "https://www.hansung.ac.kr/assets/notice.png", "IMAGE"],
    [2, "https://www.hansung.ac.kr/files/form.pdf", "ATTACHMENT"],
  ]) {
    await db.noticeAsset.create({
      data: {
        revisionId: good.r.id,
        blockId: "block-" + i,
        kind,
        sortOrder: i,
        sourceUrl: url,
        objectKey: secret,
        altText: "포스터",
        sizeBytes: 1024n,
      },
    });
  }
  const pending = await record({ line: secret, review: "PENDING" }),
    stale = await record({ line: secret, stale: true });
  const unvalidated = await record({
    line: secret,
    review: "PENDING",
    summary: { validationStatus: "NEEDS_REVIEW" },
  });
  const absent = await record({
    noSummary: true,
    url: "https://external.example/fake",
  });
  const hidden = await record({ visibility: "HIDDEN" }),
    removed = await record({ visibility: "REMOVED_AT_SOURCE" }),
    uncollected = await record({ noRevision: true });
  const general = await record({ applicationStatus: "not_applicable" });
  const restricted = await record({ summary: { gradeScope: "RESTRICTED" } });
  await db.noticeTargetGrade.create({
    data: {
      summaryId: restricted.s.id,
      purpose: "REQUIRED",
      grade: "YEAR_4",
      basisJson: {},
    },
  });
  await period(restricted.s, range(day(-1), day(10)));
  const read = (id) => http("GET", "/notices/" + id, 200);
  await t.test(
    "N02 serves the public projection and a canonical external article, never raw content or evidence",
    async () => {
      const d = (await read(good.publicId)).data;
      assert.equal(d.card.originalUrl, good.canonicalUrl);
      assert.equal(d.card.bookmark, null);
      assert.equal(d.card.summaryStatus, "READY");
      assert.equal(d.card.recruitmentStatus, "open");
      assert.equal(d.card.deadlineCount, 2);
      assert.equal(d.card.daysLeft, 1);
      assert.equal(d.card.deadline.precision, "date");
      assert.equal(d.card.publishedDate, day(0));
      assert.equal(d.card.benefitSummary, "교재 지원 · 출석 시 · 조건부");
      assert.equal(d.bodyAvailable, true);
      assert.equal(d.images[0].url, null);
      assert.equal(d.card.thumbnail.url, d.images[1].url);
      assert.equal(d.attachments[0].sizeBytes, "1024");
      assert.equal(d.summary.application.deadlines.length, 2);
      assert.deepEqual(d.summary.audience.exclusions, [
        { text: "성적 70점 미만", exceptions: ["신입생 첫 학기 예외"] },
      ]);
      assert.deepEqual(d.summary.audience.recommended, ["관련 전공자 추천"]);
      assert.deepEqual(d.summary.audience.preferences, ["보훈 우대"]);
      assert.deepEqual(d.summary.operationGuide, null);
      assert.deepEqual(d.summary.summary, ["요약 본문"]);
      assert.equal(d.summary.activityPeriods[0].role, "ACTIVITY");
      assert.equal(d.summary.details[0].items[0], "면접");
      assert(!JSON.stringify(d).includes(secret));
      assert(!JSON.stringify(d).includes("objectKey"));
      for (const [n, status] of [
        [pending, "UNAVAILABLE"],
        [unvalidated, "UNAVAILABLE"],
        [stale, "STALE"],
        [absent, "UNAVAILABLE"],
      ]) {
        const d = (await read(n.publicId)).data;
        assert.equal(d.summary, null);
        assert.equal(d.bodyAvailable, false);
        assert.equal(d.card.summaryStatus, status);
        assert(!JSON.stringify(d).includes(secret));
      }
      assert.equal((await read(absent.publicId)).data.card.originalUrl, null);
      for (const n of [hidden, removed, uncollected])
        assert.equal(
          (await http("GET", "/notices/" + n.publicId, 404)).code,
          "RESOURCE_NOT_FOUND",
        );
      await http("GET", "/notices/bad%21id", 400);
      await http("GET", "/notices/" + good.publicId + "/summary", 404);
    },
  );
  await t.test(
    "N03 returns the in-app document for the same public revision as N02",
    async () => {
      const path = "/notices/" + good.publicId + "/content";
      const d = (await http("GET", path, 200)).data;
      assert.equal(d.id, good.publicId);
      assert.equal(d.revisionId, String(good.r.id));
      assert.equal(d.title, "취업 장학 지원");
      assert.equal(d.author, "작성부서");
      assert.equal(d.publishedDate, day(0));
      assert.equal(d.oneLineSummary, "학생 안내");
      assert.equal(d.originalUrl, good.canonicalUrl);
      const lines = Object.fromEntries(d.sections.map((s) => [s.key, s.lines]));
      assert(
        lines.audience.includes(
          "제외 조건: 성적 70점 미만 (예외: 신입생 첫 학기 예외)",
        ),
      );
      assert(lines.audience.includes("우대: 보훈 우대"));
      assert(lines.audience.includes("추천: 관련 전공자 추천"));
      assert(lines.applicationPeriod[0].includes(day(-1) + " ~ " + day(1)));
      assert(lines.activity[0].includes(day(-3)));
      assert.deepEqual(lines.benefits, ["교재 지원 · 출석 시 · 조건부"]);
      assert.deepEqual(lines.preparations, [
        "지원서 · 신청 시 · 필수 · 접수 시",
      ]);
      assert.deepEqual(lines.operationGuide, ["온라인 신청"]);
      assert.deepEqual(lines.summary, ["요약 본문"]);
      const item = d.sections.find((s) => s.label === "추가 모집");
      assert(item.lines.includes("마감: 선착순"));
      assert.equal(d.images[0].availability, "UNAVAILABLE");
      assert.equal(
        d.images[1].url,
        "https://www.hansung.ac.kr/assets/notice.png",
      );
      assert.equal(d.attachments[0].filename, null);
      assert(d.warnings.some((w) => w.code === "SOURCE_CHECK_REQUIRED"));
      assert(!JSON.stringify(d).includes(secret));
      assert(!("card" in d) && !("bodyText" in d) && !("bookmark" in d));
      const minimal = (
        await http("GET", "/notices/" + general.publicId + "/content", 200)
      ).data;
      assert(
        !minimal.sections.some((s) =>
          ["applicationPeriod", "preparations", "benefits"].includes(s.key),
        ),
      );
      for (const n of [absent, stale, pending, unvalidated])
        assert.equal(
          (await http("GET", "/notices/" + n.publicId + "/content", 409)).code,
          "SUMMARY_NOT_READY",
        );
      for (const n of [hidden, removed, uncollected, { publicId: "not-found" }])
        assert.equal(
          (await http("GET", "/notices/" + n.publicId + "/content", 404)).code,
          "RESOURCE_NOT_FOUND",
        );
      await http("GET", "/notices/bad%21id/content", 400);
      await http("GET", path + "?version=1", 400);
      await http("GET", path, 401, { token: "bad" });
    },
  );
  await t.test(
    "N01 search, paging, filter counts and validation use only public current records",
    async () => {
      const get = async (q) => (await http("GET", "/notices" + q, 200)).data;
      assert.deepEqual(
        (await get("")).items.map((i) => i.id),
        [good.publicId, restricted.publicId],
      );
      for (const term of ["장학", "교재", "출석", "재학생", "태그", "진로"]) {
        assert(
          (await get("?q=" + encodeURIComponent(term))).items.some(
            (i) => i.id === good.publicId,
          ),
          term,
        );
      }
      for (const term of ["workshop", "%", "_", "!", "\\", "%_!\\LAB"]) {
        const query = noticeQuery({ status: "all", size: "1", q: term });
        const found = await readIndex(db, query, null, now);
        assert.equal(found.total, 1, term);
        assert.equal(found.rows[0].public_id, good.publicId, term);
      }
      assert.equal(
        (await get("?q=" + secret + "&status=all")).pagination.totalItems,
        0,
      );
      const all = await get("?status=all&size=1&page=1");
      assert.equal(all.pagination.totalItems, 7);
      assert.equal(all.pagination.totalPages, 7);
      assert(all.pagination.hasNext);
      const last = await get("?status=all&size=1&page=99");
      assert.deepEqual(last.items, []);
      assert.equal(last.pagination.totalItems, 7);
      assert.deepEqual(
        (await get("?status=not_applicable")).items.map((i) => i.id),
        [general.publicId],
      );
      assert.deepEqual(
        (
          await get(
            "?status=open&sort=deadline&deadlineWithinDays=1&topic=career&noticeCategory=career",
          )
        ).items.map((i) => i.id),
        [good.publicId],
      );
      assert.equal(
        (await get("?status=all&noticeCategory=unclassified")).pagination
          .totalItems,
        4,
      );
      for (const q of [
        "size=101",
        "page=0",
        "status=all&deadlineWithinDays=3",
        "programCategory=other",
        "sort=xx",
        "q=a&q=b",
        "recommendedOnly=1",
        "topic=absent",
      ])
        assert.equal(
          (await http("GET", "/notices?" + q, 400)).code,
          "VALIDATION_ERROR",
        );
      await http("GET", "/notices?recommendedOnly=true", 409);
      await http("GET", "/notices", 401, { token: "bad" });
    },
  );
  await t.test(
    "personalized scores, bookmarks and tri-state recommendation are owner scoped",
    async () => {
      const [track, secondTrack] = await db.academicUnit.findMany({
        where: { kind: "TRACK", parentId: { not: null } },
        orderBy: { id: "asc" },
        take: 2,
      });
      const member = await db.user.create({
        data: {
          loginId: "noticereader",
          name: "독자",
          passwordHash: "!",
          profile: { create: { grade: "YEAR_2", completedAt: now } },
          topics: { create: { topicId: topic.id } },
          academicUnits: {
            create: [
              { slot: 1, academicUnitId: track.id },
              { slot: 2, academicUnitId: secondTrack.id },
            ],
          },
        },
      });
      const session = await db.userSession.create({
        data: {
          userId: member.id,
          refreshTokenHash: "8".repeat(64),
          expiresAt: new Date(now.getTime() + 86400000),
        },
      });
      const { accessToken: token } = await app
        .get(Tokens)
        .issue(member.id, session.id, session.expiresAt);
      const documentPath = "/notices/" + good.publicId + "/content";
      assert.deepEqual(
        (await http("GET", documentPath, 200, { token })).data,
        (await http("GET", documentPath, 200)).data,
      );
      await db.userNoticeBookmark.create({
        data: {
          userId: member.id,
          noticeId: good.n.id,
          deadlineReminderEnabled: false,
        },
      });
      const d = (await http("GET", "/notices/" + good.publicId, 200, { token }))
        .data;
      assert.deepEqual(d.card.bookmark, {
        saved: true,
        deadlineReminderEnabled: false,
        savedAt: d.card.bookmark.savedAt,
      });
      assert.equal(d.card.recommendation.score, 100);
      assert.equal(d.card.recommendation.eligibility.status, "UNKNOWN");
      const prof = (
        await http(
          "GET",
          "/notices?recommendedOnly=true&sort=recommended",
          200,
          { token },
        )
      ).data;
      assert.equal(prof.context.mode, "PERSONALIZED");
      assert.deepEqual(
        prof.items.map((i) => i.id),
        [good.publicId],
      );
      const mismatch = (
        await http("GET", "/notices/" + restricted.publicId, 200, { token })
      ).data;
      assert.equal(mismatch.card.bookmark.saved, false);
      assert.equal(mismatch.card.recommendation.eligibility.status, "MISMATCH");
      await db.noticeSummary.update({
        where: { id: restricted.s.id },
        data: {
          audienceJson: {
            qualifications: [
              { ...fact("필수 학년"), exceptions: [fact("예외 확인")] },
            ],
          },
        },
      });
      assert.equal(
        (await http("GET", "/notices/" + restricted.publicId, 200, { token }))
          .data.card.recommendation.eligibility.status,
        "UNKNOWN",
      );
      assert.equal((await read(good.publicId)).data.card.bookmark, null);
      const scoped = await record({
        summary: { gradeScope: "RESTRICTED", academicScope: "RESTRICTED" },
      });
      await db.noticeTargetGrade.create({
        data: {
          summaryId: scoped.s.id,
          purpose: "REQUIRED",
          grade: "YEAR_2",
          basisJson: {},
        },
      });
      await db.noticeTargetUnit.create({
        data: {
          summaryId: scoped.s.id,
          purpose: "REQUIRED",
          academicUnitId: track.parentId,
          includeDescendants: true,
          basisJson: {},
        },
      });
      const rec = async () =>
        (await http("GET", "/notices/" + scoped.publicId, 200, { token })).data
          .card.recommendation;
      assert.equal((await rec()).score, 130);
      assert.equal((await rec()).eligibility.status, "MATCH");
      await db.noticeTargetUnit.updateMany({
        where: { summaryId: scoped.s.id },
        data: { academicUnitId: track.id, includeDescendants: false },
      });
      await db.userAcademicUnit.updateMany({
        where: { userId: member.id, slot: 1 },
        data: { academicUnitId: track.parentId },
      });
      assert.equal((await rec()).eligibility.academicMatch, "UNKNOWN");
    },
  );
  await t.test(
    "서울 날짜 마감, 정확한 마감 시각, 마감만 명시된 공지와 복수 모집 우선순위",
    async () => {
      const example = await record({});
      const p = await period(example.s, range("2030-02-01", "2030-02-02"));
      const at = async (instant) =>
        db.$transaction(
          async (tx) =>
            (
              await readIndex(
                tx,
                noticeQuery({ status: "all" }),
                null,
                new Date(instant),
                example.publicId,
              )
            ).rows[0],
        );
      assert.equal((await at("2030-02-02T14:59:59.999Z")).recruitment, "open");
      assert.equal(
        (await at("2030-02-02T15:00:00.000Z")).recruitment,
        "closed",
      );
      await db.noticePeriod.update({
        where: { id: p.id },
        data: {
          endPrecision: "datetime",
          endDate: null,
          endAt: new Date("2030-02-02T09:00:00Z"),
        },
      });
      assert.equal((await at("2030-02-02T09:00:00Z")).recruitment, "closed");
      await db.noticePeriod.update({
        where: { id: p.id },
        data: { startRaw: null, startPrecision: null, startDate: null },
      });
      assert.equal((await at("2030-02-02T08:59:59Z")).recruitment, "unknown");
      await period(example.s, range("2030-02-04", "2030-02-06"), 1);
      assert.equal(
        (await at("2030-02-02T08:59:59Z")).days_left.toString(),
        "4",
      ); // known upcoming route before an unknown-start route
      assert.equal((await at("2030-02-03T00:00:00Z")).recruitment, "upcoming");
    },
  );
}
