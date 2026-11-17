import { live, listPath, type Item, type Profile } from '../lib/live';
import { getAccountUser } from '../lib/session';
import { Icon } from '../lib/icons';
import { useUI, setUI } from '../app/store';
import { navigate, retryLive, startProfile, setFilters } from '../app/actions';
import { Card, Empty, Loading } from './Card';
import { listTypeOf, isRecommendedTab } from './Filters';
import { useDebounced } from './hooks';

function Pager({ page, totalPages, hasNext }: { page: number; totalPages: number; hasNext: boolean }) {
  if (totalPages < 2) return null;
  const last = Math.min(totalPages, Math.max(5, page + 2)), first = Math.max(1, last - 4), pages: number[] = [];
  for (let n = first; n <= last; n++) pages.push(n);
  const go = (n: number) => { setUI({ page: n }); document.querySelector('#results')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  return (
    <nav className="pagination" aria-label="페이지 이동">
      <button type="button" className="pagination-arrow pagination-previous" data-action="live-page" data-id={page - 1} disabled={page <= 1} aria-label="이전 페이지" onClick={() => go(page - 1)}><Icon name="chevron" /></button>
      {pages.map((n) => (
        <button key={n} type="button" className={`pagination-page ${n === page ? 'active' : ''}`} data-action="live-page" data-id={n} aria-current={n === page ? 'page' : undefined} onClick={() => go(n)}>{n}</button>
      ))}
      <button type="button" className="pagination-arrow" data-action="live-page" data-id={page + 1} disabled={!hasNext} aria-label="다음 페이지" onClick={() => go(page + 1)}><Icon name="chevron" /></button>
    </nav>
  );
}

export function Results({ profile }: { profile: Profile | null }) {
  const s = useUI();
  const query = useDebounced(s.query, 180);
  const view = s.view, type = listTypeOf(s), recommendations = view === 'recommend' || isRecommendedTab(s), signedIn = !!getAccountUser();
  const profileRequired = (
    <Empty title="내 정보를 입력해 주세요" text={<>학년·트랙·관심 분야를 입력하면<br />나에게 맞는 공지와 프로그램을 추천해 드려요.</>}
      action="profile" label={<><Icon name="user" /><span>내 정보 입력하기</span></>} icon="spark" onAction={startProfile} />
  );
  if (recommendations && !signedIn) {
    return <Empty login icon="spark" title="로그인하고 맞춤 추천을 받아보세요" text={<>학년·트랙·관심 분야를 입력하면<br />나에게 맞는 공지와 프로그램을 추천해 드려요.</>} />;
  }
  if (view === 'saved' && !signedIn) {
    return <Empty login icon="bookmark" title="로그인하고 MY PICK을 모아보세요" text={<>관심 있는 공지의 북마크를 눌러<br className="mobile-copy" /> 나만의 기회를 모아보세요.</>} />;
  }
  if (recommendations && !profile) {
    const entry = live.peek('/users/me/profile');
    return !entry || entry.pending ? <Loading /> : profileRequired;
  }
  const entry = live.read(listPath(view, type, { page: s.page, query, category: s.category, sort: s.sort, openOnly: s.openOnly }));
  if (entry.pending) return <Loading />;
  if (entry.error) {
    if (entry.error.code === 'PROFILE_REQUIRED') return profileRequired;
    return <Empty title="정보를 불러오지 못했어요" text={entry.error.message} action="live-retry" label={<span>다시 시도</span>} icon="info" onAction={retryLive} />;
  }
  const { items: rows, pagination } = entry.data;
  if (s.page > 1 && s.page > Math.max(1, pagination.totalPages)) { queueMicrotask(() => setUI({ page: Math.max(1, pagination.totalPages) })); return <Loading />; }
  const list: Item[] = rows.map((row: any) => (view === 'saved' ? row.content : row)).filter(Boolean).map((card: any) => live.remember(card));
  live.loadTargets(list);

  let hidden = 0, noSavedTypeFlag = false;
  if (view === 'saved') {
    const typeTotal = live.read(listPath('saved', type, { page: 1, size: 1, sort: s.sort })).data?.pagination?.totalItems;
    noSavedTypeFlag = typeTotal === 0;
    if (s.openOnly) {
      const all = live.read(listPath('saved', type, { page: 1, size: 1, query, category: s.category, sort: s.sort })).data?.pagination?.totalItems;
      if (typeof all === 'number') hidden = Math.max(0, all - pagination.totalItems);
    }
  }

  const name = type === 'notice' ? '공지사항' : '비교과 프로그램';
  const noSavedType = view === 'saved' && noSavedTypeFlag;
  const noSavedRecommendations = view === 'saved' && isRecommendedTab(s) && !s.query;
  const emptyTitle = noSavedRecommendations ? `저장한 추천 ${name}이 없어요` : noSavedType ? `저장한 ${name}이 없어요` : '조건에 맞는 소식을 찾지 못했어요';
  const emptyText = noSavedRecommendations ? <>추천해준 {s.savedTab === 'notice' ? '공지' : '프로그램'}의 북마크를 눌러<br />나만의 기회를 모아보세요.</>
    : noSavedType ? <>관심 있는 공지의 북마크를 눌러<br className="mobile-copy" /> 나만의 기회를 모아보세요.</> : '다른 분야를 선택하거나 검색어·필터를 바꿔보세요.';
  const emptyAction = noSavedRecommendations ? 'go-recommend' : noSavedType ? (s.savedTab === 'notice' ? 'go-notices' : 'go-programs') : undefined;
  const emptyLabel = noSavedRecommendations ? <><Icon name="spark" /><span>맞춤 추천 살펴보기</span></>
    : noSavedType ? <><Icon name={s.savedTab === 'notice' ? 'book' : 'pencil'} /><span>{name} 살펴보기</span></> : undefined;
  const emptyGo = () => navigate(noSavedRecommendations ? 'recommend' : s.savedTab === 'notice' ? 'notices' : 'programs');
  const showUnavailable = () => setFilters({ openOnly: false });

  const summary = <div className="result-line" role="status"><span>총 <strong>{pagination.totalItems}</strong>개의 {view === 'saved' ? 'MY PICK' : '기회'}</span></div>;
  const availability = hidden ? (
    <div className="saved-availability" role="status"><span>모집 마감·예정 PICK {hidden}개가 숨겨져 있어요.</span><button type="button" data-action="show-unavailable" onClick={showUnavailable}>함께 보기</button></div>
  ) : null;
  if (hidden && !list.length) {
    return <>{summary}{availability}<Empty title="저장한 PICK이 있어요" text="모집이 마감되었거나 아직 시작하지 않아 숨겨져 있어요." action="show-unavailable" label="마감·예정 PICK 보기" icon="bookmark" onAction={showUnavailable} /></>;
  }
  return (
    <>
      {summary}{availability}
      <div className="cards listing-cards">
        {list.length ? list.map((item) => <Card key={item.id} item={item} profile={profile} />)
          : <Empty title={emptyTitle} text={emptyText} action={emptyAction} label={emptyLabel} icon={view === 'saved' ? 'bookmark' : 'search'} onAction={emptyGo} />}
      </div>
      <Pager page={pagination.page} totalPages={pagination.totalPages} hasNext={pagination.hasNext} />
    </>
  );
}
