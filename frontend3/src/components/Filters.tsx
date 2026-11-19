import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../lib/icons';
import { NOTICE_CATEGORIES, PROGRAM_CATEGORIES, type Category } from '../lib/data';
import type { ContentType, Profile } from '../lib/live';
import { useUI, setUI, type Sort } from '../app/store';
import { selectCategory, selectTab, setFilters } from '../app/actions';
import { useMobile } from './hooks';

export const listTypeOf = (s: ReturnType<typeof useUI>): ContentType =>
  s.view === 'saved' ? s.savedTab : s.view === 'recommend' ? s.recommendTab : s.view === 'programs' ? 'program' : 'notice';
export const isRecommendedTab = (s: ReturnType<typeof useUI>) =>
  ['notices', 'programs', 'saved', 'recommend'].includes(s.view) && s.category === 'recommended';

export function TypeTabs() {
  const s = useUI(), type = listTypeOf(s);
  const tabs: [ContentType, string, string][] = [['notice', 'book', '공지사항'], ['program', 'pencil', '비교과 프로그램']];
  return (
    <div className="saved-tabs type-tabs" aria-label={s.view === 'recommend' ? '추천 정보 유형' : '저장한 정보 유형'}>
      {tabs.map(([kind, glyph, name]) => (
        <button key={kind} className={`chip ${type === kind ? 'active' : ''}`} data-tab={kind} aria-pressed={type === kind} onClick={() => selectTab(kind)}>
          <Icon name={glyph} />
          <span>{s.view === 'recommend' ? (kind === 'notice' ? '공지 PICK!' : '비교과 PICK!') : name}</span>
        </button>
      ))}
    </div>
  );
}

/** Fill the first chip row proportionally; later rows keep that scale when they fit (port of fitCategoryRows). */
function fitCategoryRows(filters: HTMLElement | null) {
  if (!filters || filters.clientWidth <= 0) return;
  const rows = Array.from(filters.querySelectorAll<HTMLElement>('.category-row')).map((row) => {
    row.style.flexWrap = 'nowrap';
    const buttons = Array.from(row.querySelectorAll<HTMLElement>('.chip'));
    buttons.forEach((button) => (button.style.width = ''));
    const widths = buttons.map((button) => button.getBoundingClientRect().width);
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    return { row, buttons, widths, available: filters.clientWidth - gap * (buttons.length - 1) };
  });
  if (!rows.length || rows.some(({ widths }) => !widths.length || !widths.every((w) => w > 0))) return;
  const total = (widths: number[]) => widths.reduce((sum, w) => sum + w, 0);
  const firstScale = Math.max(1, (rows[0].available - 0.5) / total(rows[0].widths));
  rows.forEach(({ row, buttons, widths, available }) => {
    const natural = total(widths);
    if (natural > available) { row.style.flexWrap = 'wrap'; return; }
    const scale = Math.max(1, Math.min(firstScale, (available - 0.5) / natural));
    buttons.forEach((button, index) => (button.style.width = `${widths[index] * scale}px`));
  });
}

export function Filters({ profile }: { profile: Profile | null }) {
  const s = useUI(), mobile = useMobile(), type = listTypeOf(s);
  const home = s.view === 'recommend', recommended = isRecommendedTab(s);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const options: [Sort, string][] = [['recommended', profile ? '추천순' : '기본순'], ['deadline', '마감 임박순'], ['latest', '최근 등록순']];

  useLayoutEffect(() => { if (mobile) fitCategoryRows(filtersRef.current); });
  useEffect(() => {
    if (!mobile) return;
    const fit = () => fitCategoryRows(filtersRef.current);
    window.addEventListener('resize', fit);
    document.fonts?.ready.then(fit);
    return () => window.removeEventListener('resize', fit);
  }, [mobile]);
  useEffect(() => {
    if (!sortOpen) return;
    const close = (e: MouseEvent) => { if (!sortRef.current?.contains(e.target as Node)) setSortOpen(false); };
    document.addEventListener('click', close);
    sortRef.current?.querySelector<HTMLButtonElement>(`[data-id="${s.sort}"]`)?.focus();
    return () => document.removeEventListener('click', close);
  }, [sortOpen, s.sort]);

  const applySort = (value: Sort) => { setFilters({ sort: value }); setSortOpen(false); };
  const sortKeys = (e: React.KeyboardEvent) => {
    const trigger = sortRef.current?.querySelector<HTMLButtonElement>('.sort-trigger');
    if (e.key === 'Escape') { e.preventDefault(); setSortOpen(false); trigger?.focus(); return; }
    if (e.key === 'Tab') { setSortOpen(false); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      if (!sortOpen) { setSortOpen(true); return; }
      const items = [...(sortRef.current?.querySelectorAll<HTMLButtonElement>('.sort-option') || [])];
      let index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Home') index = 0; else if (e.key === 'End') index = items.length - 1;
      else index = (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[Math.max(0, index)]?.focus();
    }
  };

  const searchInput = (
    <input id="search-input" ref={searchRef} type="search" placeholder="제목, 분야, 혜택으로 찾아보세요" aria-label="공지 검색" value={s.query}
      onChange={(e) => setFilters({ query: e.target.value })}
      onKeyDown={(e) => { if (e.key === 'Escape' && mobile && s.searchExpanded) { e.preventDefault(); setUI({ searchExpanded: false, query: '', page: 1 }); } }} />
  );
  const nativeSort = (
    <select id="sort-filter" className="filter-select" aria-label="정렬 기준" value={s.sort} hidden={mobile} tabIndex={mobile ? -1 : undefined}
      onChange={(e) => applySort(e.target.value as Sort)}>
      {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
  );
  const sortSelect = mobile ? (
    <div className="sort-dropdown" ref={sortRef} onKeyDown={sortKeys}>
      {nativeSort}
      <button type="button" className="sort-trigger" data-action="toggle-sort" aria-label="정렬 기준" aria-haspopup="listbox" aria-expanded={sortOpen} aria-controls="sort-options"
        onClick={() => setSortOpen(!sortOpen)}>
        <span className="sort-current">{options.find(([v]) => v === s.sort)?.[1]}</span><Icon name="chevron" />
      </button>
      <div id="sort-options" className="sort-options" role="listbox" aria-label="정렬 기준" hidden={!sortOpen}>
        {options.map(([value, label]) => (
          <button key={value} type="button" className="sort-option" role="option" tabIndex={-1} data-action="select-sort" data-id={value} aria-selected={value === s.sort}
            onClick={() => { applySort(value); sortRef.current?.querySelector<HTMLButtonElement>('.sort-trigger')?.focus(); }}>
            {label}{value === s.sort ? <Icon name="check" /> : null}
          </button>
        ))}
      </div>
    </div>
  ) : nativeSort;
  const recruitmentFilter = (
    <label className="check-filter"><input id="open-filter" type="checkbox" checked={s.openOnly} onChange={(e) => setFilters({ openOnly: e.target.checked })} />모집중</label>
  );
  const toggleSearch = () => {
    const expanded = !s.searchExpanded;
    setUI({ searchExpanded: expanded, ...(expanded ? {} : { query: '', page: 1 }) });
    requestAnimationFrame(() => (expanded ? document.querySelector<HTMLInputElement>('#search-input') : document.querySelector<HTMLButtonElement>('[data-action="toggle-search"]'))?.focus());
  };
  const searchTools = mobile ? (
    <div className={`search-tools mobile-search-tools ${s.searchExpanded ? 'is-expanded' : ''}`}>
      <div className="mobile-search-control">
        <button type="button" className="search-toggle" data-action="toggle-search" aria-label={`검색창 ${s.searchExpanded ? '닫기' : '열기'}`} aria-expanded={s.searchExpanded}
          aria-controls="mobile-search-field" onClick={toggleSearch}><Icon name="search" /></button>
        <label id="mobile-search-field" className="searchbox" hidden={!s.searchExpanded} {...(s.searchExpanded ? {} : { inert: '' })}>{s.searchExpanded ? searchInput : null}</label>
      </div>
      {sortSelect}{recruitmentFilter}
    </div>
  ) : (
    <div className="search-tools"><label className="searchbox"><Icon name="search" />{searchInput}</label>{sortSelect}{recruitmentFilter}</div>
  );

  const chip = (c: Category) => (
    <button key={c.id} className={`chip ${s.category === c.id ? 'active' : ''}`} data-category={c.id} aria-pressed={s.category === c.id} onClick={() => selectCategory(c.id)}><span>{c.name}</span></button>
  );
  const firstChip = home
    ? [<button key="all" className={`chip ${s.category === 'all' ? 'active' : ''}`} data-category="all" aria-pressed={s.category === 'all'} onClick={() => selectCategory('all')}>전체</button>]
    : [
      <button key="rec" className={`chip recommend-chip ${recommended ? 'active' : ''}`} data-category="recommended" aria-pressed={recommended} onClick={() => selectCategory('recommended')}><Icon name="spark" /> 추천</button>,
      <button key="all" className={`chip ${s.category === 'all' ? 'active' : ''}`} data-category="all" aria-pressed={s.category === 'all'} onClick={() => selectCategory('all')}>전체</button>,
    ];
  const categories = type === 'program' ? PROGRAM_CATEGORIES : NOTICE_CATEGORIES;
  const compactNotices = mobile && type === 'notice';
  const noticeRows = [['academic', 'activity', 'scholarship'], ['career', 'intern', 'international', 'startup']];
  const programRows = home ? [['startup', 'major', 'learning'], ['counseling', 'other']] : [['startup', 'major'], ['learning', 'counseling', 'other']];
  const rows = compactNotices ? noticeRows : programRows;
  const buttons = mobile
    ? rows.map((ids, n) => (
      <div key={n} className={`category-row ${compactNotices ? 'notice-category-row' : ''}`}>
        {n === 0 ? firstChip : null}{ids.map((id) => categories.find((c) => c.id === id)).filter((c): c is Category => !!c).map(chip)}
      </div>
    ))
    : [...firstChip, ...categories.map(chip)];
  return (
    <>
      <div ref={filtersRef} className={`filters ${mobile ? 'categories-two-rows' : ''} ${compactNotices ? 'notice-categories-two-rows' : ''} ${type === 'program' ? 'program-categories' : ''}`} aria-label="카테고리 필터">
        {buttons}
      </div>
      {searchTools}
    </>
  );
}
