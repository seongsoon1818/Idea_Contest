import assert from 'node:assert/strict';
import { ORIGINAL, gradeLabel, gradeListLabel, gradeLine, unitLine, targetLines, deadlineLines, deadlineCompact, boundaryTime, pointsFrom, benefitLine, benefitCompact } from '../dist/card-facts.js';

// Profile: 3학년, 1트랙 기업경영 (id 11, parent 학부 1), 2트랙 디지털마케팅 (id 22).
const me = { grade: 3, slots: [{ slot: 1, id: '11', name: '기업경영트랙', kind: 'TRACK', ancestors: ['1', '100'] }, { slot: 2, id: '22', name: '디지털마케팅트랙', kind: 'TRACK', ancestors: ['2', '100'] }] };
const freshman = { grade: 1, slots: [{ slot: 1, id: '1', name: '경영학부', kind: 'DEPARTMENT', ancestors: ['100'] }] };
const T = (o) => ({ gradeScope: 'ALL', grades: [], academicScope: 'ALL', units: [], ...o });

// Grade labels.
assert.equal(gradeLabel(4), '4학년'); assert.equal(gradeLabel('other'), '4학년 이상');
assert.equal(gradeListLabel([1, 2]), '1·2학년'); assert.equal(gradeListLabel([1, 2, 3, 4]), '전 학년');
assert.equal(gradeListLabel([4, 'other']), '4학년 이상'); assert.equal(gradeListLabel(['other']), '4학년 이상');
assert.equal(gradeListLabel([3, 4, 'other']), '3학년 이상'); assert.equal(gradeListLabel([]), ORIGINAL);

// Grade line: mine when accepted, the post's grades when not, 원문 확인 when unknown.
assert.equal(gradeLine(T({}), me), '3학년');
assert.equal(gradeLine(T({}), null), '전 학년');
assert.equal(gradeLine(T({ gradeScope: 'RESTRICTED', grades: [3, 4] }), me), '3학년');
assert.equal(gradeLine(T({ gradeScope: 'RESTRICTED', grades: [1, 2] }), me), '1·2학년');
assert.equal(gradeLine(T({ gradeScope: 'RESTRICTED', grades: [4, 'other'] }), { grade: 'other' }), '4학년 이상');
assert.equal(gradeLine(T({ gradeScope: 'UNKNOWN' }), me), ORIGINAL);

// Unit line: the user's example — post for 기업경영트랙, my 1트랙 is 기업경영트랙 → "1트랙".
assert.equal(unitLine(T({ academicScope: 'RESTRICTED', units: [{ id: '11', name: '기업경영' }] }), me), '1트랙');
assert.equal(unitLine(T({ academicScope: 'RESTRICTED', units: [{ id: '22' }, { id: '11' }] }), me), '1·2트랙');
// A parent unit that includes descendants matches the tracks under it; without the flag it does not.
assert.equal(unitLine(T({ academicScope: 'RESTRICTED', units: [{ id: '2', includeDescendants: true }] }), me), '2트랙');
assert.equal(unitLine(T({ academicScope: 'RESTRICTED', units: [{ id: '2', includeDescendants: false }] }), me), ORIGINAL);
// Non-track slot (1학년 학부) → 내 전공.
assert.equal(unitLine(T({ academicScope: 'RESTRICTED', units: [{ id: '1' }] }), freshman), '내 전공');
assert.equal(unitLine(T({ academicScope: 'RESTRICTED', units: [{ id: '100', includeDescendants: true }] }), freshman), '내 전공');
// No condition → empty line; mismatch, unknown, empty rule list or no profile → 원문 확인.
assert.equal(unitLine(T({}), me), '');
assert.equal(unitLine(T({ academicScope: 'RESTRICTED', units: [{ id: '99' }] }), me), ORIGINAL);
assert.equal(unitLine(T({ academicScope: 'UNKNOWN' }), me), ORIGINAL);
assert.equal(unitLine(T({ academicScope: 'RESTRICTED', units: [] }), me), ORIGINAL);
assert.equal(unitLine(T({ academicScope: 'RESTRICTED', units: [{ id: '11' }] }), null), ORIGINAL);
// Built-in sample data has names only.
assert.equal(unitLine(T({ academicScope: 'RESTRICTED', units: [{ name: '디지털마케팅' }] }), { grade: 2, slots: [{ slot: 1, name: '기업경영' }, { slot: 2, name: '디지털마케팅' }] }), '2트랙');
assert.equal(unitLine(T({ academicScope: 'RESTRICTED', units: [{ name: '경영학부' }] }), { grade: 1, slots: [{ slot: 1, name: '경영학부' }] }), '내 전공');

assert.deepEqual(targetLines(T({}), me), ['3학년']);
assert.deepEqual(targetLines(T({ gradeScope: 'UNKNOWN', academicScope: 'UNKNOWN' }), me), [ORIGINAL]);
assert.deepEqual(targetLines(T({ academicScope: 'UNKNOWN' }), me), ['3학년', ORIGINAL]);
assert.deepEqual(targetLines(T({ academicScope: 'RESTRICTED', units: [{ id: '11' }] }), me), ['3학년', '1트랙']);

// Deadline: 26.11.17 (화) [+ 23:00].
assert.deepEqual(deadlineLines('2026-11-17', '23:00'), ['26.11.17 (화)', '23:00']);
assert.deepEqual(deadlineLines('2026-11-22', null), ['26.11.22 (일)']);
assert.deepEqual(deadlineLines('2027-02-28', ''), ['27.02.28 (일)']);
assert.deepEqual(deadlineLines(null, '10:00'), [ORIGINAL]);
assert.equal(boundaryTime({ precision: 'datetime', value: '2026-11-17T14:00:00.000Z' }), '23:00');
assert.equal(boundaryTime({ precision: 'datetime', value: '2026-11-16T15:00:00.000Z' }), '00:00');
assert.equal(boundaryTime({ precision: 'date', value: '2026-11-17' }), null);
assert.equal(boundaryTime(null), null);

// Benefit: programs with points only.
assert.equal(pointsFrom('10pt'), 10); assert.equal(pointsFrom('2.5 pt'), 2.5); assert.equal(pointsFrom('최대 10pt'), null);
assert.equal(benefitLine('program', 10), '비교과 10pt');
assert.equal(benefitLine('program', 2.5), '비교과 2.5pt');
assert.equal(benefitLine('program', null), ORIGINAL);
assert.equal(benefitLine('program', 0), ORIGINAL);
assert.equal(benefitLine('notice', 10), ORIGINAL);

// Narrow forms used when a cell is too small.
assert.deepEqual(deadlineCompact('2026-11-26', '18:00'), ['26.11.26', '(목) 18:00']);
assert.deepEqual(deadlineCompact('2026-11-26', null), ['26.11.26', '(목)']);
assert.equal(deadlineCompact(null, null), null);
assert.deepEqual(benefitCompact('program', 12.5), ['비교과', '12.5pt']);
assert.equal(benefitCompact('notice', 10), null);

console.log('Card facts: grade/slot target lines, 26.11.17 (화) 23:00 deadline, 비교과 Npt benefit, 원문 확인 fallbacks');
