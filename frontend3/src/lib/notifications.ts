// Notification store (TypeScript port of frontend2/dist/notifications.js, behaviour unchanged).
// Background delivery is server-owned; the backend/frontend contract is still being agreed.
export const DEFAULT_SETTINGS = { deadline: true, recommendation: true };
export const NOTIFICATION_HOUR = 9;
export type Settings = typeof DEFAULT_SETTINGS;
export interface NotificationEntry { id: string; type: 'deadline' | 'recommendation'; title: string; body: string; itemId: string | null; createdAt: string; read: boolean }
export interface NotificationState { settings: Settings; entries: NotificationEntry[]; sent: string[]; seen: string[]; pending: string[]; initialized: boolean; lastDigest: string | null }
export interface NotificationAdapter {
  load(): Promise<{ notifications: unknown[]; settings: Settings }>;
  updateSettings(settings: Settings): Promise<unknown>;
  markRead(ids: string[]): Promise<unknown>;
  subscribePush?(subscription: unknown): Promise<unknown>;
  unsubscribePush?(subscription: unknown): Promise<unknown>;
  isPushSubscribed?(subscription: unknown): Promise<boolean>;
  vapidPublicKey?: string;
}
interface EvaluationItem { id: string; title: string; deadline: string | null; start: string | null }

export function seoulDay(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const hour = (now: Date) => Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(now));
export function validDay(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
}
export function cleanNotification(n: any): NotificationEntry | null {
  if (!n || !['deadline', 'recommendation'].includes(n.type) || typeof n.id !== 'string' || !n.id || n.id.length > 250 || typeof n.title !== 'string' || !Number.isFinite(Date.parse(n.createdAt))) return null;
  if (n.type === 'deadline' && (typeof n.itemId !== 'string' || !n.itemId || n.itemId.length > 150)) return null;
  return { id: n.id, type: n.type, title: n.title.slice(0, 200), body: typeof n.body === 'string' ? n.body.slice(0, 500) : '', itemId: n.type === 'deadline' ? n.itemId : null, createdAt: n.createdAt, read: !!n.read };
}
export function initialNotificationState(): NotificationState {
  return { settings: { ...DEFAULT_SETTINGS }, entries: [], sent: [], seen: [], pending: [], initialized: false, lastDigest: null };
}
export function normalizeState(raw: any): NotificationState {
  const s = initialNotificationState();
  if (!raw || typeof raw !== 'object') return s;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) if (typeof raw.settings?.[k] === 'boolean') s.settings[k] = raw.settings[k];
  const strings = (a: unknown) => (Array.isArray(a) ? [...new Set(a.filter((x) => typeof x === 'string').map((x: string) => x.slice(0, 250)))] : []);
  const ids = new Set<string>();
  s.entries = (Array.isArray(raw.entries) ? raw.entries : []).map(cleanNotification).filter((n: NotificationEntry | null): n is NotificationEntry => !!n && !ids.has(n.id) && !!ids.add(n.id)).slice(0, 200);
  s.sent = strings(raw.sent); s.seen = strings(raw.seen); s.pending = strings(raw.pending);
  s.initialized = raw.initialized === true;
  s.lastDigest = validDay(raw.lastDigest) ? raw.lastDigest : null;
  return s;
}
export function evaluateNotifications(raw: unknown, { items, saved, eligible, now = new Date() }: { items: EvaluationItem[]; saved: Set<string>; eligible: (i: EvaluationItem) => boolean; now?: Date }) {
  const s = normalizeState(raw), today = seoulDay(now), newEntries: NotificationEntry[] = [], all = new Map(items.map((i) => [i.id, i]));
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const open = (i: EvaluationItem) => validDay(i.deadline) && i.deadline >= today && (!i.start || i.start <= today);
  const known = new Set(s.seen), sent = new Set(s.sent);
  if (!s.initialized && items.length) { s.seen = [...all.keys()]; s.initialized = true; }
  else for (const i of items) if (!known.has(i.id)) { s.seen.push(i.id); if (s.settings.recommendation && eligible(i)) s.pending.push(i.id); }
  s.pending = [...new Set(s.pending)].filter((id) => all.has(id) && open(all.get(id)!) && eligible(all.get(id)!));
  const add = (n: NotificationEntry) => { if (sent.has(n.id)) return; sent.add(n.id); s.sent.push(n.id); newEntries.push(n); };
  if (hour(now) >= NOTIFICATION_HOUR) {
    if (s.settings.deadline) for (const i of items) if (saved.has(i.id) && open(i) && i.deadline === tomorrow)
      add({ id: `deadline:${i.id}`, type: 'deadline', itemId: i.id, title: '저장한 PICK이 내일 마감돼요!', body: i.title, createdAt: now.toISOString(), read: false });
    if (s.settings.recommendation && s.pending.length && s.lastDigest !== today) {
      add({ id: `recommendation:${today}`, type: 'recommendation', itemId: null, title: '새로운 맞춤 PICK이 도착했어요!', body: `나에게 맞는 새로운 소식 ${s.pending.length}개를 확인해보세요.`, createdAt: now.toISOString(), read: false });
      s.lastDigest = today; s.pending = [];
    }
  }
  s.entries = [...newEntries.reverse(), ...s.entries].slice(0, 200);
  return { state: s, added: newEntries };
}

export function createNotificationCenter({ context, onChange = () => {}, onError = () => {} }: {
  context: () => { items: EvaluationItem[]; saved: Set<string>; eligible: (i: EvaluationItem) => boolean };
  onChange?: () => void; onError?: (message: string) => void;
}) {
  let owner = 'guest', key = '', state = initialNotificationState(), adapter: NotificationAdapter | null = null, epoch = 0;
  const persist = () => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { onError('알림 변경사항을 저장하지 못했어요.'); }
    onChange();
  };
  function setOwner(id: string | null | undefined) {
    owner = id ? String(id) : 'guest';
    key = 'hsupick-notifications-v1:' + encodeURIComponent(owner);
    epoch++;
    try { state = normalizeState(JSON.parse(localStorage.getItem(key) || 'null')); } catch { state = initialNotificationState(); }
    onChange();
  }
  function evaluate(now?: Date) {
    if (adapter) return;
    state = evaluateNotifications(state, { ...context(), now }).state;
    persist();
  }
  async function refresh() {
    if (!adapter) return;
    const version = epoch;
    const data = await adapter.load();
    if (version !== epoch) return;
    if (!Array.isArray(data?.notifications) || typeof data.settings?.deadline !== 'boolean' || typeof data.settings?.recommendation !== 'boolean') throw new TypeError('Invalid notification response');
    state = normalizeState({ ...state, settings: data.settings, entries: data.notifications });
    persist();
  }
  async function settings(patch: Partial<Settings>) {
    const next = { ...state.settings };
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) if (typeof patch[k] === 'boolean') next[k] = patch[k]!;
    if (adapter) { const version = epoch; await adapter.updateSettings(next); if (version !== epoch) return; }
    state.settings = next;
    if (!next.recommendation) state.pending = [];
    persist();
  }
  async function markRead(ids: string[]) {
    const list = ids.filter((id) => state.entries.some((n) => n.id === id && !n.read));
    if (!list.length) return;
    if (adapter) { const version = epoch; await adapter.markRead(list); if (version !== epoch) return; }
    state.entries = state.entries.map((n) => (list.includes(n.id) ? { ...n, read: true } : n));
    persist();
  }
  async function connect(next: NotificationAdapter) {
    if (owner === 'guest') throw new Error('로그인한 계정에서 알림을 연결해 주세요.');
    if (!next || !(['load', 'updateSettings', 'markRead'] as const).every((k) => typeof next[k] === 'function')) throw new TypeError('알림 서버 연결 정보가 올바르지 않아요.');
    adapter = next; epoch++;
    try { await refresh(); } catch (e) { adapter = null; throw e; }
  }
  function disconnect() { adapter = null; epoch++; }
  function reload() { try { state = normalizeState(JSON.parse(localStorage.getItem(key) || 'null')); onChange(); } catch { /* keep current */ } }
  return {
    setOwner, evaluate, refresh, settings, markRead, connect, disconnect, reload,
    get key() { return key; },
    get adapter() { return adapter; },
    get state(): NotificationState { return structuredClone(state); },
  };
}
export type NotificationCenter = ReturnType<typeof createNotificationCenter>;
