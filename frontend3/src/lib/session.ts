// Signed-in account state (same rules as frontend2/dist/account-session.js).
// Set only after the server confirms a session; it grants no server permissions.
export interface AccountUser { id: string; name: string }
type Session = { user: { id: string; name?: string }; logout?: () => Promise<void> } | null;

let user: AccountUser | null = null;
let logoutHandler: (() => Promise<void>) | null = null;
let pendingLogout: { epoch: number; promise: Promise<void> } | null = null;
let sessionEpoch = 0;
const listeners = new Set<(user: AccountUser | null) => void>();

export const getAccountUser = (): AccountUser | null => (user ? { ...user } : null);
export function setAccountSession(session: Session = null) {
  if (session?.user) {
    if (!session.user.id) throw new TypeError('A server user ID is required.');
    user = { id: String(session.user.id), name: typeof session.user.name === 'string' ? session.user.name : '' };
    logoutHandler = typeof session.logout === 'function' ? session.logout : null;
  } else { user = null; logoutHandler = null; }
  sessionEpoch++;
  listeners.forEach((listener) => listener(getAccountUser()));
}
export function subscribeAccountSession(listener: (user: AccountUser | null) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function logoutAccount(): Promise<void> {
  if (pendingLogout?.epoch === sessionEpoch) return pendingLogout.promise;
  if (!user || !logoutHandler) return Promise.reject(new Error('계정 서버 연결 후 로그아웃할 수 있어요.'));
  const activeId = user.id, activeEpoch = sessionEpoch, handler = logoutHandler;
  const request = Promise.resolve().then(handler).then(() => {
    if (user?.id !== activeId || sessionEpoch !== activeEpoch) throw new Error('계정이 변경되었어요. 다시 확인해 주세요.');
    setAccountSession(null);
  }).finally(() => { if (pendingLogout?.promise === request) pendingLogout = null; });
  pendingLogout = { epoch: activeEpoch, promise: request };
  return request;
}
