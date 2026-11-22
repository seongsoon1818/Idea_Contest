// Text and small pieces shared by cards, detail and comparison (same rules as the design build).
import type { Item, Profile, Grade, ProgramInfo } from '../lib/live';
import { cat, sourceUrl } from '../lib/data';

export const statusOf = (i: Item) => i.status;
export const daysLeft = (i: Item) => i.days ?? Infinity;
export const gradeLabel = (grade: Grade | null) => (grade === 'other' ? '기타' : `${grade}학년`);
export const fmt = (d: string) => d.slice(5).replace('-', '.');
export const target = (i: Item) =>
  !i.grades.length ? '원문 확인'
    : `${i.grades.length === 4 ? '전 학년' : i.grades.map((g) => g + '학년').join('·')} · ${i.trackEligibilityKnown === false ? '트랙 조건 원문 확인' : i.tracks.length ? i.tracks.map((t) => t + '트랙').join(', ') : '트랙 무관'}`;


export function Badge({ item }: { item: Item }) {
  const s = statusOf(item), d = daysLeft(item);
  if (s === 'unknown') return <span className="badge status-badge unknown">일정 미확인</span>;
  if (s === 'not_applicable') return <span className="badge status-badge unknown">신청 없음</span>;
  if (s === 'closed') return <span className="badge status-badge closed">모집 마감</span>;
  if (s === 'upcoming') return <span className="badge status-badge upcoming">모집 예정</span>;
  return (
    <span className={`badge status-badge ${d === 0 ? 'today' : d <= 7 ? 'deadline' : 'open'}`}>
      {d === 0 ? <><span className="deadline-alert" aria-hidden="true">!</span> 오늘 마감</> : d <= 7 ? 'D-' + d : '모집 중'}
    </span>
  );
}

export function Eligibility({ item, profile }: { item: Item; profile: Profile | null }) {
  const e = item.recommendation?.eligibility || {}, s = statusOf(item);
  const warn = (text: string) => <span className="condition-pill warning">{text}</span>;
  if (!item.targetsLoaded || !item.grades.length || item.trackEligibilityKnown === false) return warn('신청 대상은 원문에서 확인해 주세요');
  if (!profile) return warn('내 정보를 입력해 대상 확인');
  if (e.status === 'MISMATCH') return warn(e.gradeMatch === 'MISMATCH' ? '내 학년은 신청 대상이 아니에요' : '내 트랙은 신청 대상이 아니에요');
  if (e.status !== 'MATCH') return warn('신청 대상은 원문에서 확인해 주세요');
  return (
    <span className={`condition-pill eligibility-match ${s === 'closed' ? 'closed' : ''}`}>
      {s === 'closed' ? '대상 조건 일치 · 모집 마감' : s === 'upcoming' ? '대상 조건 일치 · 모집 예정' : '내 학년·트랙 조건에 맞아요'}
    </span>
  );
}

export function recommendationReason(i: Item, profile: Profile | null) {
  const e = i.recommendation?.eligibility || {}, s = statusOf(i), reasons = i.recommendation?.reasons || [];
  if (profile && e.status === 'MISMATCH') return e.gradeMatch === 'MISMATCH' ? '내 학년 대상이 아니에요.' : '내 트랙 대상이 아니에요.';
  if (s === 'closed') return '모집이 끝난 공고예요.';
  if (s === 'upcoming') return '신청 일정을 미리 확인해 보세요!';
  if (!profile) return daysLeft(i) <= 3 ? '마감이 가까운 공고예요!' : '신청 대상과 일정을 확인해 주세요.';
  if (i.category && profile.interests.includes(i.category)) return `${cat(i.category)?.short || '선택한'} 관심 분야와 맞아요!`;
  if (reasons.includes('지정 소속 일치')) return '내 트랙을 위한 공고예요!';
  if (e.gradeMatch !== 'MATCH') return '신청 대상을 원문에서 확인해 주세요.';
  return profile.grade === 'other' ? '전 학년 대상 공고예요!' : `${gradeLabel(profile.grade)}이 참여할 수 있어요!`;
}

export const applicationText = (i: Item) =>
  i.applicationLines?.length ? i.applicationLines.join(' / ') : [i.startText, i.deadlineText].filter(Boolean).join(' ~ ') || '원문 확인';

/** Program facts come only from the public info the API returns. */
export function programInfo(item: Item): ProgramInfo {
  const source: Partial<ProgramInfo> = item.publicInfo ?? {};
  const value = (key: keyof ProgramInfo) => (typeof source[key] === 'string' ? (source[key] as string).trim() : '');
  const rawPoints = value('points').replace(/\s*pt$/i, '');
  return {
    summary: value('summary'), audience: value('audience'), applicationPeriod: value('applicationPeriod'),
    points: /^\d+(?:\.\d+)?$/.test(rawPoints) ? rawPoints : '', department: value('department'), location: value('location'), format: value('format'),
  };
}
export function officialUrl(item: Item) {
  try {
    const url = new URL(item.originalUrl);
    if (url.protocol === 'https:' && !url.username && !url.password && (url.hostname === 'hansung.ac.kr' || url.hostname.endsWith('.hansung.ac.kr'))) return url.href;
  } catch { /* fall back */ }
  return sourceUrl(item.type);
}
/** Same accepted image URLs as notice-images.js. */
export function noticeImages(item: Item) {
  const seen = new Set<string>();
  return (item.images || []).flatMap((entry, index) => {
    try {
      const parsed = new URL(entry.url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || seen.has(parsed.href)) return [];
      seen.add(parsed.href);
      return [{ url: parsed.href, alt: entry.alt?.trim() ? entry.alt.trim() : `${item.title} 안내 이미지 ${index + 1}` }];
    } catch { return []; }
  });
}
