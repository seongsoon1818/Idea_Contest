// Live data layer for the connected (backend) mode.
// It only reads and converts API data; every screen is drawn by app.js with the
// same markup as the design build, so the two modes look identical.
import {campusApi} from './account-api.js?v=3';
import {CampusStore} from './campus-store.js';
import {getAccountUser} from './account-session.js?v=1.16.73';
import {todayDate} from './data.js?v=1.16.73';

export const PAGE_SIZE = 20;
export const liveKey = (type, id) => `${type}:${id}`;
export function parseKey(key) {
 const match = /^(notice|program):([A-Za-z0-9_-]{1,128})$/.exec(key || '');
 return match ? {type: match[1], id: match[2]} : null;
}
// Backend name rule (backend/src/common/input.ts nameInput), checked before saving.
export const NAME_PATTERN = /^\p{L}[\p{L}\p{M}]*(?:[ '’·-]\p{L}[\p{L}\p{M}]*)*$/u;
const GRADE_NUMBER = {YEAR_1: 1, YEAR_2: 2, YEAR_3: 3, YEAR_4: 4};
const text = value => typeof value === 'string' && value.trim() ? value.trim() : '';
// A boundary is {rawText, precision, value}; the calendar day follows Seoul time.
function day(boundary) {
 const value = boundary?.value;
 if (!value) return null;
 if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
 const parsed = new Date(value);
 return Number.isNaN(parsed.getTime()) ? null : todayDate(parsed);
}
const raw = boundary => text(boundary?.rawText) || (day(boundary) ? day(boundary).replaceAll('-', '.') : '');
function range(start, end) {
 const from = raw(start), to = raw(end);
 return from && to && from !== to ? `${from} ~ ${to}` : from || to;
}
const periodLine = p => [text(p.label), range(p.start, p.end)].filter(Boolean).join(': ');

// Card → the item shape app.js renders. `grades`/`tracks` stay unknown until the
// item's target rules arrive (cards do not carry them).
export function toItem(card, previous) {
 const key = liveKey(card.type, card.id);
 const item = {
  ...(previous || {}),
  id: key, rawId: card.id, live: true, type: card.type, title: card.title,
  subtitle: text(card.oneLineSummary),
  noticeCategory: card.noticeCategory?.code ?? null,
  programCategory: card.programCategory?.code ?? null,
  categoryName: (card.noticeCategory || card.programCategory)?.name || '',
  category: card.primaryTopic?.code ?? null,
  status: card.recruitmentStatus || 'unknown',
  days: typeof card.daysLeft === 'number' ? card.daysLeft : null,
  start: day(card.applicationStart), deadline: day(card.deadline),
  startText: raw(card.applicationStart), deadlineText: raw(card.deadline),
  benefit: previous?.detailed ? previous.benefit : text(card.benefitSummary),
  targetText: text(card.targetSummary),
  tags: Array.isArray(card.tags) ? card.tags : [],
  publishedAt: card.publishedDate || '',
  department: previous?.department || text(card.author),
  originalUrl: card.originalUrl || '',
  bookmark: card.bookmark ?? null,
  recommendation: card.recommendation ?? null
 };
 if (!previous?.targetsLoaded) Object.assign(item, {grades: [], tracks: [], trackEligibilityKnown: true, targetsLoaded: false});
 if (!previous?.detailed) Object.assign(item, {preparations: [], eventAt: '', images: [], attachments: [], warnings: []});
 if (card.targetRules) applyTargets(item, card.targetRules);
 return item;
}
// Target rules → 1번 format: grades [1..4] and required track names.
export function applyTargets(item, rules) {
 if (!rules) return item;
 const required = list => (list || []).filter(entry => entry.purpose === 'REQUIRED');
 item.grades = rules.gradeScope === 'ALL' ? [1, 2, 3, 4] : rules.gradeScope === 'RESTRICTED'
  ? [...new Set(required(rules.grades).map(entry => GRADE_NUMBER[entry.grade]).filter(Boolean))].sort() : [];
 item.tracks = rules.academicScope === 'RESTRICTED' ? required(rules.academicUnits).map(entry => entry.unit?.name).filter(Boolean) : [];
 item.trackEligibilityKnown = rules.academicScope !== 'UNKNOWN';
 item.targetsLoaded = true;
 return item;
}
// Detail (or comparison entry) → the richer item used by detail, source and comparison.
export function toDetailItem(data, previous) {
 const card = data.card || data.content;
 const item = toItem(card, previous);
 const summary = data.summary || null;
 applyTargets(item, data.targetRules);
 const audience = summary?.audience || data.audience || null;
 const application = summary?.application || data.application || null;
 const periods = application?.periods || [];
 const activity = summary?.activityPeriods || data.activityPeriods || [];
 const benefits = summary?.benefits || data.benefits || [];
 const preparations = summary?.preparations || data.preparations || [];
 const info = data.publicInfo || null;
 Object.assign(item, {
  detailed: true,
  overview: text(summary?.oneLineSummary) || item.subtitle,
  audienceText: text(audience?.description) || item.targetText,
  applicationLines: periods.length === 1 ? [range(periods[0].start, periods[0].end)].filter(Boolean) : periods.map(periodLine).filter(Boolean),
  eventAt: activity.map(periodLine).filter(Boolean).join(' / '),
  activityLines: activity.map(periodLine).filter(Boolean),
  benefit: benefits.length ? benefits.map(b => [text(b.text), text(b.condition)].filter(Boolean).join(' · ')).filter(Boolean).join(' / ') : item.benefit,
  benefitLines: benefits.map(b => [text(b.text), text(b.condition), b.availability === 'conditional' ? '조건부' : ''].filter(Boolean).join(' · ')).filter(Boolean),
  preparations: preparations.map(p => [text(p.text), text(p.condition)].filter(Boolean).join(' · ')).filter(Boolean),
  guideLines: [...(application?.methods || []), ...(summary?.operationGuide || data.operationGuide || [])].map(text).filter(Boolean),
  department: text(info?.department) || item.department,
  images: Array.isArray(data.images) ? data.images.filter(asset => asset.url && asset.availability !== 'UNAVAILABLE').map(asset => ({url: asset.url, alt: text(asset.alt) && asset.alt !== 'external_image' ? asset.alt : ''})) : item.images,
  attachments: Array.isArray(data.attachments) ? data.attachments.filter(asset => asset.url).map(asset => ({url: asset.url, name: text(asset.filename) || '첨부파일'})) : item.attachments,
  warnings: (data.warnings || []).map(w => text(w.message)).filter(Boolean)
 });
 if (item.type === 'program') {
  const points = info?.points != null && Number.isFinite(Number(info.points)) ? String(Number(info.points))
   : (text(info?.pointsText).match(/(\d+(?:\.\d+)?)\s*(?:p|pt)\b/i)?.[1] || '');
  item.publicInfo = info ? {
   summary: text(info.summary) || item.subtitle, audience: text(info.audience) || item.targetText,
   applicationPeriod: text(info.applicationPeriod) || range(card.applicationStart, card.deadline),
   points, department: text(info.department), location: text(info.location), format: text(info.format)
  } : null;
 }
 return item;
}
// Same query rules as the earlier connected UI (campus-content.js listPath).
export function listPath(view, type, {page = 1, query = '', category = 'all', sort = 'recommended', openOnly = false, size = PAGE_SIZE} = {}) {
 const params = new URLSearchParams({page: String(page), size: String(size), status: openOnly ? 'open' : 'all'});
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
export function profileFromApi(data) {
 if (!data?.completed) return null;
 return {
  name: data.name || '',
  grade: data.grade === 'OTHER' ? 'other' : GRADE_NUMBER[data.grade] ?? null,
  tracks: [...(data.academicUnits || [])].sort((a, b) => a.slot - b.slot).map(entry => entry.unit?.name).filter(Boolean),
  interests: (data.interests || []).map(topic => topic.code)
 };
}

export function createLive() {
 const store = new CampusStore();
 const items = new Map();
 // Bookmark changes made here win over list responses cached before the change.
 const bookmarks = new Map();
 let session = 0;
 const user = () => getAccountUser();
 function read(path, changed) { return store.read(path, changed); }
 function withBookmark(card) {
  const key = liveKey(card.type, card.id);
  return bookmarks.has(key) ? {...card, bookmark: bookmarks.get(key)} : card;
 }
 function remember(card) {
  card = withBookmark(card);
  const item = toItem(card, items.get(liveKey(card.type, card.id)));
  items.set(item.id, item);
  return item;
 }
 function rememberDetail(data) {
  const card = withBookmark(data.card || data.content);
  const item = toDetailItem(data.card ? {...data, card} : {...data, content: card}, items.get(liveKey(card.type, card.id)));
  items.set(item.id, item);
  return item;
 }
 // Fetch target rules for cards on screen so the 대상 cell can be drawn as in 1번.
 function loadTargets(list, changed) {
  let waiting = false;
  for (const item of list) {
   if (item.targetsLoaded) continue;
   const entry = read(`/${item.type}s/${item.rawId}`, () => {
    const done = store.entries.get(`/${item.type}s/${item.rawId}`);
    if (done?.data) { rememberDetail(done.data); changed(); }
   });
   if (entry.data) rememberDetail(entry.data); else waiting = true;
  }
  return waiting;
 }
 async function call(path, options) {
  const epoch = session;
  const data = await campusApi.call(path, options);
  if (epoch !== session) throw new Error('계정이 변경됐어요. 다시 시도해 주세요.');
  return data;
 }
 function profile(changed) {
  if (!user()) return null;
  const entry = read('/users/me/profile', changed);
  return entry.data ? profileFromApi(entry.data) : null;
 }
 async function unitIdsByName() {
  const data = await call('/catalog/academic-units');
  return new Map((data.items || []).map(unit => [unit.name, unit.id]));
 }
 return {
  read, remember, rememberDetail, loadTargets, call, profile, unitIdsByName,
  item: key => items.get(key),
  setBookmark(key, bookmark) {
   bookmarks.set(key, bookmark);
   const item = items.get(key);
   if (item) item.bookmark = bookmark;
   // Saved lists and counts change; other cached lists keep their cards.
   for (const path of [...store.entries.keys()]) if (path.startsWith('/users/me/bookmarks') || path === '/home') store.entries.delete(path);
  },
  prime(path, data) { store.entries.set(path, {pending: false, data, finished: Date.now()}); },
  user,
  invalidate() { store.invalidate(); bookmarks.clear(); },
  reset() { session++; store.invalidate(); items.clear(); bookmarks.clear(); },
  entry: path => store.entries.get(path)
 };
}
