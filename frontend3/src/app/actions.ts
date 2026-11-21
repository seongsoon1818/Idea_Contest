// Every user action lives here (navigation, dialogs, profile, MY PICK, account, login).
// Behaviour follows frontend2 (backend-connected mode).
import { getUI, setUI, topModal, modalKey, type ModalDesc, type View, type Draft } from './store';
import { live, parseKey, profileFromApi, type Profile, type Item } from '../lib/live';
import { campusApi, type ApiUser } from '../lib/accountApi';
import { getAccountUser, setAccountSession, subscribeAccountSession, logoutAccount } from '../lib/session';
import { NAME_PATTERN } from '../lib/authRules';
import { normalizeTrack } from '../lib/data';
import { isSelectableTrack, trackOptionsForSlot } from '../lib/tracks';
import { notificationCenter, bindNotificationToast } from './notifications';

export const VIEWS: View[] = ['recommend', 'notices', 'programs', 'saved', 'profile', 'notifications'];
export const validView = (id: string): id is View => (VIEWS as string[]).includes(id);
const ONBOARDING_KEY = 'hsupick-onboarding-v2';
const GUEST_KEY = 'hsupick-browse-this-tab';
const isAuthHash = (hash: string) => hash === '#login' || hash === '#signup';

/* ---------- toast ---------- */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string) {
  setUI({ toastText: text, toastVisible: true });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setUI({ toastVisible: false }), 2800);
}

/* ---------- profile (server) ---------- */
export const currentProfile = (): Profile | null => live.profile();

/* ---------- navigation & dialogs (each dialog is one history entry) ---------- */
let pendingDestination: View | null = null;
let pendingOnboardingProfile = false;

export function navigate(next: View, updateHash = true) {
  if (!validView(next)) return;
  setUI({ view: next, searchExpanded: false, heroIndex: 0, category: 'all', query: '', sort: 'recommended', openOnly: true, page: 1, modals: [], miniMenuOpen: false });
  if (updateHash && location.hash !== '#' + next) history.pushState(null, '', '#' + next);
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}

export function openModal(m: ModalDesc) {
  const s = getUI(), top = topModal(s);
  if (top && modalKey(top) === modalKey(m)) { setUI({ modals: [...s.modals.slice(0, -1), m], modalEnter: false }); return; }
  const modals = [...s.modals, m];
  setUI({ modals, modalEnter: s.modals.length === 0, miniMenuOpen: false });
  history.pushState({ hsuModal: modals.length }, '', location.hash || '#recommend');
}
/** Close dialogs without touching history (used before switching screens). */
export function closeModals() { if (getUI().modals.length) setUI({ modals: [] }); }

export function back(all = false) {
  const s = getUI(), top = topModal(s);
  if (!top) return;
  if (top.kind === 'onboarding' && top.beforeLogin) { finishOnboarding(); return; }
  if (top.kind === 'onboarding') markOnboardingSeen();
  if (top.kind === 'profile-discard') { setUI({ discardDestination: null }); history.back(); return; }
  if ((top.kind === 'profile-1' || (top.kind === 'profile-2' && all)) && profileChanged()) { openModal({ kind: 'profile-discard' }); return; }
  history.go(all ? -s.modals.length : -1);
}
export function finishFlow(next: View) {
  const depth = getUI().modals.length;
  if (depth > 0) { pendingDestination = next; history.go(-depth); return; }
  navigate(next);
}

function onPopState(event: PopStateEvent) {
  const s = getUI();
  const depth = typeof event.state?.hsuModal === 'number' ? event.state.hsuModal : 0;
  if (depth < s.modals.length) {
    const remaining = s.modals.slice(0, depth);
    const leavingProfile = s.modals.slice(depth).some((m) => m.kind === 'profile-1' || m.kind === 'profile-2') &&
      !remaining.some((m) => m.kind === 'profile-1' || m.kind === 'profile-2');
    if (leavingProfile && profileChanged() && topModal(s)?.kind !== 'profile-discard') {
      history.pushState({ hsuModal: s.modals.length }, '', location.hash || '#recommend');
      openModal({ kind: 'profile-discard' });
      return;
    }
    setUI({ modals: remaining, modalEnter: false });
    if (depth === 0) {
      if (pendingDestination) { const next = pendingDestination; pendingDestination = null; navigate(next); }
      if (pendingOnboardingProfile) { pendingOnboardingProfile = false; startProfile(); }
    }
    return;
  }
  if (depth === 0 && !s.modals.length) routeFromHash();
}

export function routeFromHash() {
  if (isAuthHash(location.hash)) return;
  const hash = location.hash.slice(1);
  const ref = /^(notice|program|source)\/([a-zA-Z0-9_-]{1,128})$/.exec(hash);
  if (ref) {
    const type = ref[1] === 'program' ? 'program' : 'notice';
    navigate((type + 's') as View, false);
    openModal({ kind: ref[1] === 'source' ? 'source' : 'detail', id: `${type}:${ref[2]}` });
    return;
  }
  const next: View = hash === 'explore' ? 'notices' : validView(hash) ? hash : 'recommend';
  navigate(next, false);
  if (hash === 'explore') history.replaceState(null, '', '#notices');
}

/* ---------- lists ---------- */
export function setFilters(patch: Partial<Pick<ReturnType<typeof getUI>, 'category' | 'query' | 'sort' | 'openOnly' | 'searchExpanded'>>) {
  setUI({ ...patch, page: 1 });
}
export function selectCategory(category: string) {
  const s = getUI();
  const mobileSaved = s.view === 'saved' && matchMedia('(max-width:800px)').matches;
  setUI(category === 'recommended' ? { category, query: '', sort: 'recommended', openOnly: mobileSaved ? s.openOnly : true, page: 1 } : { category, page: 1 });
}
export function selectTab(tab: 'notice' | 'program') {
  const s = getUI();
  const recommended = s.category === 'recommended' && !(s.view === 'saved' && matchMedia('(max-width:800px)').matches);
  setUI({ ...(s.view === 'recommend' ? { recommendTab: tab } : { savedTab: tab }), category: recommended ? 'recommended' : 'all', query: '', sort: 'recommended', openOnly: true, page: 1 });
}

/* ---------- compare ---------- */
export function toggleCompare(id: string): boolean {
  const compared = getUI().compared;
  if (compared.includes(id)) { setUI({ compared: compared.filter((x) => x !== id) }); return true; }
  if (compared.length === 3) { toast('최대 3개까지 비교할 수 있어요. 기존 선택을 해제해 주세요.'); return false; }
  setUI({ compared: [...compared, id] });
  return true;
}
export function removeCompare(id: string) {
  toggleCompare(id);
  if (getUI().compared.length < 2) { closeModals(); toast('두 개 이상 선택하면 비교할 수 있어요.'); }
}
export function completeComparison() { setUI({ compared: [] }); back(true); }

/** Comparison result from POST /comparisons, kept per selected set. */
export const comparison: { key: string; done: boolean; error: string } = { key: '', done: false, error: '' };
export function loadComparison() {
  const ids = [...getUI().compared];
  const key = [...ids].sort().join(',');
  if (comparison.key === key && (comparison.done || !comparison.error)) return;
  comparison.key = key; comparison.done = false; comparison.error = '';
  live.call<{ items: any[] }>('/comparisons', { method: 'POST', body: { items: ids.map(parseKey) } }).then((data) => {
    if (comparison.key !== key) return;
    data.items.forEach((entry) => live.rememberDetail(entry));
    comparison.done = true;
    setUI({});
  }, (error) => {
    if (comparison.key !== key) return;
    comparison.error = error.message;
    setUI({});
  });
}
export function retryLive() {
  comparison.key = '';
  live.invalidate();
}

/* ---------- MY PICK ---------- */
const busy = new Set<string>();
export async function toggleSave(id: string) {
  if (!getAccountUser()) { toast('MY PICK은 로그인 후 저장할 수 있어요.'); openLogin(); return; }
  const ref = parseKey(id), item = live.item(id);
  if (!ref || !item || busy.has(id)) return;
  busy.add(id);
  try {
    const data = await live.call(`/users/me/bookmarks/${ref.type}s/${ref.id}`, { method: item.bookmark?.saved ? 'DELETE' : 'PUT' });
    live.setBookmark(id, data);
    toast(data.saved ? 'MY PICK에 저장했어요.' : 'MY PICK에서 삭제했어요.');
  } catch (error: any) { toast(error.message); }
  finally { busy.delete(id); }
}
export const isSaved = (item: Item | undefined) => item?.bookmark?.saved === true;

/* ---------- profile flow ---------- */
const draftKey = (value: Draft | null) => JSON.stringify({
  name: value?.name || '', grade: value?.grade ?? null,
  tracks: [1, 2, 3].map((n) => value?.tracks[n - 1] || ''), interests: [...(value?.interests || [])].sort(),
});
export function profileChanged() { const s = getUI(); return !!s.draft && draftKey(s.draft) !== s.profileBaseline; }
function beginProfile(draft: Draft) {
  draft.tracks = draft.tracks.map((t) => (t === '미정' ? '' : t));
  setUI({ draft, profileBaseline: draftKey(draft), profileOrigin: currentProfile() ? getUI().view : null, formError: '', trackPicker: null });
  openModal({ kind: 'profile-1' });
}
export function startProfile() {
  if (!getAccountUser()) { toast('로그인 후 내 정보를 입력할 수 있어요.'); openLogin(); return; }
  const profile = currentProfile();
  beginProfile(profile ? structuredClone(profile) : { name: '', grade: null, tracks: [''], interests: [] });
}
export function restartProfile() {
  beginProfile({ name: currentProfile()?.name || '', grade: null, tracks: [''], interests: [] });
}
export function updateDraft(patch: Partial<Draft>) {
  const draft = { ...getUI().draft!, ...patch };
  if (Number(draft.grade) === 1) draft.tracks = draft.tracks.slice(0, 1);
  setUI({ draft, formError: '' });
}
export function setGrade(grade: Draft['grade']) {
  const draft = { ...getUI().draft! };
  draft.grade = grade;
  draft.tracks = (Number(grade) === 1 ? [1] : [1, 2, 3]).map((n) => draft.tracks[n - 1] || '');
  if (draft.tracks[0] && !isSelectableTrack(draft.tracks[0], { slot: 1, grade })) draft.tracks[0] = '';
  setUI({ draft, formError: '' });
}
/** Step 1 checks; returns the field to focus on error. */
export function submitProfileStep1(): string | null {
  const draft = getUI().draft!;
  const fail = (formError: string, focus: string | null) => { setUI({ formError }); return focus; };
  const name = draft.name.trim();
  if (!name) return fail('이름을 입력해 주세요.', 'profile-name');
  if (!NAME_PATTERN.test(name.normalize('NFC'))) return fail('이름은 한글·영문 글자로만 입력해 주세요. (숫자·특수문자 제외)', 'profile-name');
  if (draft.grade === null) return fail('학년을 선택해 주세요.', 'grade');
  if (!draft.tracks[0]) return fail('1트랙을 선택해 주세요. 1학년은 소속 대학·학부·학과를 선택해 주세요.', 'track-picker-1');
  if (Number(draft.grade) !== 1 && !draft.tracks[1]) return fail('2트랙을 선택해 주세요.', 'track-picker-2');
  const normalized = draft.tracks.filter(Boolean).map(normalizeTrack);
  if (new Set(normalized).size !== normalized.length) return fail('같은 트랙을 두 번 선택할 수 없어요. 선택한 트랙을 확인해 주세요.', null);
  if (draft.tracks.some((t, n) => t && !isSelectableTrack(t, { slot: n + 1, grade: draft.grade }))) return fail('목록에서 선택해 주세요. 1학년의 1트랙은 소속 대학·학부·학과를 선택해야 해요.', null);
  setUI({ draft: { ...draft, name }, formError: '' });
  openModal({ kind: 'profile-2' });
  return null;
}
export async function saveProfile() {
  const s = getUI(), draft = s.draft!;
  if (!draft.interests.length) { setUI({ formError: '관심 분야를 최소 1개 선택해 주세요.' }); return; }
  if (s.profileBusy) return;
  const tracks = Number(draft.grade) === 1 ? draft.tracks.slice(0, 1) : [...draft.tracks];
  while (tracks.length > 1 && !tracks.at(-1)) tracks.pop();
  const origin = s.profileOrigin;
  setUI({ profileBusy: true, formError: '' });
  try {
    const ids = await live.unitIdsByName();
    const academicUnits = tracks.filter(Boolean).map((name, index) => ({ slot: index + 1, academicUnitId: ids.get(name) }));
    if (!academicUnits.length || academicUnits.some((unit) => !unit.academicUnitId)) throw new Error('선택한 트랙을 찾지 못했어요. 트랙을 다시 선택해 주세요.');
    const data = await live.call('/users/me/profile', { method: 'PUT', body: {
      name: draft.name.trim(), grade: draft.grade === 'other' ? 'OTHER' : 'YEAR_' + draft.grade, academicUnits, interestCodes: draft.interests,
    } });
    live.invalidate();
    live.prime('/users/me/profile', data);
    const account = getAccountUser();
    if (account && data.name && account.name !== data.name) setAccountSession({ user: { ...account, name: data.name }, logout: () => campusApi.logout() });
    setUI({ profileBaseline: draftKey(getUI().draft) });
    finishFlow(origin || 'recommend');
    toast(origin ? '내 정보를 수정했어요.' : '나에게 맞는 추천이 준비됐어요.');
  } catch (error: any) { setUI({ formError: error.message }); }
  finally { setUI({ profileBusy: false }); }
}
export function discardProfile() {
  const s = getUI();
  setUI({ profileBaseline: draftKey(s.draft) });
  if (s.discardDestination) pendingDestination = s.discardDestination;
  setUI({ discardDestination: null });
  history.go(-s.modals.length);
}
export function openTrackPicker(slot: number) {
  const draft = getUI().draft!;
  if (Number(draft.grade) === 1 && slot !== 1) return;
  setUI({ trackPicker: { slot, college: 'all', group: 'all', search: '', menu: null, browsing: false } });
  openModal({ kind: 'track-picker' });
}
export function returnFromTrackPicker() {
  const picker = getUI().trackPicker;
  setUI({ trackFocus: picker?.slot ?? null });
  history.back();
}
export function selectTrack(id: string) {
  const s = getUI(), picker = s.trackPicker!, draft = s.draft!;
  const option = trackOptionsForSlot({ slot: picker.slot, grade: draft.grade }).find((t) => t.id === id);
  if (!option || draft.tracks.some((t, n) => n !== picker.slot - 1 && t && normalizeTrack(t) === normalizeTrack(option.name))) return;
  const tracks = [...draft.tracks];
  tracks[picker.slot - 1] = option.name;
  setUI({ draft: { ...draft, tracks } });
  returnFromTrackPicker();
}
export function clearTrack(slot: number) {
  const draft = getUI().draft!;
  const tracks = [...draft.tracks];
  tracks[slot - 1] = '';
  setUI({ draft: { ...draft, tracks }, trackFocus: slot });
}

/* ---------- onboarding ---------- */
let onboardingSeen = false;
export function markOnboardingSeen() { onboardingSeen = true; try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* storage off */ } }
const hasSeenOnboarding = () => { try { return onboardingSeen || localStorage.getItem(ONBOARDING_KEY) === '1'; } catch { return onboardingSeen; } };
export function showOnboarding(step = 0, beforeLogin = false) {
  openModal({ kind: 'onboarding', step: Math.max(0, Math.min(3, step)), beforeLogin });
}
export function finishOnboarding(start = false) {
  markOnboardingSeen();
  const top = topModal();
  if (top?.kind === 'onboarding' && top.beforeLogin) {
    setUI({ modals: [] });
    history.replaceState(null, '', '#login');
    showLogin();
    return;
  }
  if (start && !currentProfile()) {
    if (getUI().modals.length > 0) { pendingOnboardingProfile = true; back(true); }
    else startProfile();
  } else back(true);
}

/* ---------- account dialogs ---------- */
export function accountDialog(action: 'password' | 'delete' | 'social') {
  if (action !== 'social' && !getAccountUser()) { openLogin(); return; }
  openModal({ kind: 'account', action });
}
export async function securityAction(kind: 'password' | 'delete', body: Record<string, string>): Promise<string> {
  try {
    const data = await live.call(kind === 'password' ? '/auth/password/change' : '/users/me/withdraw', { method: 'POST', body });
    if (kind === 'password' ? !data.changed : !data.withdrawn) throw new Error('처리 결과를 확인해 주세요.');
    campusApi.clear();
    setAccountSession(null);
    toast(kind === 'password' ? '비밀번호를 변경했어요. 다시 로그인해 주세요.' : '회원 탈퇴를 완료했어요.');
    return '';
  } catch (error: any) { return error.message; }
}
export async function accountLogout() {
  try {
    await logoutAccount();
    setUI({ compared: [], draft: null, profileOrigin: null, discardDestination: null, modals: [] });
    navigate('recommend');
    window.dispatchEvent(new Event('hsu-signout'));
    toast('로그아웃했어요.');
  } catch (error: any) { toast(error?.message || '로그아웃하지 못했어요. 다시 시도해 주세요.'); }
}

/* ---------- login gate (port of frontend2/dist/login.js) ---------- */
let browsing = false;
let returnHash = location.hash && !isAuthHash(location.hash) ? location.hash : '#recommend';
try { browsing = sessionStorage.getItem(GUEST_KEY) === '1'; } catch { /* storage off */ }

export function showLogin(messageText = '') {
  if (location.hash && !isAuthHash(location.hash)) returnHash = location.hash;
  if (!isAuthHash(location.hash)) history.replaceState(null, '', '#login');
  setUI({ auth: location.hash === '#signup' ? 'signup' : 'login', authMessage: messageText, modals: [] });
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}
export function openLogin() {
  if (location.hash && !isAuthHash(location.hash)) returnHash = location.hash;
  history.pushState(null, '', '#login');
  showLogin();
}
export function openSignup() {
  history.pushState({ hsuAuth: { from: 'login' } }, '', '#signup');
  showLogin();
}
export function returnToLogin() {
  if (location.hash === '#signup' && history.state?.hsuAuth?.from === 'login') { history.back(); return; }
  history.replaceState(null, '', '#login');
  showLogin();
}
export function browse({ authenticated = false } = {}) {
  browsing = !authenticated;
  try { if (authenticated) sessionStorage.removeItem(GUEST_KEY); else sessionStorage.setItem(GUEST_KEY, '1'); } catch { /* storage off */ }
  setUI({ auth: 'hidden', authMessage: '' });
  if (isAuthHash(location.hash) || !location.hash) history.replaceState(null, '', returnHash);
  routeFromHash();
  live.invalidate();
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  if (!hasSeenOnboarding()) showOnboarding();
  // Like frontend2: entering the app moves focus to the page content (after the gate's inert is cleared),
  // unless a dialog such as the first-use guide has just taken focus.
  requestAnimationFrame(() => { if (!document.querySelector('#modal[open]')) document.querySelector<HTMLElement>('#main')?.focus({ preventScroll: true }); });
}
function enterAccount(user: ApiUser) {
  setAccountSession({ user, logout: () => campusApi.logout() });
  browse({ authenticated: true });
}
export async function authenticate(kind: 'login' | 'signup', input: Record<string, string>): Promise<{ message: string; code?: string }> {
  if (getUI().authBusy) return { message: '' };
  setUI({ authBusy: true });
  try {
    const user = await campusApi.authenticate(kind, input);
    enterAccount(user);
    return { message: '' };
  } catch (error: any) { return { message: error.message, code: error.code }; }
  finally { setUI({ authBusy: false }); }
}
function welcomeOrLogin() {
  if (hasSeenOnboarding() || location.hash === '#signup') { showLogin(); return; }
  showLogin();
  setUI({ auth: 'welcome' });
  showOnboarding(0, true);
}
export async function restoreAccount() {
  if (getUI().authBusy) return;
  if (globalThis.navigator?.onLine === false) { setUI({ auth: 'retry' }); return; }
  setUI({ authBusy: true, auth: 'pending' });
  let user: ApiUser;
  try {
    user = await campusApi.restore();
  } catch (error: any) {
    setUI({ authBusy: false });
    if (error.status === 401 && ['INVALID_REFRESH_TOKEN', 'SESSION_REVOKED'].includes(error.code)) welcomeOrLogin();
    else if (error.status === 403 && error.code === 'ACCOUNT_DISABLED') showLogin(error.message);
    else setUI({ auth: 'retry' });
    return;
  }
  setUI({ authBusy: false });
  enterAccount(user);
}
/** Like frontend2: when the address bar or back/forward shows the login gate, focus is not moved to its title. */
export const authFocus = { skipNext: false };
function showLoginFromNavigation() {
  const before = getUI();
  authFocus.skipNext = true;
  showLogin();
  const after = getUI();
  if (after.auth === before.auth && after.authMessage === before.authMessage) authFocus.skipNext = false;
}
function handleAuthNavigation() {
  const auth = getUI().auth;
  if (auth === 'pending' || auth === 'retry') return;
  if (auth === 'welcome') { showLoginFromNavigation(); return; }
  if (getAccountUser()) { if (isAuthHash(location.hash) || auth !== 'hidden') browse({ authenticated: true }); }
  else if (isAuthHash(location.hash) || !browsing) { if (auth === 'hidden' || (location.hash === '#signup') !== (auth === 'signup')) showLoginFromNavigation(); }
  else if (auth !== 'hidden') browse();
}

/* ---------- start ---------- */
let started = false;
export function startApp() {
  if (started) return;
  started = true;
  bindNotificationToast(toast);
  window.addEventListener('popstate', (event) => { onPopState(event); handleAuthNavigation(); });
  window.addEventListener('hashchange', () => { if (!getUI().modals.length) routeFromHash(); handleAuthNavigation(); });
  window.addEventListener('hsu-session-expired', () => { if (getAccountUser()) setAccountSession(null); });
  window.addEventListener('hsu-signout', () => {
    browsing = false;
    try { sessionStorage.removeItem(GUEST_KEY); } catch { /* storage off */ }
    returnHash = '#recommend';
    history.replaceState(null, '', '#login');
    showLogin();
  });
  window.addEventListener('online', () => setUI({ online: true }));
  window.addEventListener('offline', () => setUI({ online: false }));
  let renderedAccountId = getAccountUser()?.id || null;
  subscribeAccountSession((account) => {
    const nextId = account?.id || null;
    if (nextId === renderedAccountId) { setUI({}); return; }
    notificationCenter.disconnect();
    notificationCenter.setOwner(nextId);
    renderedAccountId = nextId;
    live.reset();
    comparison.key = '';
    setUI({ compared: [], draft: null, profileOrigin: null, discardDestination: null, modals: [], pushEnabled: false });
    if (!account) window.dispatchEvent(new Event('hsu-signout'));
  });
  notificationCenter.setOwner(getAccountUser()?.id);
  if (!browsing) void restoreAccount();
  else if (isAuthHash(location.hash)) welcomeOrLogin();
  else browse();
}

export { profileFromApi };
