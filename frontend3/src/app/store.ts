// Global UI state. One small external store; components read it with useUI().
import { useSyncExternalStore } from 'react';
import type { ContentType, Grade } from '../lib/live';

export type View = 'recommend' | 'notices' | 'programs' | 'saved' | 'profile' | 'notifications';
export type Sort = 'recommended' | 'deadline' | 'latest';
export type ModalDesc =
  | { kind: 'detail'; id: string }
  | { kind: 'source'; id: string }
  | { kind: 'compare' }
  | { kind: 'quick'; which: 'open' | 'urgent' }
  | { kind: 'profile-1' }
  | { kind: 'profile-2' }
  | { kind: 'track-picker' }
  | { kind: 'profile-discard' }
  | { kind: 'reset-profile' }
  | { kind: 'account'; action: 'password' | 'delete' | 'social' }
  | { kind: 'image'; id: string; index: number }
  | { kind: 'about' }
  | { kind: 'onboarding'; step: number; beforeLogin: boolean };

export interface Draft { name: string; grade: Grade | null; tracks: string[]; interests: string[] }
export interface TrackPicker { slot: number; college: string; group: string; search: string; menu: 'college' | 'group' | null; browsing: boolean }
export type AuthScreen = 'hidden' | 'login' | 'signup' | 'pending' | 'retry' | 'welcome';

export interface UIState {
  view: View; category: string; query: string; sort: Sort; openOnly: boolean;
  savedTab: ContentType; recommendTab: ContentType; searchExpanded: boolean; heroIndex: number; page: number;
  compared: string[];
  modals: ModalDesc[];
  modalEnter: boolean;
  toastText: string; toastVisible: boolean;
  miniMenuOpen: boolean;
  draft: Draft | null; profileBaseline: string; profileOrigin: View | null; trackPicker: TrackPicker | null; trackFocus: number | null;
  discardDestination: View | null; formError: string; profileBusy: boolean;
  auth: AuthScreen; authMessage: string; authBusy: boolean;
  notificationBusy: boolean; pushEnabled: boolean; notificationVersion: number;
  online: boolean;
}

const initial: UIState = {
  view: 'recommend', category: 'all', query: '', sort: 'recommended', openOnly: true,
  savedTab: 'notice', recommendTab: 'notice', searchExpanded: false, heroIndex: 0, page: 1,
  compared: [], modals: [], modalEnter: false, toastText: '', toastVisible: false, miniMenuOpen: false,
  draft: null, profileBaseline: '', profileOrigin: null, trackPicker: null, trackFocus: null,
  discardDestination: null, formError: '', profileBusy: false,
  auth: 'pending', authMessage: '', authBusy: false,
  notificationBusy: false, pushEnabled: false, notificationVersion: 0,
  online: globalThis.navigator?.onLine !== false,
};

let state = initial;
const listeners = new Set<() => void>();
export const getUI = () => state;
export function setUI(patch: Partial<UIState> | ((s: UIState) => Partial<UIState>)) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useUI = () => useSyncExternalStore(subscribe, getUI);

export const topModal = (s: UIState = state): ModalDesc | null => s.modals[s.modals.length - 1] || null;
export const modalKey = (m: ModalDesc | null): string => {
  if (!m) return '';
  switch (m.kind) {
    case 'detail': case 'source': return `${m.kind}-${m.id}`;
    case 'quick': return `quick-list-${m.which}`;
    case 'account': return `account-${m.action}`;
    case 'image': return `image-${m.id}-${m.index}`;
    default: return m.kind;
  }
};
