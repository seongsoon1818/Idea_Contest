// Fixed catalogs shared with the backend (codes match backend/prisma/catalog-data.json).
export interface Category { id: string; name: string; short: string; icon: string; color: string; hint?: string }

const seoulDateFormat = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Calendar day in Seoul (YYYY-MM-DD); deadlines follow the university's time zone. */
export function todayDate(now = new Date()): string {
  const parts = Object.fromEntries(seoulDateFormat.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Profile interests (backend topics). */
export const CATEGORIES: Category[] = [
  { id: 'scholarship', name: '장학·지원', short: '장학', icon: 'wallet', color: 'orange', hint: '장학금과 학생 지원' },
  { id: 'career', name: '진로·취업', short: '취업', icon: 'briefcase', color: 'blue', hint: '직무 탐색과 취업 준비' },
  { id: 'intern', name: '현장실습', short: '실습', icon: 'building', color: 'teal', hint: '현장에서 쌓는 경험' },
  { id: 'contest', name: '공모전·대외활동', short: '공모전', icon: 'trophy', color: 'purple', hint: '도전하고 만드는 활동' },
  { id: 'study', name: '학습·전공', short: '학습', icon: 'book', color: 'teal', hint: '학습 역량과 전공 성장' },
  { id: 'startup', name: '창업', short: '창업', icon: 'rocket', color: 'orange', hint: '아이디어를 현실로' },
  { id: 'wellbeing', name: '상담·마음건강', short: '마음건강', icon: 'heart', color: 'pink', hint: '마음 돌봄과 대학 생활' },
  { id: 'culture', name: '문화·교류', short: '교류', icon: 'globe', color: 'purple', hint: '문화 체험과 글로벌 교류' },
];
export const NOTICE_CATEGORIES: Category[] = [
  { id: 'academic', name: '학사', short: '학사', icon: 'book', color: 'blue' },
  { id: 'scholarship', name: '장학·지원', short: '장학', icon: 'wallet', color: 'orange' },
  { id: 'career', name: '진로·취업', short: '취업', icon: 'briefcase', color: 'blue' },
  { id: 'intern', name: '현장실습', short: '실습', icon: 'building', color: 'teal' },
  { id: 'activity', name: '비교과', short: '비교과', icon: 'pencil', color: 'teal' },
  { id: 'startup', name: '창업', short: '창업', icon: 'rocket', color: 'orange' },
  { id: 'international', name: '국제·교류', short: '교류', icon: 'globe', color: 'purple' },
];
export const PROGRAM_CATEGORIES: Category[] = [
  { id: 'learning', name: '학습역량강화', short: '학습', icon: 'book', color: 'teal' },
  { id: 'counseling', name: '상담·심리지원', short: '상담', icon: 'heart', color: 'pink' },
  { id: 'startup', name: '창업지원', short: '창업', icon: 'rocket', color: 'orange' },
  { id: 'major', name: '전공역량강화', short: '전공', icon: 'building', color: 'blue' },
  { id: 'other', name: '기타', short: '기타', icon: 'globe', color: 'purple' },
];
const UNCLASSIFIED: Category = { id: 'unclassified', name: '미분류', short: '미분류', icon: 'info', color: 'blue' };

export const cat = (id: string | null | undefined) => CATEGORIES.find((c) => c.id === id);
export const categoryFor = (type: 'notice' | 'program', code: string | null) =>
  (type === 'program' ? PROGRAM_CATEGORIES : NOTICE_CATEGORIES).find((c) => c.id === code) || UNCLASSIFIED;
export const sourceUrl = (type: string) =>
  type === 'notice' ? 'https://www.hansung.ac.kr/hansung/6172/subview.do' : 'https://hsportal.hansung.ac.kr/';
export const normalizeTrack = (t: string) => t.replace(/트랙/g, '').replace(/\s/g, '').trim();
