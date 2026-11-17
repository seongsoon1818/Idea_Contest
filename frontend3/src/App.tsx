import { useEffect, useRef, useState } from 'react';
import { live } from './lib/live';
import { useUI } from './app/store';
import { startApp } from './app/actions';
import { useLive } from './components/hooks';
import { LoginScreen, useLoginGate } from './components/Login';
import { CompareTray, ConnectionStatus, Footer, MobileNav, Sidebar, Toast, Topbar } from './components/Shell';
import { BrowsePage, RecommendPage, SavedPage, useMainClasses } from './pages/Home';
import { NotificationPage, ProfilePage } from './pages/Profile';
import { ModalHost } from './modals/ModalHost';

export function App() {
  useLive();
  const s = useUI();
  const profile = live.profile();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [surfaces, setSurfaces] = useState<HTMLElement[]>([]);
  const [main, setMain] = useState<HTMLElement | null>(null);
  useLoginGate(surfaces, dialogRef.current);
  useMainClasses(main);
  useEffect(() => {
    setSurfaces(['.sidebar', '.workspace', '.mobile-nav', '#compare-tray'].map((sel) => document.querySelector<HTMLElement>(sel)!).filter(Boolean));
    startApp();
  }, []);

  const page = s.view === 'recommend' ? <RecommendPage profile={profile} />
    : s.view === 'notices' ? <BrowsePage key="notices" profile={profile} kind="notice" />
      : s.view === 'programs' ? <BrowsePage key="programs" profile={profile} kind="program" />
        : s.view === 'saved' ? <SavedPage profile={profile} />
          : s.view === 'profile' ? <ProfilePage profile={profile} />
            : <NotificationPage />;
  return (
    <>
      <LoginScreen />
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>
      <Sidebar />
      <div className="workspace">
        <Topbar profile={profile} />
        <main id="main" tabIndex={-1} ref={setMain}>{s.auth === 'hidden' || s.auth === 'welcome' ? page : null}</main>
        <Footer />
      </div>
      <MobileNav />
      <CompareTray />
      <ModalHost profile={profile} dialogRef={dialogRef} />
      <ConnectionStatus />
      <Toast />
    </>
  );
}
