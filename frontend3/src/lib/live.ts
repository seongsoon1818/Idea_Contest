// Backend data layer: cached API reads + conversion to the item shape the screens use.
// (TypeScript port of frontend2/dist/live.js and campus-store.js.)
import { boundaryTime, pointsFrom, type FactGrade, type TargetRules } from './cardFacts';
import { campusApi } from './accountApi';
import { getAccountUser } from './session';
import { todayDate } from './data';

export const PAGE_SIZE = 20;
export type ContentType = 'notice' | 'program';
export type Status = 'open' | 'upcoming' | 'closed' | 'unknown' | 'not_applicable';
export type Grade = 1 | 2 | 3 | 4 | 'other';

export interface ProfileSlot { slot: number; id: string; name: string; kind: string | null; parentId: string | null }
export interface Profile { name: string; grade: Grade | null; tracks: string[]; interests: string[]; slots?: ProfileSlot[] }
export interface Bookmark { saved: boolean; deadlineReminderEnabled?: boolean | null; savedAt?: string | null }
export interface Eligibility { status?: string; gradeMatch?: string; academicMatch?: string }
export interface Recommendation { reasons?: string[]; eligibility?: Eligibility }
export interface ProgramInfo { summary: string; audience: string; applicationPeriod: string; points: string; department: string; location: string; format: string }

export interface Item {
  id: string; rawId: string; type: ContentType; title: string; subtitle: string;
  noticeCategory: string | null; programCategory: string | null; category: string | null;
  status: Status; days: number | null; start: string | null; deadline: string | null; startText: string; deadlineText: string;
  deadlineTime: string | null; points: number | null; targetRules?: TargetRules;
  benefit: string; targetText: string; tags: string[]; publishedAt: string; department: string; originalUrl: string;
  bookmark: Bookmark | null; recommendation: Recommendation | null;
  grades: number[]; tracks: string[]; trackEligibilityKnown: boolean; targetsLoaded: boolean;
  detailed?: boolean; overview?: string; audienceText?: string; applicationLines?: string[]; eventAt: string; activityLines?: string[];
  benefitLines?: string[]; preparations: string[]; guideLines?: string[];
  images: { url: string; alt: string }[]; attachments: { url: string; name: string }[]; warnings: string[];
  publicInfo?: ProgramInfo | null;
}

export const liveKey = (type: string, id: string) => `${type}:${id}`;
export function parseKey(key: string | null | undefined): { type: ContentType; id: string } | null {
  const match = /^(notice|program):([A-Za-z0-9_-]{1,128})$/.exec(key || '');
  return match ? { type: match[1] as ContentType, id: match[2] } : null;
}

const GRADE_NUMBER: Record<string, 1 | 2 | 3 | 4> = { YEAR_1: 1, YEAR_2: 2, YEAR_3: 3, YEAR_4: 4 };
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : '');
// Links shown to users must be plain https URLs.
const safeUrl = (value: unknown) => (typeof value === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(value) ? value : '');
type Boundary = { rawText?: string; value?: string | null } | null | undefined;
function day(boundary: Boundary): string | null {
  const value = boundary?.value;
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : todayDate(parsed);
}
const raw = (boundary: Boundary) => text(boundary?.rawText) || (day(boundary) ? day(boundary)!.replaceAll('-', '.') : '');
function range(start: Boundary, end: Boundary) {
  const from = raw(start), to = raw(end);
  return from && to && from !== to ? `${from} ~ ${to}` : from || to;
}
const periodLine = (p: any) => [text(p.label), range(p.start, p.end)].filter(Boolean).join(': ');

/** Card → item. Grades/tracks stay unknown until the item's target rules arrive. */
export function toItem(card: any, previous?: Item): Item {
  const item: Item = {
    ...(previous || ({} as Item)),
    id: liveKey(card.type, card.id), rawId: card.id, type: card.type, title: card.title,
    subtitle: text(card.oneLineSummary),
    noticeCategory: card.noticeCategory?.code ?? null,
    programCategory: card.programCategory?.code ?? null,
    category: card.primaryTopic?.code ?? null,
    status: card.recruitmentStatus || 'unknown',
    days: typeof card.daysLeft === 'number' ? card.daysLeft : null,
    start: day(card.applicationStart), deadline: day(card.deadline),
    startText: raw(card.applicationStart), deadlineText: raw(card.deadline),
    deadlineTime: boundaryTime(card.deadline),
    points: card.type === 'program' ? pointsFrom(card.benefitSummary, card.points) : null,
    benefit: previous?.detailed ? previous.benefit : text(card.benefitSummary),
    targetText: text(card.targetSummary),
    tags: Array.isArray(card.tags) ? card.tags : [],
    publishedAt: card.publishedDate || '',
    department: previous?.department || text(card.author),
    originalUrl: card.originalUrl || '',
    bookmark: card.bookmark ?? null,
    // A list card can carry less eligibility detail than the detail response; keep the richer one.
    recommendation: previous?.detailed && card.recommendation?.eligibility?.status === 'UNKNOWN' && previous.recommendation ? previous.recommendation : card.recommendation ?? null,
  };
  if (!previous?.targetsLoaded) Object.assign(item, { grades: [], tracks: [], trackEligibilityKnown: true, targetsLoaded: false });
  if (!previous?.detailed) Object.assign(item, { preparations: [], eventAt: '', images: [], attachments: [], warnings: [] });
  if (card.targetRules) applyTargets(item, card.targetRules);
  return item;
}
/** Target rules → grades [1..4] and required track names. */
export function applyTargets(item: Item, rules: any) {
  if (!rules) return item;
  const required = (list: any[]) => (list || []).filter((entry) => entry.purpose === 'REQUIRED');
  item.grades = rules.gradeScope === 'ALL' ? [1, 2, 3, 4] : rules.gradeScope === 'RESTRICTED'
    ? [...new Set(required(rules.grades).map((entry) => GRADE_NUMBER[entry.grade]).filter(Boolean))].sort() : [];
  item.tracks = rules.academicScope === 'RESTRICTED' ? required(rules.academicUnits).map((entry) => entry.unit?.name).filter(Boolean) : [];
  item.trackEligibilityKnown = rules.academicScope !== 'UNKNOWN';
  // Raw rules for the 대상 cell: grades incl. OTHER (기타 학년) and units with ids for slot matching.
  item.targetRules = {
    gradeScope: rules.gradeScope || 'UNKNOWN', academicScope: rules.academicScope || 'UNKNOWN',
    grades: required(rules.grades).map((entry) => (entry.grade === 'OTHER' ? 'other' : GRADE_NUMBER[entry.grade])).filter(Boolean) as FactGrade[],
    units: required(rules.academicUnits).map((entry) => ({ id: entry.unit?.id ?? null, name: entry.unit?.name || '', includeDescendants: !!entry.includeDescendants })),
  };
  item.targetsLoaded = true;
  return item;
}
/** Detail (or comparison entry) → the richer item used by detail, source and comparison. */
export function toDetailItem(data: any, previous?: Item): Item {
  const card = data.card || data.content;
  const item = toItem(card, previous);
  const summary = data.summary || null;
  applyTargets(item, data.targetRules);
  const audience = summary?.audience || data.audience || null;
  const application = summary?.application || data.application || null;
  const periods: any[] = application?.periods || [];
  const activity: any[] = summary?.activityPeriods || data.activityPeriods || [];
  const benefits: any[] = summary?.benefits || data.benefits || [];
  const preparations: any[] = summary?.preparations || data.preparations || [];
  const info = data.publicInfo || null;
  Object.assign(item, {
    detailed: true,
    overview: text(summary?.oneLineSummary) || item.subtitle,
    audienceText: text(audience?.description) || item.targetText,
    applicationLines: periods.length === 1 ? [range(periods[0].start, periods[0].end)].filter(Boolean) : periods.map(periodLine).filter(Boolean),
    eventAt: activity.map(periodLine).filter(Boolean).join(' / '),
    activityLines: activity.map(periodLine).filter(Boolean),
    benefit: benefits.length ? benefits.map((b) => [text(b.text), text(b.condition)].filter(Boolean).join(' · ')).filter(Boolean).join(' / ') : item.benefit,
    benefitLines: benefits.map((b) => [text(b.text), text(b.condition), b.availability === 'conditional' ? '조건부' : ''].filter(Boolean).join(' · ')).filter(Boolean),
    preparations: preparations.map((p) => [text(p.text), text(p.condition)].filter(Boolean).join(' · ')).filter(Boolean),
    guideLines: [...(application?.methods || []), ...(summary?.operationGuide || data.operationGuide || [])].map(text).filter(Boolean),
    department: text(info?.department) || item.department,
    images: Array.isArray(data.images)
      ? data.images.filter((a: any) => safeUrl(a.url) && a.availability !== 'UNAVAILABLE').map((a: any) => ({ url: a.url, alt: text(a.alt) && a.alt !== 'external_image' ? a.alt : '' }))
      : item.images,
    attachments: Array.isArray(data.attachments)
      ? data.attachments.filter((a: any) => safeUrl(a.url)).map((a: any) => ({ url: a.url, name: text(a.filename) || '첨부파일' }))
      : item.attachments,
    warnings: (data.warnings || []).map((w: any) => text(w.message)).filter(Boolean),
  });
  if (item.type === 'program') {
    const points = pointsFrom(info?.pointsText, info?.points);
    item.publicInfo = info ? {
      summary: text(info.summary) || item.subtitle, audience: text(info.audience) || item.targetText,
      applicationPeriod: text(info.applicationPeriod) || range(card.applicationStart, card.deadline),
      points: points === null ? '' : String(points), department: text(info.department), location: text(info.location), format: text(info.format),
    } : null;
  }
  return item;
}

export function listPath(view: string, type: ContentType, { page = 1, query = '', category = 'all', sort = 'recommended', openOnly = false, size = PAGE_SIZE } = {}) {
  const params = new URLSearchParams({ page: String(page), size: String(size), status: openOnly ? 'open' : 'all' });
  if (query.trim()) params.set('q', query.trim());
  if (category === 'recommended') params.set('recommendedOnly', 'true');
  else if (category !== 'all') params.set(`${type}Category`, category);
  params.set('sort', sort);
  if (view === 'recommend') {
    params.set('type', type);
    params.delete('recommendedOnly');
    return `/recommendations?${params}`;
  }
  const path = view === 'saved' ? `/users/me/bookmarks/${type}` : `/${type}s`;
  return `${path}?${params}`;
}
export function profileFromApi(data: any): Profile | null {
  if (!data?.completed) return null;
  return {
    name: data.name || '',
    grade: data.grade === 'OTHER' ? 'other' : GRADE_NUMBER[data.grade] ?? null,
    tracks: [...(data.academicUnits || [])].sort((a, b) => a.slot - b.slot).map((entry) => entry.unit?.name).filter(Boolean),
    slots: [...(data.academicUnits || [])].filter((entry) => entry.unit).sort((a, b) => a.slot - b.slot)
      .map((entry) => ({ slot: entry.slot, id: String(entry.unit.id), name: entry.unit.name, kind: entry.unit.kind ?? null, parentId: entry.unit.parentId == null ? null : String(entry.unit.parentId) })),
    interests: (data.interests || []).map((topic: any) => topic.code),
  };
}

export interface Entry<T = any> { pending: boolean; data?: T; error?: any; finished?: number }

/** Shared response cache. Responses stay fresh for 60s; every change notifies the UI once. */
class LiveStore {
  private entries = new Map<string, Entry>();
  private items = new Map<string, Item>();
  private bookmarks = new Map<string, Bookmark>();
  private listeners = new Set<() => void>();
  private session = 0;
  version = 0;

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getVersion = () => this.version;
  private changed() { this.version++; this.listeners.forEach((l) => l()); }

  /** Read a GET path; starts the request when missing or stale. */
  read<T = any>(path: string): Entry<T> {
    let entry = this.entries.get(path);
    if (entry && (entry.pending || Date.now() - (entry.finished || 0) < 60_000)) return entry;
    entry = { pending: true };
    const current = entry;
    this.entries.set(path, current);
    campusApi.call(path).then((data) => { current.data = data; }, (error) => { current.error = error; }).finally(() => {
      current.pending = false;
      current.finished = Date.now();
      if (this.entries.get(path) === current) {
        if (current.data && /^\/(notices|programs)\/[^/?]+$/.test(path)) this.rememberDetail(current.data, false);
        this.changed();
      }
    });
    return current;
  }
  peek<T = any>(path: string): Entry<T> | undefined { return this.entries.get(path); }
  prime(path: string, data: unknown) { this.entries.set(path, { pending: false, data, finished: Date.now() }); this.changed(); }

  private withBookmark(card: any) {
    const key = liveKey(card.type, card.id);
    return this.bookmarks.has(key) ? { ...card, bookmark: this.bookmarks.get(key) } : card;
  }
  remember(card: any): Item {
    card = this.withBookmark(card);
    const item = toItem(card, this.items.get(liveKey(card.type, card.id)));
    this.items.set(item.id, item);
    return item;
  }
  rememberDetail(data: any, notify = true): Item {
    const card = this.withBookmark(data.card || data.content);
    const item = toDetailItem(data.card ? { ...data, card } : { ...data, content: card }, this.items.get(liveKey(card.type, card.id)));
    this.items.set(item.id, item);
    if (notify) this.changed();
    return item;
  }
  item(key: string) { return this.items.get(key); }
  /** Fetch target rules for cards on screen so the 대상 cell matches the design. */
  loadTargets(list: Item[]) { for (const item of list) if (!item.targetsLoaded) this.read(`/${item.type}s/${item.rawId}`); }

  setBookmark(key: string, bookmark: Bookmark) {
    this.bookmarks.set(key, bookmark);
    const item = this.items.get(key);
    if (item) this.items.set(key, { ...item, bookmark });
    // Saved lists and counts change; other cached lists keep their cards.
    for (const path of [...this.entries.keys()]) if (path.startsWith('/users/me/bookmarks') || path === '/home') this.entries.delete(path);
    this.changed();
  }
  async call<T = any>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
    const epoch = this.session;
    const data = await campusApi.call<T>(path, options);
    if (epoch !== this.session) throw new Error('계정이 변경됐어요. 다시 시도해 주세요.');
    return data;
  }
  profile(): Profile | null {
    if (!getAccountUser()) return null;
    const entry = this.read('/users/me/profile');
    return entry.data ? profileFromApi(entry.data) : null;
  }
  /** id → parent id of every academic unit, for "includes descendants" target rules. null until loaded. */
  private parentsFrom: unknown = null;
  private parents: Map<string, string | null> | null = null;
  unitParents(): Map<string, string | null> | null {
    const entry = this.read<{ items?: { id: string; parentId?: string | null }[] }>('/catalog/academic-units');
    if (!entry.data) return null;
    if (this.parentsFrom !== entry.data) {
      this.parentsFrom = entry.data;
      this.parents = new Map((entry.data.items || []).map((unit) => [String(unit.id), unit.parentId == null ? null : String(unit.parentId)]));
    }
    return this.parents;
  }
  async unitIdsByName() {
    const data = await this.call<{ items: { id: string; name: string }[] }>('/catalog/academic-units');
    return new Map((data.items || []).map((unit) => [unit.name, unit.id]));
  }
  invalidate() { this.entries.clear(); this.bookmarks.clear(); this.changed(); }
  reset() { this.session++; this.entries.clear(); this.items.clear(); this.bookmarks.clear(); this.changed(); }
}

export const live = new LiveStore();
