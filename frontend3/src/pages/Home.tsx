import { useCallback, useEffect, useRef, type MouseEvent } from 'react';
import { Icon, Lines } from '../lib/icons';
import { live, type Profile } from '../lib/live';
import { getAccountUser } from '../lib/session';
import { useUI, setUI } from '../app/store';
import { navigate, openLogin, openModal, startProfile } from '../app/actions';
import { gradeLabel } from '../components/format';
import { useMobile, useStepGestures } from '../components/hooks';
import { Filters, TypeTabs } from '../components/Filters';
import { Results } from '../components/Results';

const gradeMessages: Record<string, string> = {
  1: '1학년의 출발,\n한성 PICK과 함께해요!', 2: '기대되는 2학년,\n한성 PICK과 함께해요!', 3: '고민 많은 3학년,\n한성 PICK이 도와줄게요!',
  4: '고민 많은 4학년,\n한성 PICK과 함께해요!', other: '고민 많은 4학년,\n한성 PICK과 함께해요!',
};
/** In-app links (#notices, #programs, #saved) switch screens without a page jump. */
export const viewLink = (view: 'notices' | 'programs' | 'saved') => (e: MouseEvent) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(view);
};

function Hero({ profile }: { profile: Profile | null }) {
  const { heroIndex } = useUI();
  const stageRef = useRef<HTMLDivElement>(null);
  const setSlide = useCallback((index: number) => setUI({ heroIndex: (index + 3) % 3 }), []);
  const step = useCallback((direction: number) => setUI((s) => ({ heroIndex: (s.heroIndex + direction + 3) % 3 })), []);
  useStepGestures(stageRef, step);
  const firstAction = profile ? (
    <div className="profile-strip">
      <span className="profile-tag">{gradeLabel(profile.grade)}</span>
      {profile.tracks.filter(Boolean).map((t) => <span key={t} className="profile-tag">{t}</span>)}
      <button data-action="profile" onClick={startProfile}>정보 수정</button>
    </div>
  ) : !getAccountUser()
    ? <button className="primary" data-login-action="open" onClick={openLogin}>로그인하고 내 정보 입력하기 <Icon name="arrow" /></button>
    : <button className="primary" data-action="profile" onClick={startProfile}>내 정보 입력하기 <Icon name="arrow" /></button>;
  const slides = [
    { label: '맞춤 추천', title: profile ? gradeMessages[String(profile.grade)] : '놓치기 쉬운 기회,\n이번엔 PICK하세요.', action: firstAction, ticket: 'PICK!', small: 'A LITTLE PICK, A BIG POSSIBILITY.' },
    {
      label: '학교 소식 탐색', title: '필요한 학교 소식,\n조건부터 한눈에.', ticket: 'FIND!', small: '공지와 비교과, 필요한 소식부터.',
      action: <><a className="primary" href="#notices" onClick={viewLink('notices')}>공지사항 보기 <Icon name="arrow" /></a><a className="primary hero-program-primary" href="#programs" onClick={viewLink('programs')}>비교과프로그램 보기 <Icon name="arrow" /></a></>,
    },
    { label: 'MY PICK 저장', title: '마음에 든 기회,\nMY PICK에 모아두세요.', ticket: 'MY\nPICK', small: '나의 관심을 한곳에 모아두기.', action: <a className="primary" href="#saved" onClick={viewLink('saved')}>MY PICK 보기 <Icon name="arrow" /></a> },
  ];
  const keys = (e: React.KeyboardEvent) => {
    const target = e.target as Element;
    if (target !== stageRef.current && !target.closest('.hero-pagination')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setSlide(heroIndex + (e.key === 'ArrowLeft' ? -1 : 1)); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); setSlide(e.key === 'Home' ? 0 : 2); }
  };
  return (
    <section className="hero-carousel" role="region" aria-roledescription="캐러셀" aria-label="HSU PICK 서비스 안내" onKeyDown={keys}>
      <div className="hero-stage" ref={stageRef} tabIndex={0} aria-label="서비스 안내 배너, 좌우 방향키로 넘기기">
        {slides.map((slide, index) => {
          const Heading = index === 0 ? 'h1' : 'h2';
          const hidden = index !== heroIndex;
          return (
            <div key={index} className={`hero hero-slide hero-slide-${index}`} data-hero-slide={index} role="group" aria-roledescription="슬라이드"
              aria-label={`${index + 1} / ${slides.length} · ${slide.label}`} aria-hidden={hidden} hidden={hidden} {...(hidden ? { inert: '' } : {})}>
              <div className="hero-copy"><Heading><Lines text={slide.title} /></Heading><div className="hero-actions">{slide.action}</div></div>
              <div className="hero-art" aria-hidden="true">
                <div className="orbit" />
                <div className="pick-ticket">
                  <div className="ticket-head"><span>MY CAMPUS</span>✦</div>
                  <div className="ticket-big"><Lines text={slide.ticket} /></div>
                  <div className="ticket-dash" />
                  <div className="ticket-small">{slide.small}</div>
                </div>
                <span className="floating-star">✦</span><span className="ticket-dot" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="hero-pagination">
        <button className="hero-arrow hero-previous" data-action="hero-previous" aria-label="이전 배너" onClick={() => setSlide(heroIndex - 1)}><Icon name="chevron" /></button>
        <div className="hero-dots" aria-label="배너 선택">
          {slides.map((slide, index) => (
            <button key={index} className={`hero-dot ${index === heroIndex ? 'active' : ''}`} data-action="hero-select" data-id={index}
              aria-label={`${index + 1}번째 배너 · ${slide.label}`} aria-pressed={index === heroIndex} onClick={() => setSlide(index)} />
          ))}
        </div>
        <button className="hero-arrow" data-action="hero-next" aria-label="다음 배너" onClick={() => setSlide(heroIndex + 1)}><Icon name="chevron" /></button>
      </div>
    </section>
  );
}

function Stats({ profile }: { profile: Profile | null }) {
  const stats = live.read('/home').data?.stats;
  const count = (value: number | null | undefined) => (stats ? value ?? 0 : '-');
  const tiles = [
    { icon: 'spark', label: profile ? '맞춤 PICK!' : '모집중인 기회', value: count(stats?.pickCount), action: 'quick-open', run: () => openModal({ kind: 'quick', which: 'open' }) },
    { icon: 'clock', label: '마감 PICK!', value: count(stats?.urgentCount), action: 'quick-urgent', urgent: true, run: () => openModal({ kind: 'quick', which: 'urgent' }) },
    { icon: 'bookmark', label: 'MY PICK!', value: count(stats?.bookmarkCount), action: 'go-saved', run: () => navigate('saved') },
  ];
  return (
    <div className="quick-stats">
      {tiles.map((tile) => (
        <button key={tile.action} type="button" className={`stat ${tile.urgent ? 'stat-urgent' : ''}`} data-action={tile.action} aria-label={`${tile.label} ${tile.value}개 보기`}
          aria-haspopup={tile.action !== 'go-saved' ? 'dialog' : undefined} onClick={tile.run}>
          <span className="stat-content">
            <span className="stat-caption"><span className="stat-icon"><Icon name={tile.icon} /></span><span className="stat-label">{tile.label}</span></span>
            <span className="stat-value"><b className="stat-number">{tile.value}</b><span className="stat-unit">개</span></span>
          </span>
          <span className="stat-arrow"><Icon name="arrow" /></span>
        </button>
      ))}
    </div>
  );
}

const AiCompareInfo = () => (
  <div className="info-row ai-compare-info"><Icon name="spark" /><div><b>AI 비교하기</b><p>카드에 있는 'AI 비교하기'로 최대 3개의 정보를 비교할 수 있어요!</p></div></div>
);

export function RecommendPage({ profile }: { profile: Profile | null }) {
  return (
    <>
      <Hero profile={profile} />
      <Stats profile={profile} />
      <section className="opportunity-content" aria-label="맞춤 추천 목록">
        <div className="recommend-filter-panel" role="group" aria-label="맞춤추천 분류와 결과">
          <TypeTabs /><Filters profile={profile} /><div id="results"><Results profile={profile} /></div>
        </div>
      </section>
      <AiCompareInfo />
    </>
  );
}

export function PageTitle({ label, icon }: { label: string; icon: string }) {
  return <h1 className="page-title"><Icon name={icon} /><span>{label}</span></h1>;
}

export function BrowsePage({ profile, kind }: { profile: Profile | null; kind: 'notice' | 'program' }) {
  const config = kind === 'notice'
    ? { title: '공지사항', heading: '공지사항', description: '장학·취업·현장실습 등 공지사항 소식을 찾아보세요.' }
    : { title: '비교과 프로그램', heading: '비교과 프로그램', description: '관심 분야별 비교과프로그램을 찾아보세요.' };
  return (
    <>
      <div className="section-head"><div><PageTitle label={config.heading} icon={kind === 'program' ? 'pencil' : 'book'} /><p>{config.description}</p></div></div>
      <section className="opportunity-content" aria-label={config.title}>
        <div className="browse-filter-panel" role="group" aria-label={`${config.title} 검색과 필터`}><Filters profile={profile} /></div>
        <div id="results"><Results profile={profile} /></div>
      </section>
      <AiCompareInfo />
    </>
  );
}

export function SavedPage({ profile }: { profile: Profile | null }) {
  return (
    <>
      <div className="section-head"><div><PageTitle label="MY PICK" icon="bookmark" /></div></div>
      <div className="recommend-filter-panel saved-filter-panel" role="group" aria-label="저장한 PICK 분류와 결과">
        <TypeTabs /><Filters profile={profile} /><div id="results"><Results profile={profile} /></div>
      </div>
    </>
  );
}

/** Keeps the main region's page classes in sync (recommend-home, saved-page, …). */
export function useMainClasses(main: HTMLElement | null) {
  const s = useUI(), mobile = useMobile();
  useEffect(() => {
    if (!main) return;
    main.classList.toggle('recommend-home', s.view === 'recommend');
    main.classList.toggle('saved-page', s.view === 'saved');
    main.classList.toggle('browse-page', s.view === 'notices' || s.view === 'programs');
    main.classList.toggle('saved-recommended', s.view === 'saved' && s.category === 'recommended');
  }, [main, s.view, s.category, mobile]);
}
