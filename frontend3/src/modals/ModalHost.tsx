// The single <dialog id="modal">: shows the top dialog of the stack.
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Profile } from '../lib/live';
import { useUI, setUI, modalKey, type ModalDesc } from '../app/store';
import { back, returnFromTrackPicker } from '../app/actions';
import { CompareModal, DetailModal, ImageModal, QuickModal, SourceModal } from './ContentModals';
import { ProfileDiscardModal, ProfileStep1, ProfileStep2, ResetProfileModal, TrackPickerModal } from './ProfileModals';
import { AboutModal, AccountModal, OnboardingModal } from './OtherModals';

function Content({ modal, profile }: { modal: ModalDesc; profile: Profile | null }) {
  switch (modal.kind) {
    case 'detail': return <DetailModal id={modal.id} profile={profile} />;
    case 'source': return <SourceModal id={modal.id} profile={profile} />;
    case 'compare': return <CompareModal profile={profile} />;
    case 'quick': return <QuickModal which={modal.which} profile={profile} />;
    case 'profile-1': return <ProfileStep1 />;
    case 'profile-2': return <ProfileStep2 />;
    case 'track-picker': return <TrackPickerModal />;
    case 'profile-discard': return <ProfileDiscardModal />;
    case 'reset-profile': return <ResetProfileModal />;
    case 'account': return <AccountModal action={modal.action} />;
    case 'image': return <ImageModal id={modal.id} index={modal.index} />;
    case 'about': return <AboutModal />;
    case 'onboarding': return <OnboardingModal step={modal.step} beforeLogin={modal.beforeLogin} />;
  }
}

export function ModalHost({ profile, dialogRef }: { profile: Profile | null; dialogRef: React.RefObject<HTMLDialogElement> }) {
  const s = useUI();
  const modal = s.modals[s.modals.length - 1] || null;
  const key = modalKey(modal);
  const lastFocus = useRef<Element | null>(null);
  const wide = modal && (modal.kind === 'compare' || modal.kind === 'quick' || modal.kind === 'image');
  const className = [
    wide ? 'compare-dialog' : '', s.modalEnter ? 'modal-enter' : '',
    modal?.kind === 'onboarding' ? 'onboarding-dialog' : '', modal?.kind === 'onboarding' && modal.beforeLogin ? 'welcome-dialog' : '',
    modal?.kind === 'track-picker' ? 'track-picker-dialog' : '',
  ].filter(Boolean).join(' ');

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (modal && !dialog.open) { lastFocus.current = document.activeElement; dialog.showModal(); document.body.style.overflow = 'hidden'; }
    if (!modal && dialog.open) {
      dialog.close();
      document.body.style.overflow = '';
      const returnTo = lastFocus.current as HTMLElement | null;
      (returnTo?.isConnected ? returnTo : document.querySelector<HTMLElement>('#main'))?.focus();
    }
  }, [modal, dialogRef]);
  // Each new dialog starts at the top with focus on its first control.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !modal) return;
    dialog.scrollTop = 0;
    (dialog.querySelector<HTMLElement>('[data-autofocus]') || dialog.querySelector<HTMLElement>('.close-btn'))?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const onCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (modal?.kind === 'track-picker' && s.trackPicker?.menu) setUI({ trackPicker: { ...s.trackPicker, menu: null } });
    else if (modal?.kind === 'track-picker') returnFromTrackPicker();
    else back();
  };
  const onClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
      if (modal?.kind === 'track-picker') returnFromTrackPicker(); else back(true);
    }
  };
  return (
    <dialog id="modal" ref={dialogRef} className={className} aria-labelledby="modal-title" onCancel={onCancel} onClick={onClick}>
      <p className="connection-notice" hidden={s.online} role="status">{s.online ? '' : '오프라인 상태예요. 학교 사이트 이동은 연결 후 다시 시도해 주세요.'}</p>
      {modal ? <Content key={key} modal={modal} profile={profile} /> : null}
    </dialog>
  );
}
