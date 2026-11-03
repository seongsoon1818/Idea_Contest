import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Tokens } from "../dist/auth/tokens.js";

export async function recommendationContract(t, app, db, http) {
  const now = new Date(),
    tag = "추천계약시험",
    secret = "INTERNAL_RECOMMENDATION_EVIDENCE";
  const day = (offset) =>
    new Date(
      new Date(now.getTime() + 9 * 3600000 + offset * 86400000)
        .toISOString()
        .slice(0, 10) + "T00:00:00Z",
    );
  const nc = await db.noticeCategory.findUniqueOrThrow({
    where: { code: "career" },
  });
  const pc = await db.programCategory.findUniqueOrThrow({
    where: { code: "other" },
  });
  const topic = await db.topic.findUniqueOrThrow({ where: { code: "career" } });
  const ns = await db.source.create({
    data: {
      kind: "NOTICE",
      code: "rec_notice",
      name: "공지",
      baseUrl: "https://www.hansung.ac.kr",
      listUrl: "https://www.hansung.ac.kr/list",
    },
  });
  const ps = await db.source.create({
    data: {
      kind: "PROGRAM",
      code: "rec_program",
      name: "프로그램",
      baseUrl: "https://hsportal.hansung.ac.kr",
      listUrl: "https://hsportal.hansung.ac.kr/ko/program",
    },
  });
  const common = { lastSeenAt: now, lastCheckedAt: now },
    hashes = { contentHash: "a".repeat(64), sourceHash: "b".repeat(64) },
    fact = (text) => ({ text, evidence: [secret] });
  async function notice(id, status = "APPROVED", visibility = "PUBLIC") {
    const n = await db.notice.create({
      data: {
        ...common,
        sourceId: ns.id,
        publicId: id,
        externalId: id,
        canonicalUrl: "https://www.hansung.ac.kr/" + id,
        visibility,
      },
    });
    const r = await db.noticeRevision.create({
      data: {
        ...hashes,
        revisionNo: 1,
        noticeId: n.id,
        preprocessVersion: "v1",
        title: tag + " 공지",
        publishedDate: day(0),
        preprocessedJson: { private: secret },
        collectedAt: now,
      },
    });
    const s = await db.noticeSummary.create({
      data: {
        noticeId: n.id,
        revisionId: r.id,
        versionNo: 1,
        origin: "HUMAN",
        projectionVersion: "test",
        categoryId: nc.id,
        primaryTopicId: topic.id,
        kind: "general",
        oneLineSummary: tag,
        summaryJson: [],
        applicationJson: { methods: [fact("온라인")] },
        applicationStatus: "stated",
        validationStatus: "VALID",
        validationIssuesJson: [],
        reviewStatus: status,
        reviewedAt: now,
        gradeScope: "ALL",
        academicScope: "ALL",
        audienceJson: {
          description: fact("재학생"),
          preferences: [fact("보훈 대상 우대")],
          exclusions: [
            { ...fact("성적 미달"), exceptions: [fact("신입생 첫 학기 예외")] },
          ],
        },
        benefitsJson: [
          {
            ...fact("교재 지원"),
            availability: "conditional",
            condition: "출석 시",
          },
        ],
        preparationsJson: [
          { ...fact("신청서"), required: true, stage: "application" },
        ],
        operationGuideJson: [fact("담당 부서에 제출")],
      },
    });
    await db.noticePeriod.create({
      data: {
        summaryId: s.id,
        role: "APPLICATION",
        label: "신청",
        sortOrder: 0,
        startRaw: "시작",
        startPrecision: "date",
        startDate: day(-3),
        endRaw: "마감",
        endPrecision: "date",
        endDate: day(2),
      },
    });
    await db.notice.update({
      where: { id: n.id },
      data: { currentRevisionId: r.id, publishedSummaryId: s.id },
    });
    return { type: "notice", id };
  }
  async function program(id, end, restricted = false) {
    const p = await db.program.create({
      data: { ...common, sourceId: ps.id, publicId: id, externalId: id },
    });
    const r = await db.programRevision.create({
      data: {
        ...hashes,
        programId: p.id,
        revisionNo: 1,
        parserVersion: "v1",
        categoryId: pc.id,
        title: tag + " 프로그램",
        publishedDate: day(-1),
        rawMetadataJson: { private: secret },
        bodyText: secret,
        validationStatus: "VALID",
        validationIssuesJson: [],
        collectedAt: now,
        applicationStatus: "stated",
        applyStartPrecision: "date",
        applyStartRaw: "시작",
        applyStartDate: day(-5),
        applyEndPrecision: "date",
        applyEndRaw: "마감",
        applyEndDate: day(end),
        gradeScope: restricted ? "RESTRICTED" : "UNKNOWN",
        academicScope: "ALL",
        audienceText: "원문 대상 확인",
        points: 0,
        pointsText: "참여에 따라 최대 20pt",
      },
    });
    if (restricted)
      await db.programTargetGrade.create({
        data: {
          revisionId: r.id,
          purpose: "REQUIRED",
          grade: "YEAR_4",
          basisJson: {},
        },
      });
    await db.program.update({
      where: { id: p.id },
      data: { currentRevisionId: r.id },
    });
    return { type: "program", id };
  }
  async function member(loginId, complete) {
    const u = await db.user.create({
      data: {
        loginId,
        name: "회원",
        passwordHash: "!",
        ...(complete
          ? {
              profile: { create: { grade: "YEAR_2", completedAt: now } },
              topics: { create: { topicId: topic.id } },
            }
          : {}),
      },
    });
    const s = await db.userSession.create({
      data: {
        userId: u.id,
        refreshTokenHash: randomBytes(32).toString("hex"),
        expiresAt: new Date(now.getTime() + 86400000),
      },
    });
    return {
      id: u.id,
      token: (await app.get(Tokens).issue(u.id, s.id, s.expiresAt)).accessToken,
    };
  }
  const n = await notice("rec-shared"),
    p = await program("rec-shared", 1),
    draft = await notice("rec-draft", "PENDING"),
    hidden = await notice("rec-hidden", "APPROVED", "HIDDEN");
  const closed = await program("rec-closed", -1),
    mismatch = await program("rec-mismatch", 4, true);
  const me = await member("recreader", true),
    incomplete = await member("recguest", false);
  await db.userNoticeBookmark.create({
    data: {
      user: { connect: { id: me.id } },
      notice: { connect: { publicId: n.id } },
    },
  });
  const rec = async (q = "", options = {}) =>
    (
      await http(
        "GET",
        "/recommendations?q=" + encodeURIComponent(tag) + q,
        200,
        options,
      )
    ).data;
  const compare = (refs, status = 200, options = {}) =>
    http("POST", "/comparisons", status, { ...options, body: { items: refs } });
  const ref = (c) => ({ type: c.type, id: c.id });

  await t.test(
    "R01 tabs apply filters and counts before paging; all globally pages the union in stable order",
    async () => {
      assert.equal(
        (await rec("&type=notice&status=all&noticeCategory=career")).pagination
          .totalItems,
        1,
      );
      const typed = await rec("&type=program&status=all&programCategory=other");
      assert.deepEqual(typed.items.map(ref), [closed, p, mismatch]);
      assert.equal(typed.pagination.totalItems, 3);
      assert.deepEqual(
        (await rec("&type=program&deadlineWithinDays=3")).items.map(ref),
        [p],
      );
      const all = await rec("&status=all");
      assert.deepEqual(all.items.map(ref), [closed, p, n, mismatch, draft]);
      assert.deepEqual(
        (await rec("&type=all&status=all&sort=latest&size=2&page=2")).items.map(
          ref,
        ),
        [closed, mismatch],
      );
      const second = await rec("&status=all&size=2&page=2");
      assert.deepEqual(second.items.map(ref), [n, mismatch]);
      assert.equal(second.pagination.totalItems, 5);
      assert.equal(second.pagination.hasNext, true);
      const empty = await rec("&status=all&size=2&page=8");
      assert.equal(empty.pagination.totalItems, 5);
      assert.deepEqual(empty.items, []);
      assert.deepEqual((await rec()).items.map(ref), [p, n, mismatch]);
      for (const q of [
        "type=mixed",
        "programCategory=other",
        "type=program&noticeCategory=career",
        "type=notice&programCategory=other",
        "type=program&programCategory=bogus",
        "type=notice&type=notice",
        "recommendedOnly=true",
        "status=all&deadlineWithinDays=3",
        "topic=bogus",
        "sort=saved",
      ])
        await http("GET", "/recommendations?" + q, 400);
      await http("GET", "/recommendations", 401, { token: "invalid" });
    },
  );
  await t.test(
    "R01 personalized recommendations include unknown, exclude only verified mismatches, and scope bookmark data",
    async () => {
      const personal = await rec("&status=all", { token: me.token }),
        general = await rec("&status=all", { token: incomplete.token });
      assert.equal(personal.context.mode, "PERSONALIZED");
      assert.deepEqual(personal.items.map(ref), [n, closed, p, draft]);
      assert.equal(personal.items[0].recommendation.score, 100);
      assert.equal(personal.items[0].bookmark.saved, true);
      const unknown = personal.items.find(
        (i) => i.type === "program" && i.id === p.id,
      );
      assert.equal(unknown.recommendation.eligibility.status, "UNKNOWN");
      assert.equal(
        unknown.recommendation.eligibility.requiresSourceCheck,
        true,
      );
      assert.equal(general.context.mode, "GENERAL");
      assert.equal(general.pagination.totalItems, 5);
      assert(
        general.items.every(
          (i) => !i.bookmark.saved && i.recommendation.score === null,
        ),
      );
      const typed = await rec("&type=program&status=all", { token: me.token });
      const browse = (
        await http(
          "GET",
          "/programs?recommendedOnly=true&sort=recommended&status=all&q=" +
            encodeURIComponent(tag),
          200,
          { token: me.token },
        )
      ).data;
      assert.deepEqual(typed.items, browse.items);
    },
  );
  await t.test(
    "R02 compares mixed or same types in input order through the public detail projections",
    async () => {
      const { data } = await compare([p, n, draft], 200, { token: me.token });
      assert.equal(data.mode, "STRUCTURED");
      assert.equal(data.context.mode, "PERSONALIZED");
      assert.deepEqual(
        data.items.map((i) => ref(i.content)),
        [p, n, draft],
      );
      const [prog, note, unready] = data.items;
      assert.equal(prog.publicInfo.points, "0.00");
      assert.equal(prog.publicInfo.pointsText, "참여에 따라 최대 20pt");
      assert.equal(prog.audience.description, "원문 대상 확인");
      assert.equal(prog.targetRules.gradeScope, "UNKNOWN");
      assert.equal(prog.targetRules.academicScope, "ALL");
      assert.equal(prog.preparations, null);
      assert.equal(note.publicInfo, null);
      assert.deepEqual(note.audience.exclusions[0].exceptions, [
        "신입생 첫 학기 예외",
      ]);
      assert.deepEqual(note.audience.preferences, ["보훈 대상 우대"]);
      assert.equal(note.benefits[0].condition, "출석 시");
      assert.equal(note.preparations[0].required, true);
      assert.deepEqual(note.operationGuide, ["담당 부서에 제출"]);
      assert(note.content.bookmark.saved);
      assert.equal(unready.application, null);
      assert.deepEqual(unready.targetRules, {
        gradeScope: "UNKNOWN",
        academicScope: "UNKNOWN",
        grades: [],
        academicUnits: [],
      });
      assert(unready.warnings.some((w) => w.code === "SUMMARY_UNAVAILABLE"));
      assert(!JSON.stringify(data).includes(secret));
      assert(!("body" in prog));
      assert.deepEqual(
        (await compare([n, draft])).data.items.map((i) => ref(i.content)),
        [n, draft],
      );
      assert.deepEqual(
        (await compare([closed, p])).data.items.map((i) => ref(i.content)),
        [closed, p],
      );
      await compare([n, n], 400);
      await compare([p], 400);
      await compare([p, n, draft, closed], 400);
      await compare([p, { ...n, extra: true }], 400);
      await compare([p, { type: "program", id: 5 }], 400);
      await compare([n, hidden], 404);
      await compare([n, { type: "program", id: "missing" }], 404);
      await compare([n, p], 403, { headers: { "X-CSRF-Guard": "" } });
    },
  );
  await t.test(
    "R02 distinguishes the same notice's target rules, each viewer's eligibility and the closed deadline",
    async () => {
      const tracks = await db.academicUnit.findMany({
        where: { kind: "TRACK", isActive: true },
        orderBy: { id: "asc" },
        take: 3,
      });
      const other = await member("recothertrack", true);
      await db.userAcademicUnit.createMany({
        data: [me, other].flatMap((viewer, i) => [
          { userId: viewer.id, slot: 1, academicUnitId: tracks[i].id },
          { userId: viewer.id, slot: 2, academicUnitId: tracks[i + 1].id },
        ]),
      });
      const restricted = await notice("rec-track");
      const { publishedSummaryId: summaryId } =
        await db.notice.findUniqueOrThrow({
          where: { publicId: restricted.id },
        });
      await db.noticeSummary.update({
        where: { id: summaryId },
        data: {
          gradeScope: "RESTRICTED",
          academicScope: "RESTRICTED",
          audienceJson: { preferences: [fact("관련 경험 우대")] },
          targetGrades: {
            create: [
              {
                purpose: "REQUIRED",
                grade: "YEAR_2",
                basisJson: { private: secret },
              },
              {
                purpose: "PREFERRED",
                grade: "YEAR_4",
                basisJson: { private: secret },
              },
            ],
          },
          targetUnits: {
            create: [
              {
                purpose: "REQUIRED",
                academicUnitId: tracks[0].id,
                basisJson: { private: secret },
              },
              {
                purpose: "RECOMMENDED",
                academicUnitId: tracks[1].id,
                basisJson: { private: secret },
              },
            ],
          },
        },
      });
      await db.noticePeriod.updateMany({
        where: { summaryId, role: "APPLICATION" },
        data: { endRaw: "마감", endDate: day(-1) },
      });
      const refs = [restricted, mismatch];
      const mine = (await compare(refs, 200, { token: me.token })).data;
      const theirs = (await compare(refs, 200, { token: other.token })).data;
      const [a, b] = mine.items;
      assert.equal(a.audience.description, null);
      assert.equal(a.targetRules.academicScope, "RESTRICTED");
      assert.deepEqual(
        Object.fromEntries(
          a.targetRules.academicUnits.map((t) => [t.purpose, t.unit.name]),
        ),
        {
          REQUIRED: tracks[0].name,
          RECOMMENDED: tracks[1].name,
        },
      );
      assert(
        a.targetRules.grades.some(
          (g) => g.purpose === "PREFERRED" && g.grade === "YEAR_4",
        ),
      );
      assert.equal(a.content.recruitmentStatus, "closed");
      assert.equal(a.content.recommendation.eligibility.status, "MATCH");
      assert.equal(b.targetRules.grades[0].grade, "YEAR_4");
      assert.equal(b.content.recommendation.eligibility.gradeMatch, "MISMATCH");
      const [otherNotice] = theirs.items;
      assert.deepEqual(otherNotice.targetRules, a.targetRules);
      assert.equal(
        otherNotice.content.recommendation.eligibility.gradeMatch,
        "MATCH",
      );
      assert.equal(
        otherNotice.content.recommendation.eligibility.academicMatch,
        "MISMATCH",
      );
      assert.equal(
        otherNotice.content.recommendation.eligibility.status,
        "MISMATCH",
      );
      for (const options of [{}, { token: incomplete.token }]) {
        const general = (await compare(refs, 200, options)).data;
        assert.equal(general.context.mode, "GENERAL");
        assert.deepEqual(general.items[0].targetRules, a.targetRules);
        assert(
          general.items.every(
            (item) =>
              item.content.recommendation.eligibility.status === "UNKNOWN",
          ),
        );
      }
      assert(!JSON.stringify(mine).includes(secret));
    },
  );
}
