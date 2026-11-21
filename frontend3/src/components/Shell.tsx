import { useEffect, useRef, type MouseEvent } from 'react';
import { Icon } from '../lib/icons';
import { CAMPUS_TOWN_URL } from '../lib/campusTown';
import { getAccountUser } from '../lib/session';
import type { Profile } from '../lib/live';
import { useUI, setUI, getUI, type View } from '../app/store';
import { accountLogout, closeModals, navigate, openLogin, openModal, profileChanged, startProfile, comparison as cmp } from '../app/actions';
import { notificationCenter, refreshNotifications } from '../app/notifications';

const NAVS: [View, string, string][] = [
  ['recommend', 'spark', '맞춤 추천'], ['notices', 'book', '공지사항'], ['programs', 'pencil', '비교과프로그램'], ['saved', 'bookmark', 'MY PICK'], ['profile', 'user', 'MY PAGE'],
];
const PAGE_NAMES: Record<View, string> = { recommend: '맞춤 추천', notices: '공지사항', programs: '비교과프로그램', saved: 'MY PICK', profile: 'MY PAGE', notifications: '알림' };

function go(view: View) {
  return (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (getUI().modals.some((m) => m.kind === 'profile-1' || m.kind === 'profile-2') && profileChanged()) {
      setUI({ discardDestination: view });
      openModal({ kind: 'profile-discard' });
      return;
    }
    closeModals();
    navigate(view);
  };
}

function NavLinks() {
  const { view } = useUI();
  return <>{NAVS.map(([id, icon, name]) => (
    <a key={id} className={`nav-item ${view === id ? 'active' : ''}`} href={`#${id}`} aria-current={view === id ? 'page' : undefined} onClick={go(id)}>
      <Icon name={icon} /><span>{name}</span>
    </a>
  ))}</>;
}

function CampusTownCard() {
  return (
    <div className="sidebar-note campus-town-note">
      <span className="note-icon" aria-hidden="true">✦</span>
      <span className="campus-town-eyebrow">CAMPUS TOWN</span>
      <p>나만의 캠퍼스타운 만들기</p>
      {CAMPUS_TOWN_URL
        ? <a className="campus-town-btn" href={CAMPUS_TOWN_URL} target="_blank" rel="noopener noreferrer" aria-label="캠퍼스타운 체험하기 (새 탭에서 열림)">체험하기 <span aria-hidden="true">↗</span></a>
        : <button type="button" className="campus-town-btn" disabled>오픈 예정</button>}
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="sidebar">
      <a href="#recommend" className="brand" aria-label="HSU PICK 추천 홈" onClick={go('recommend')}><img className="brand-logo" src="assets/hsu-pick-logo.png" width={86} height={47} alt="HSU PICK" /></a>
      <nav className="desktop-nav" aria-label="주 메뉴"><NavLinks /></nav>
      <CampusTownCard />
      <div className="sidebar-bottom">HSU PICK</div>
    </aside>
  );
}
export function MobileNav() { return <nav className="mobile-nav" aria-label="모바일 주 메뉴"><NavLinks /></nav>; }

export function Topbar({ profile }: { profile: Profile | null }) {
  const s = useUI();
  const account = getAccountUser();
  const displayName = account?.name || profile?.name;
  const unread = notificationCenter.state.entries.filter((n) => !n.read).length;
  const wrapRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!s.miniMenuOpen) return;
    const outside = (e: globalThis.MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setUI({ miniMenuOpen: false }); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setUI({ miniMenuOpen: false }); avatarRef.current?.focus(); } };
    document.addEventListener('click', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', outside); document.removeEventListener('keydown', esc); };
  }, [s.miniMenuOpen]);
  return (
    <header className="topbar">
      <a className="mobile-brand" href="#recommend" aria-label="HSU PICK 추천 홈" onClick={go('recommend')}><img className="brand-logo" src="assets/hsu-pick-logo.png" width={64} height={35} alt="HSU PICK" /></a>
      <div className="page-label">나의 캠퍼스 <span>/</span> <strong id="page-name">{PAGE_NAMES[s.view]}</strong></div>
      <button type="button" id="notification-button" className="notification-button" data-action="notifications" aria-label={unread ? `알림함 · 읽지 않은 알림 ${unread}개` : '알림함'}
        aria-current={s.view === 'notifications' ? 'page' : 'false'} onClick={() => { closeModals(); navigate('notifications'); refreshNotifications(); }}>
        <Icon name="bell" />{unread ? <span className="notification-dot" aria-hidden="true" /> : null}
      </button>
      <div className="mini-my-wrap" ref={wrapRef}>
        <button ref={avatarRef} className="avatar" data-action="mini-my" aria-label="MY 메뉴 열기" aria-haspopup="true" aria-expanded={s.miniMenuOpen}
          onClick={() => setUI({ miniMenuOpen: !s.miniMenuOpen })}>{displayName ? displayName.trim().slice(-2) : 'MY'}</button>
        <div id="mini-my-menu" className="mini-my-menu" hidden={!s.miniMenuOpen}>
          <button data-action="profile" onClick={() => { setUI({ miniMenuOpen: false }); startProfile(); }}>정보 수정</button>
          {account
            ? <button className="mini-my-auth is-logout" data-action="account-logout" onClick={() => { setUI({ miniMenuOpen: false }); void accountLogout(); }}><Icon name="external" /><span>로그아웃</span></button>
            : <button className="mini-my-auth is-login" data-login-action="open" onClick={() => { setUI({ miniMenuOpen: false }); openLogin(); }}><Icon name="lock" /><span>로그인</span></button>}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer"><b>HSU PICK</b>
      <button className="footer-help" data-action="about" aria-haspopup="dialog" onClick={() => openModal({ kind: 'about' })}><Icon name="info" /><span>한성픽 사용안내</span></button>
    </footer>
  );
}

export function CompareTray() {
  const { compared } = useUI();
  useEffect(() => { document.body.classList.toggle('has-tray', compared.length > 0); }, [compared.length]);
  return (
    <div id="compare-tray">
      {compared.length ? (
        <div className="compare-bar">
          <span><Icon name="compare" /></span>
          <div><b>비교할 PICK {compared.length} / 3</b><small>{compared.length < 2 ? '하나 더 골라 나란히 비교해요' : '대상·기간·혜택·준비사항 한눈에'}</small></div>
          <button className="clear-btn" data-action="clear-compare" onClick={() => { cmp.key = ''; setUI({ compared: [] }); }}>선택 해제</button>
          <button className="primary" data-action="compare" disabled={compared.length < 2} onClick={() => openModal({ kind: 'compare' })}>AI 비교하기 <Icon name="arrow" /></button>
        </div>
      ) : null}
    </div>
  );
}

export function ConnectionStatus() {
  const { online, modals } = useUI();
  return <div id="connection-status" role="status" aria-live="polite" hidden={online || modals.length > 0}>{online ? '' : '오프라인 상태예요. 학교 사이트 이동은 연결 후 다시 시도해 주세요.'}</div>;
}
export function Toast() {
  const { toastText, toastVisible } = useUI();
  return <div id="toast" role="status" aria-live="polite" className={toastVisible ? 'visible' : ''}>{toastText}</div>;
}
