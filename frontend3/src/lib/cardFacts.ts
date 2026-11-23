// Card fact cells (대상 · 마감 · 혜택). frontend2 has the same rules in dist/card-facts.js.
//
// 대상: line 1 = grade, line 2 = which of MY slots the post is for.
//   - grade: my grade when the post accepts it, otherwise the post's grades; unknown → 원문 확인.
//   - slot: my grade is not accepted → empty (the grade line already says so); no academic condition → empty; condition matches my 1/2/3 slot → "1트랙" ("1·2트랙"),
//     or "내 전공" when the matching slot is not a track; no match / unknown / no profile → 원문 확인.
// 마감: "26.11.17 (화)" and, when the time is known, "23:00" on a second line; none → 원문 확인.
// 혜택: programs with points → "비교과 10pt"; anything else → 원문 확인.
// A cell that does not fit tries its narrow form ("26.11.26" / "(화) 23:00", "비교과" / "10pt") and then 원문 확인.
export const ORIGINAL = '원문 확인';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export type FactGrade = 1 | 2 | 3 | 4 | 'other';
export interface UnitRule { id?: string | null; name?: string; includeDescendants?: boolean }
export interface TargetRules {
  gradeScope: string; grades: FactGrade[];
  academicScope: string; units: UnitRule[];
}
export interface FactSlot { slot: number; id?: string | null; name?: string; kind?: string | null; ancestors?: string[] }
export interface FactProfile { grade: FactGrade | null; slots: FactSlot[] }

export const gradeLabel = (grade: FactGrade) => (grade === 'other' ? '기타 학년' : `${grade}학년`);

export function gradeListLabel(list: FactGrade[]): string {
  const nums = [...new Set((list || []).filter((g): g is 1 | 2 | 3 | 4 => g === 1 || g === 2 || g === 3 || g === 4))].sort((a, b) => a - b);
  const other = (list || []).includes('other');
  if (!nums.length && !other) return ORIGINAL;
  if (other) {
    return nums.length ? `${nums.join('·')}학년 · ${gradeLabel('other')}` : gradeLabel('other');
  }
  return nums.length === 4 ? '전 학년' : `${nums.join('·')}학년`;
}

export function gradeLine(target: TargetRules, profile: FactProfile | null): string {
  const mine = profile?.grade ?? null;
  if (target.gradeScope === 'ALL') return mine ? gradeLabel(mine) : '전 학년';
  if (target.gradeScope !== 'RESTRICTED') return ORIGINAL;
  if (mine && target.grades.includes(mine)) return gradeLabel(mine);
  return gradeListLabel(target.grades);
}

const normalizeUnit = (name?: string) => String(name || '').replace(/\s+/g, '').replace(/트랙$/, '');

// Same rule as the backend matcher: the unit itself, or a parent unit that includes its descendants.
export function unitMatches(rule: UnitRule, slot: FactSlot): boolean {
  if (rule.id && slot.id) {
    if (String(rule.id) === String(slot.id)) return true;
    return !!rule.includeDescendants && (slot.ancestors || []).map(String).includes(String(rule.id));
  }
  return !!rule.name && normalizeUnit(rule.name) === normalizeUnit(slot.name);
}

export function unitLine(target: TargetRules, profile: FactProfile | null): string {
  if (target.academicScope === 'ALL') return '';
  if (target.academicScope !== 'RESTRICTED' || !target.units.length) return ORIGINAL;
  const slots = profile?.slots || [];
  const matched = slots.filter((slot) => target.units.some((rule) => unitMatches(rule, slot)));
  if (!matched.length) return ORIGINAL;
  const isTrack = (slot: FactSlot) => (slot.kind ? slot.kind === 'TRACK' : Number(profile?.grade) !== 1);
  const tracks = matched.filter(isTrack).map((slot) => slot.slot).sort((a, b) => a - b);
  return tracks.length ? `${tracks.join('·')}트랙` : '내 전공';
}

// Both unknown → a single 원문 확인 line. My grade not accepted → grade line only.
export function targetLines(target: TargetRules, profile: FactProfile | null): string[] {
  const mine = profile?.grade ?? null;
  if (mine && target.gradeScope === 'RESTRICTED' && !target.grades.includes(mine)) return [gradeLine(target, profile)];
  const lines = [gradeLine(target, profile), unitLine(target, profile)].filter(Boolean);
  return lines.every((line) => line === ORIGINAL) ? [ORIGINAL] : lines;
}

// date: 'YYYY-MM-DD' (Seoul civil day); time: 'HH:MM' or null.
export function deadlineLines(date: string | null, time: string | null): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!m) return [ORIGINAL];
  const weekday = WEEKDAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  const first = `${m[1].slice(2)}.${m[2]}.${m[3]} (${weekday})`;
  return /^\d{2}:\d{2}$/.test(time || '') ? [first, time as string] : [first];
}

// Narrow form of the deadline: date on line 1, weekday and time on line 2. null when there is nothing to wrap.
export function deadlineCompact(date: string | null, time: string | null): string[] | null {
  const [first, second] = deadlineLines(date, time);
  const m = /^(\S+) (\(.\))$/.exec(first);
  return m ? [m[1], second ? `${m[2]} ${second}` : m[2]] : null;
}

// Seoul wall-clock time of a {precision, value} boundary when the time is known.
export function boundaryTime(boundary: { precision?: string; value?: string | null } | null | undefined): string | null {
  if (boundary?.precision !== 'datetime' || !boundary.value) return null;
  const at = new Date(boundary.value);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
}

// Design display: prefer the API amount, otherwise use the first P/pt amount
// in the description, matching the existing program detail screen.
export function pointsFrom(text: unknown, amount?: unknown): number | null {
  if ((typeof amount === 'number' || typeof amount === 'string') && /^\d+(?:\.\d+)?$/.test(String(amount)) && Number.isFinite(Number(amount))) return Number(amount);
  const m = /(\d+(?:\.\d+)?)\s*p(?:t)?\b/i.exec(typeof text === 'string' ? text : '');
  return m && Number.isFinite(Number(m[1])) ? Number(m[1]) : null;
}

export function benefitLine(type: string, points: number | null | undefined): string {
  return type === 'program' && typeof points === 'number' && Number.isFinite(points) && points >= 0 ? `비교과 ${Number(points)}pt` : ORIGINAL;
}

// Narrow form of the benefit: "비교과" / "10pt". null for 원문 확인.
export function benefitCompact(type: string, points: number | null | undefined): string[] | null {
  const line = benefitLine(type, points);
  return line === ORIGINAL ? null : ['비교과', line.slice('비교과 '.length)];
}
