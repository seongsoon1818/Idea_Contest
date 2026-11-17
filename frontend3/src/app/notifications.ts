// Notification glue (behaviour unchanged from frontend2; the server contract is still open).
import { createNotificationCenter, type NotificationAdapter } from '../lib/notifications';
import { getUI, setUI } from './store';
import { getAccountUser } from '../lib/session';

let toastFn: (text: string) => void = () => {};
export const bindNotificationToast = (fn: (text: string) => void) => { toastFn = fn; };

export const notificationCenter = createNotificationCenter({
  // Connected mode has no local item list, so local evaluation adds nothing (same as frontend2).
  context: () => ({ items: [], saved: new Set<string>(), eligible: () => false }),
  onChange: () => setUI((s) => ({ notificationVersion: s.notificationVersion + 1 })),
  onError: (message) => toastFn(message),
});

export function refreshNotifications() {
  if (getUI().auth !== 'hidden') return;
  notificationCenter.evaluate();
  if (notificationCenter.adapter) notificationCenter.refresh().catch(() => {});
}
export async function updateNotificationSetting(key: 'deadline' | 'recommendation', checked: boolean) {
  setUI({ notificationBusy: true });
  try { await notificationCenter.settings({ [key]: checked }); }
  catch { toastFn('알림 설정을 저장하지 못했어요. 다시 시도해 주세요.'); }
  finally { setUI({ notificationBusy: false }); }
}
export async function markNotificationsRead(ids: string[]) {
  setUI({ notificationBusy: true });
  try { await notificationCenter.markRead(ids); }
  catch { toastFn('알림을 불러오지 못했어요. 다시 시도해 주세요.'); }
  finally { setUI({ notificationBusy: false }); }
}
export async function enablePush() {
  if (getUI().notificationBusy) return;
  const adapter = notificationCenter.adapter;
  if (!getAccountUser()) { toastFn('로그인 후 푸시 알림을 켤 수 있어요.'); return; }
  if (!adapter || !adapter.subscribePush || !adapter.unsubscribePush || !adapter.vapidPublicKey) { toastFn('푸시 알림 서버 연결을 준비하고 있어요.'); return; }
  if (!globalThis.Notification || !globalThis.navigator?.serviceWorker || !(globalThis as any).PushManager) { toastFn('이 브라우저에서는 웹 푸시를 사용할 수 없어요. 알림함을 이용해 주세요.'); return; }
  const owner = getAccountUser()!.id;
  setUI({ notificationBusy: true });
  try {
    const registration = await navigator.serviceWorker.register('./notification-sw.js');
    await navigator.serviceWorker.ready;
    if (getAccountUser()?.id !== owner || notificationCenter.adapter !== adapter) return;
    let subscription = await registration.pushManager.getSubscription();
    if (getUI().pushEnabled) {
      if (subscription) { await adapter.unsubscribePush(subscription.toJSON()); await subscription.unsubscribe(); }
      setUI({ pushEnabled: false });
    } else {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { toastFn('알림함에서는 계속 소식을 확인할 수 있어요.'); return; }
      if (getAccountUser()?.id !== owner || notificationCenter.adapter !== adapter) return;
      const base64 = adapter.vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (c) => c.charCodeAt(0));
      let created = false;
      if (!subscription) { subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }); created = true; }
      try { await adapter.subscribePush(subscription.toJSON()); }
      catch (e) { if (created) await subscription.unsubscribe(); throw e; }
      if (getAccountUser()?.id !== owner || notificationCenter.adapter !== adapter) {
        await adapter.unsubscribePush(subscription.toJSON()); await subscription.unsubscribe(); return;
      }
      setUI({ pushEnabled: true });
    }
    toastFn(getUI().pushEnabled ? '이 브라우저의 푸시 알림을 켰어요.' : '이 브라우저의 푸시 알림을 껐어요.');
  } catch { toastFn('푸시 알림을 연결하지 못했어요. 다시 시도해 주세요.'); }
  finally { setUI({ notificationBusy: false }); }
}
/** Hook for the server adapter, same entry point as frontend2 (window.HSUPickNotifications). */
function configureNotifications(adapter: NotificationAdapter) {
  const owner = getAccountUser()?.id;
  return notificationCenter.connect(adapter).then(async () => {
    if (getAccountUser()?.id !== owner || notificationCenter.adapter !== adapter) return;
    const pushedId = new URLSearchParams(location.search || '').get('notification');
    if (pushedId) {
      await notificationCenter.markRead([pushedId]);
      const url = new URL(location.href);
      url.searchParams.delete('notification');
      history.replaceState(history.state, '', url.href);
    }
    if (globalThis.navigator?.serviceWorker) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      const linked = sub && typeof adapter.isPushSubscribed === 'function' ? await adapter.isPushSubscribed(sub.toJSON()) : false;
      if (getAccountUser()?.id !== owner || notificationCenter.adapter !== adapter) return;
      setUI({ pushEnabled: !!linked && globalThis.Notification?.permission === 'granted' });
    }
  });
}
(window as any).HSUPickNotifications = { connect: configureNotifications, refresh: refreshNotifications };
window.addEventListener('focus', refreshNotifications);
window.addEventListener('storage', (e) => { if (e.key === notificationCenter.key) notificationCenter.reload(); });
globalThis.navigator?.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'hsu-notification-refresh') refreshNotifications(); });
