// Card fact cells (대상 · 마감 · 혜택). frontend3 has the same rules in src/lib/cardFacts.ts.
//
// 대상: line 1 = grade, line 2 = which of MY slots the post is for.
//   - grade: my grade when the post accepts it, otherwise the post's grades; unknown → 원문 확인.
//   - slot: no academic condition → empty; condition matches my 1/2/3 slot → "1트랙" ("1·2트랙"),
//     or "내 전공" when the matching slot is not a track; no match / unknown / no profile → 원문 확인.
// 마감: "26.11.17 (화)" and, when the time is known, "23:00" on a second line; none → 원문 확인.
// 혜택: programs with points → "비교과 10pt"; anything else → 원문 확인.
// A cell that does not fit tries its narrow form ("26.11.26" / "(화) 23:00", "비교과" / "10pt") and then 원문 확인.
export const ORIGINAL = '원문 확인';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const gradeLabel = (grade) => (grade === 'other' ? '4학년 이상' : `${grade}학년`);

// Grades a post accepts: numbers 1–4 and 'other' (beyond the 4th year).
export function gradeListLabel(list) {
  const nums = [...new Set((list || []).filter((g) => [1, 2, 3, 4].includes(g)))].sort((a, b) => a - b);
  const other = (list || []).includes('other');
  if (!nums.length && !other) return ORIGINAL;
  if (other) {
    if (!nums.length) return '4학년 이상';
    const run = nums.every((n, i) => n === nums[0] + i) && nums[nums.length - 1] === 4;
    return run ? `${nums[0]}학년 이상` : `${nums.join('·')}학년 · 4학년 이상`;
  }
  return nums.length === 4 ? '전 학년' : `${nums.join('·')}학년`;
}

export function gradeLine(target, profile) {
  const mine = profile?.grade ?? null;
  if (target.gradeScope === 'ALL') return mine ? gradeLabel(mine) : '전 학년';
  if (target.gradeScope !== 'RESTRICTED') return ORIGINAL;
  if (mine && target.grades.includes(mine)) return gradeLabel(mine);
  return gradeListLabel(target.grades);
}

const normalizeUnit = (name) => String(name || '').replace(/\s+/g, '').replace(/트랙$/, '');

// Same rule as the backend matcher: the unit itself, or a parent unit that includes its descendants.
// Without ids (built-in sample data) units are compared by name.
export function unitMatches(rule, slot) {
  if (rule.id && slot.id) {
    if (String(rule.id) === String(slot.id)) return true;
    return !!rule.includeDescendants && (slot.ancestors || []).map(String).includes(String(rule.id));
  }
  return !!rule.name && normalizeUnit(rule.name) === normalizeUnit(slot.name);
}

export function unitLine(target, profile) {
  if (target.academicScope === 'ALL') return '';
  if (target.academicScope !== 'RESTRICTED' || !target.units.length) return ORIGINAL;
  const slots = profile?.slots || [];
  const matched = slots.filter((slot) => target.units.some((rule) => unitMatches(rule, slot)));
  if (!matched.length) return ORIGINAL;
  const isTrack = (slot) => (slot.kind ? slot.kind === 'TRACK' : Number(profile.grade) !== 1);
  const tracks = matched.filter(isTrack).map((slot) => slot.slot).sort((a, b) => a - b);
  return tracks.length ? `${tracks.join('·')}트랙` : '내 전공';
}

// Both unknown → a single 원문 확인 line.
export function targetLines(target, profile) {
  const lines = [gradeLine(target, profile), unitLine(target, profile)].filter(Boolean);
  return lines.every((line) => line === ORIGINAL) ? [ORIGINAL] : lines;
}

// date: 'YYYY-MM-DD' (Seoul civil day); time: 'HH:MM' or null.
export function deadlineLines(date, time) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!m) return [ORIGINAL];
  const weekday = WEEKDAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  const first = `${m[1].slice(2)}.${m[2]}.${m[3]} (${weekday})`;
  return /^\d{2}:\d{2}$/.test(time || '') ? [first, time] : [first];
}

// Narrow form of the deadline: date on line 1, weekday and time on line 2. null when there is nothing to wrap.
export function deadlineCompact(date, time) {
  const [first, second] = deadlineLines(date, time);
  const m = /^(\S+) (\(.\))$/.exec(first);
  return m ? [m[1], second ? `${m[2]} ${second}` : m[2]] : null;
}

// Seoul wall-clock time of a {precision, value} boundary when the time is known.
export function boundaryTime(boundary) {
  if (boundary?.precision !== 'datetime' || !boundary.value) return null;
  const at = new Date(boundary.value);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
}

// "10pt" / "2.5 pt" → number; anything else → null.
export function pointsFrom(text) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*pt\s*$/i.exec(String(text || ''));
  return m ? Number(m[1]) : null;
}

export function benefitLine(type, points) {
  return type === 'program' && Number.isFinite(points) && points > 0 ? `비교과 ${Number(points)}pt` : ORIGINAL;
}

// Narrow form of the benefit: "비교과" / "10pt". null for 원문 확인.
export function benefitCompact(type, points) {
  const line = benefitLine(type, points);
  return line === ORIGINAL ? null : ['비교과', line.slice('비교과 '.length)];
}

// Fit every cell: full lines, else the narrow form, else 원문 확인 (re-run on redraw and resize).
export function fitFactCells(root) {
  for (const preview of root.querySelectorAll('.card-facts .card-fact-preview[data-lines]')) {
    let lines, compact;
    try { lines = JSON.parse(preview.dataset.lines); compact = preview.dataset.compact ? JSON.parse(preview.dataset.compact) : null; } catch { continue; }
    if (!Array.isArray(lines) || !lines.length) continue;
    const show = (values) => {
      preview.replaceChildren(...values.map((value) => {
        const span = preview.ownerDocument.createElement('span');
        span.className = 'fact-line';
        span.textContent = value;
        return span;
      }));
    };
    const overflows = () => [...preview.children].some((line) => line.scrollWidth > line.clientWidth + 1);
    show(lines);
    if (!preview.getClientRects().length || !overflows()) continue; // hidden cells are measured later
    if (Array.isArray(compact) && compact.length) { show(compact); if (!overflows()) continue; }
    show([ORIGINAL]);
  }
}
