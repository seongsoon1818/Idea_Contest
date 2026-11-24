import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../lib/icons';
import { categoryFor } from '../lib/data';
import type { Item, Profile } from '../lib/live';
import { useUI } from '../app/store';
import { openModal, toggleCompare, toggleSave, removeCompare, isSaved } from '../app/actions';
import { Badge, Eligibility, target, recommendationReason, applicationText, programInfo } from './format';
import { live } from '../lib/live';
import { ORIGINAL, benefitCompact, benefitLine, deadlineCompact, deadlineLines, targetLines, type FactProfile, type TargetRules } from '../lib/cardFacts';

export function Empty({ title, text, action, label, icon = 'search', onAction, login }: {
  title: string; text: ReactNode; action?: string; label?: ReactNode; icon?: string; onAction?: () => void; login?: boolean;
}) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h3>{title}</h3>
      <p>{text}</p>
      {login ? <button className="primary" data-login-action="open" onClick={onAction}>로그인하기</button>
        : action && <button className="primary" data-action={action} onClick={onAction}>{label}</button>}
    </div>
  );
}
export const Loading = () => <div className="result-line" role="status"><span>불러오는 중…</span></div>;

/** One fact cell: full lines, else the narrow form, else 원문 확인 (re-checked on content change and window resize). */
function FactCell({ label, icon, lines, full, className, compact = null, wrapNoticeBenefit = false }: { label: string; icon: string; lines: string[]; full: string; className?: string; compact?: string[] | null; wrapNoticeBenefit?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [stage, setStage] = useState(0); // 0 full, 1 narrow form, 2 원문 확인
  const [size, setSize] = useState(0);
  const key = lines.join('\n') + '|' + (compact || []).join('\n') + '|' + wrapNoticeBenefit;
  useLayoutEffect(() => { setStage(0); }, [key, size]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (stage === 2 || !el || !el.getClientRects().length) return;
    if ([...el.children].some((line) => line.scrollWidth > line.clientWidth + 1 || (wrapNoticeBenefit && line.scrollHeight > line.clientHeight + 1))) setStage(stage === 0 && compact?.length ? 1 : 2);
  });
  useEffect(() => {
    const onResize = () => setSize((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    if (!wrapNoticeBenefit) return;
    let alive = true;
    const recheck = () => { if (alive) setSize((n) => n + 1); };
    const container = ref.current?.parentElement;
    let width = container?.getBoundingClientRect().width;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width !== width) {
        width = entry.contentRect.width;
        recheck();
      }
    });
    if (container) observer.observe(container);
    void document.fonts.ready.then(recheck);
    document.fonts.addEventListener('loadingdone', recheck);
    return () => {
      alive = false;
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', recheck);
    };
  }, [wrapNoticeBenefit]);
  return (
    <div className="fact-cell">
      <dt><Icon name={icon} /> {label}</dt>
      <dd className={className} title={full} aria-label={`${label}: ${full}`}>
        <span className={`card-fact-preview${wrapNoticeBenefit ? ' notice-benefit-preview' : ''}`} ref={ref}>{(stage === 0 ? lines : stage === 1 && compact ? compact : [ORIGINAL]).map((line, n) => <span className="fact-line" key={n}>{line}</span>)}</span>
      </dd>
    </div>
  );
}

function factsTarget(item: Item): TargetRules {
  if (item.targetRules) return item.targetRules;
  return {
    gradeScope: !item.grades.length ? 'UNKNOWN' : item.grades.length === 4 ? 'ALL' : 'RESTRICTED', grades: item.grades as TargetRules['grades'],
    academicScope: item.trackEligibilityKnown === false ? 'UNKNOWN' : item.tracks.length ? 'RESTRICTED' : 'ALL', units: item.tracks.map((name) => ({ name })),
  };
}
function factsProfile(profile: Profile | null): FactProfile | null {
  if (!profile) return null;
  if (!profile.slots) return { grade: profile.grade, slots: profile.tracks.filter(Boolean).map((name, n) => ({ slot: n + 1, name })) };
  const parents = live.unitParents();
  const ancestors = (id: string | null) => {
    const list: string[] = [];
    for (let p = id; p && !list.includes(p); p = parents?.get(p) ?? null) list.push(p);
    return list;
  };
  return { grade: profile.grade, slots: profile.slots.map((slot) => ({ ...slot, ancestors: ancestors(slot.parentId) })) };
}

/** 대상 · 마감 · 혜택 cells; the rules live in lib/cardFacts.ts (same as frontend2). */
export function CardFacts({ item, profile }: { item: Item; profile: Profile | null }) {
  const who = !item.targetsLoaded ? ['확인 중'] : targetLines(factsTarget(item), factsProfile(profile));
  const benefit = item.type === 'notice' ? item.noticeBenefitSummary || ORIGINAL : benefitLine(item.type, item.points);
  return (
    <dl className="card-facts">
      <FactCell label="대상" icon="user" lines={who} full={target(item)} className="fact-target" />
      <FactCell label="마감" icon="calendar" lines={deadlineLines(item.deadline, item.deadlineTime)} compact={deadlineCompact(item.deadline, item.deadlineTime)} full={item.deadlineText || '원문 확인'} />
      <FactCell label="혜택" icon="exclamation" lines={[benefit]} compact={benefitCompact(item.type, item.points)} full={item.benefit || '미기재 · 원문 확인'} wrapNoticeBenefit={item.type === 'notice'} />
    </dl>
  );
}

export function ProgramFacts({ item }: { item: Item }) {
  const info = programInfo(item);
  const row = (label: string, value: string) => <div key={label}><dt>{label}</dt><dd>{value || '원문 확인'}</dd></div>;
  return (
    <dl className="program-facts">
      {row('신청 대상', info.audience)}{row('신청 기간', info.applicationPeriod)}{row('비교과 pt', info.points ? info.points + 'pt' : '')}{row('운영 부서', info.department)}
      {info.location ? row('진행 장소', info.location) : null}{info.format ? row('진행 방식', info.format) : null}
    </dl>
  );
}

function ComparisonDetails({ item, profile }: { item: Item; profile: Profile | null }) {
  if (item.type === 'program') return <ProgramFacts item={item} />;
  return (
    <dl className="comparison-details">
      <div><dt>신청 대상</dt><dd>{item.audienceText || target(item)}<Eligibility item={item} profile={profile} /></dd></div>
      <div><dt>신청 기간</dt><dd>{applicationText(item)}</dd></div>
      <div><dt>활동 / 결과</dt><dd>{item.eventAt || '원문 확인'}</dd></div>
      <div><dt>전체 혜택</dt><dd>{item.benefit || '미기재 · 원문 확인'}</dd></div>
      <div><dt>준비사항</dt><dd>{item.preparations.length ? <ul>{item.preparations.map((x, n) => <li key={n}>{x}</li>)}</ul> : '미기재 · 원문 확인'}</dd></div>
    </dl>
  );
}

export function Card({ item, profile, featured = false, comparing = false }: {
  item: Item; profile: Profile | null; featured?: boolean; comparing?: boolean;
}) {
  const ui = useUI(), { compared } = ui;
  // Same rule as the design build: reasons show on the 맞춤 추천 screen and the 추천 filter.
  const showReason = ui.view === 'recommend' || (['notices', 'programs', 'saved'].includes(ui.view) && ui.category === 'recommended');
  const c = categoryFor(item.type, item.type === 'program' ? item.programCategory : item.noticeCategory);
  const saved = isSaved(item);
  const reason = recommendationReason(item, profile);
  const open = () => openModal({ kind: 'detail', id: item.id });
  return (
    <article className={`card ${featured ? 'featured-card' : ''} ${comparing ? 'comparison-card' : ''}`} data-item={item.id} data-type={item.type}
      aria-label={`${item.type === 'notice' ? '공지사항' : '비교과 프로그램'}: ${item.title}`}>
      <div className="card-top">
        <span className={`category-icon ${c.color}`}><Icon name={c.icon} /></span>
        <span className="badge category-badge">{c.name}</span>
        <div className="card-status-actions">
          <Badge item={item} />
          <button className={`save-btn ${saved ? 'saved' : ''}`} data-action="save" data-id={item.id} aria-label={`${item.title} ${saved ? '저장 해제' : '저장'}`} aria-pressed={saved}
            onClick={() => void toggleSave(item.id)}><Icon name="bookmark" /></button>
        </div>
      </div>
      <div className="card-body" {...(comparing ? {} : { 'data-action': 'detail', 'data-id': item.id, onClick: (e) => { if (!(e.target as Element).closest('button')) open(); } })}>
        <div className="card-title-row">
          <button className="title-button" data-action="detail" data-id={item.id} aria-label={`${item.title} 상세 정보 보기`} onClick={open}>{item.title}</button>
        </div>
        <CardFacts item={item} profile={profile} />
        {comparing ? <ComparisonDetails item={item} profile={profile} /> : null}
      </div>
      {showReason && !comparing ? (
        <div className={`recommend-reason ${featured ? 'single-line' : ''}`}><Icon name="spark" /><span title={reason}>{reason}</span></div>
      ) : null}
      <div className="card-bottom">
        {comparing ? <button className="remove-compare" data-action="remove-compare" data-id={item.id} onClick={() => removeCompare(item.id)}>선택 해제</button>
          : <label className="compare-check"><input type="checkbox" data-compare={item.id} checked={compared.includes(item.id)} aria-label={`${item.title} AI 비교하기 선택`}
            onChange={() => toggleCompare(item.id)} />AI 비교하기</label>}
      </div>
    </article>
  );
}
