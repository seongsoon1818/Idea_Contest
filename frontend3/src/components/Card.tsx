import type { ReactNode } from 'react';
import { Icon } from '../lib/icons';
import { categoryFor } from '../lib/data';
import type { Item, Profile } from '../lib/live';
import { useUI } from '../app/store';
import { openModal, toggleCompare, toggleSave, removeCompare, isSaved } from '../app/actions';
import { Badge, Eligibility, benefitSummary, fmt, target, recommendationReason, applicationText, programInfo } from './format';

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

export function CardFacts({ item }: { item: Item }) {
  const grade = !item.targetsLoaded ? '확인 중' : !item.grades.length ? '원문 확인' : item.grades.length === 4 ? '전 학년' : item.grades.join('·') + '학년';
  const fullDeadline = item.deadlineText || '원문 확인';
  const fullTarget = target(item), fullBenefit = item.benefit || '미기재 · 원문 확인';
  return (
    <dl className="card-facts">
      <div className="fact-cell">
        <dt><Icon name="user" /> 대상</dt>
        <dd className="fact-target" title={fullTarget} aria-label={`대상: ${fullTarget}`}>
          <span className="card-fact-preview"><span>{grade}</span>{item.tracks.length ? <span>지정트랙</span> : null}</span>
        </dd>
      </div>
      <div className="fact-cell">
        <dt><Icon name="calendar" /> 마감</dt>
        <dd title={fullDeadline} aria-label={`마감: ${fullDeadline}`}><span className="card-fact-preview">{item.deadline ? fmt(item.deadline) + '까지' : '원문 확인'}</span></dd>
      </div>
      <div className="fact-cell">
        <dt><Icon name="exclamation" /> 혜택</dt>
        <dd title={fullBenefit} aria-label={`혜택: ${fullBenefit}`}><span className="card-fact-preview">{benefitSummary(item)}</span></dd>
      </div>
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
        {item.subtitle ? <p className="card-description">{item.subtitle}</p> : null}
        <CardFacts item={item} />
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
