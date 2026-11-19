// Detail, notice text, AI comparison, quick lists and image viewer.
import { Fragment, useEffect } from 'react';
import { Icon } from '../lib/icons';
import { live, parseKey, type Item, type Profile } from '../lib/live';
import { categoryFor } from '../lib/data';
import { useUI } from '../app/store';
import { back, completeComparison, comparison, loadComparison, openModal, retryLive, toggleCompare, toggleSave, isSaved } from '../app/actions';
import { Badge, Eligibility, applicationText, officialUrl, programInfo, target, noticeImages } from '../components/format';
import { Card, Empty, Loading, ProgramFacts } from '../components/Card';
import { useMobile } from '../components/hooks';
import { ApplicationNotice, BackFooter, ImageGallery, ImageViewerImage, ModalHead } from './parts';

function LoadingDialog({ title, error }: { title: string; error?: any }) {
  return (
    <>
      <ModalHead title={title} />
      <div className="modal-content">
        {error ? <Empty title="정보를 불러오지 못했어요" text={error.message} action="live-retry" label={<span>다시 시도</span>} icon="info" onAction={retryLive} /> : <Loading />}
      </div>
      <BackFooter />
    </>
  );
}

/** Reads what a detail/source dialog needs; returns the item once it is ready. */
function useDetail(id: string, withContent: boolean): { item?: Item; error?: any; pending: boolean; content?: any; contentError?: any } {
  const ref = parseKey(id);
  if (!ref) return { pending: false, error: new Error('더 이상 제공되지 않는 소식이에요.') };
  const detail = live.read(`/${ref.type}s/${ref.id}`);
  const content = withContent && ref.type === 'notice' ? live.read(`/notices/${ref.id}/content`) : null;
  const contentFailed = content?.error && content.error.code !== 'SUMMARY_NOT_READY';
  if (detail.error || contentFailed) return { pending: false, error: detail.error || content!.error };
  if (detail.pending || content?.pending) return { pending: true };
  const item = live.item(id)?.detailed ? live.item(id) : live.rememberDetail(detail.data, false);
  return { pending: false, item, content: content?.data, contentError: content?.error };
}

function Warnings({ item }: { item: Item }) {
  if (!item.warnings?.length) return null;
  return <section className="detail-group"><h3><Icon name="info" /> 확인 사항</h3><ul>{item.warnings.map((w, n) => <li key={n}>{w}</li>)}</ul></section>;
}
function Attachments({ item }: { item: Item }) {
  return <>{item.attachments.map((file) => (
    <a key={file.url} className="secondary official-shortcut attachment-link" href={file.url} target="_blank" rel="noopener noreferrer"><Icon name="clip" /> {file.name}</a>
  ))}</>;
}
const Shortcut = ({ item }: { item: Item }) => (
  <a className="secondary official-shortcut" href={officialUrl(item)} target="_blank" rel="noopener noreferrer">{item.type === 'notice' ? '공지사항' : '스마트자기관리시스템'} 바로가기 <Icon name="external" /></a>
);

function ProgramDetailBody({ item, profile }: { item: Item; profile: Profile | null }) {
  const info = programInfo(item);
  return (
    <>
      {info.summary ? (
        <section className="detail-group program-overview"><h3><Icon name="pencil" /> 프로그램 한눈에</h3>
          <p className="detail-overview">{info.summary.length > 180 ? info.summary.slice(0, 180) + '…' : info.summary}</p></section>
      ) : null}
      <section className="detail-group"><h3><Icon name="info" /> 핵심 정보</h3><ProgramFacts item={item} />{info.audience ? <Eligibility item={item} profile={profile} /> : null}</section>
      <p className="program-source-note">세부 일정·참여 조건·준비사항은 스마트자기관리시스템에서 확인해 주세요.</p>
      <ApplicationNotice />
    </>
  );
}

export function DetailModal({ id, profile }: { id: string; profile: Profile | null }) {
  const { compared } = useUI(), mobile = useMobile();
  const { item, error, pending } = useDetail(id, false);
  if (!item) return <LoadingDialog title={live.item(id)?.title || '상세 정보'} error={pending ? undefined : error} />;
  const saved = isSaved(item);
  const saveButton = (
    <button className="primary" data-action="save" data-id={item.id} aria-pressed={saved} aria-label={saved ? 'MY PICK 저장 해제' : 'MY PICK에 저장'} onClick={() => void toggleSave(item.id)}>
      <Icon name="bookmark" /> MY PICK
    </button>
  );
  return (
    <>
      <ModalHead title={item.title} eyebrow={categoryFor(item.type, item.type === 'program' ? item.programCategory : item.noticeCategory).name} />
      <div className="modal-content">
        <div className="detail-meta"><span className="badge">{item.type === 'notice' ? '공지사항' : '비교과프로그램'}</span><Badge item={item} /></div>
        {item.type === 'program' ? <ProgramDetailBody item={item} profile={profile} /> : (
          <>
            {item.subtitle ? <p className="detail-overview">{item.subtitle}</p> : null}
            <ImageGallery item={item} />
            <section className="detail-group"><h3><Icon name="user" /> 신청 대상</h3><p>{item.audienceText || target(item)}</p><Eligibility item={item} profile={profile} /></section>
            <section className="detail-group"><h3><Icon name="calendar" /> 신청·활동 기간</h3>
              <p>신청: {applicationText(item)}<br />활동 / 결과 안내: {item.activityLines?.join(' / ') || '원문 확인'}</p></section>
            <section className="detail-group"><h3><Icon name="exclamation" /> 받을 수 있는 혜택</h3>
              <p>{item.benefitLines?.length ? item.benefitLines.map((line, n) => <Fragment key={n}>{n > 0 && <br />}{line}</Fragment>) : item.benefit || '혜택이 기재되어 있지 않습니다. 원문을 확인해 주세요.'}</p></section>
            <section className="detail-group"><h3><Icon name="check" /> 미리 준비할 것</h3>
              {item.preparations.length ? <ul>{item.preparations.map((x, n) => <li key={n}>{x}</li>)}</ul> : <p>준비사항이 기재되어 있지 않습니다. 원문을 확인해 주세요.</p>}</section>
            <section className="detail-group"><h3><Icon name="building" /> 운영·신청 안내</h3><p>운영 부서: {item.department || '원문 확인'}</p>
              {item.guideLines?.length ? <ul>{item.guideLines.map((x, n) => <li key={n}>{x}</li>)}</ul> : null}<ApplicationNotice /></section>
          </>
        )}
        {item.type === 'program' ? <ImageGallery item={item} /> : null}
        <Warnings item={item} />
        <div className="original-actions">
          <Attachments item={item} /><Shortcut item={item} />
          {mobile || item.type === 'program' ? null : (
            <a className="real-source" href={`#source/${item.rawId}`} data-action="source" data-id={item.id} onClick={(e) => { e.preventDefault(); openModal({ kind: 'source', id: item.id }); }}>
              공지 내용 보기 <Icon name="external" />
            </a>
          )}
        </div>
      </div>
      <div className="modal-footer">
        {mobile ? <>{saveButton}<button className="secondary" data-action="detail-back" onClick={() => back()}>뒤로가기</button></> : <>
          <button className="secondary" data-action="toggle-detail-compare" data-id={item.id} onClick={() => toggleCompare(item.id)}><Icon name="compare" /> {compared.includes(item.id) ? '비교 해제' : 'AI 비교하기'}</button>
          {saveButton}
          <button className="secondary" data-action="detail-back" onClick={() => back()}>뒤로가기</button>
        </>}
      </div>
    </>
  );
}

export function SourceModal({ id, profile }: { id: string; profile: Profile | null }) {
  const { item, error, pending, content, contentError } = useDetail(id, true);
  if (!item) return <LoadingDialog title={live.item(id)?.title || '공지 내용'} error={pending ? undefined : error} />;
  if (item.type === 'program') return <DetailModal id={id} profile={profile} />;
  const raw = content
    ? `${content.title}\n\n작성 부서: ${content.author || '(기재 없음)'}\n등록일: ${content.publishedDate || '(기재 없음)'}${content.oneLineSummary ? `\n\n${content.oneLineSummary}` : ''}${(content.sections || []).map((section: any) => `\n\n■ ${section.label}\n${section.lines.join('\n')}`).join('')}`
    : `${item.title}\n\n${contentError?.message || '공지 내용을 아직 준비하지 못했어요.'}\n학교 원문에서 내용을 확인해 주세요.`;
  return (
    <>
      <ModalHead title="공지 내용" subtitle={item.title} />
      <div className="modal-content">
        <ImageGallery item={item} />
        <div className="raw-document">{raw}</div>
        <ApplicationNotice />
        <Shortcut item={item} />
      </div>
      <div className="modal-footer"><button className="primary" data-action="detail" data-id={item.id} onClick={() => openModal({ kind: 'detail', id: item.id })}>상세 정보로 돌아가기</button></div>
    </>
  );
}

export function CompareModal({ profile }: { profile: Profile | null }) {
  const { compared } = useUI();
  const key = [...compared].sort().join(',');
  useEffect(() => { if (compared.length >= 2) loadComparison(); }, [key, compared.length]);
  if (comparison.key !== key || !comparison.done) {
    return <LoadingDialog title="AI 비교하기" error={comparison.key === key && comparison.error ? new Error(comparison.error) : undefined} />;
  }
  const list = compared.map((id) => live.item(id)).filter((i): i is Item => !!i);
  return (
    <>
      <ModalHead title="AI 비교하기" subtitle="공지사항과 비교과 프로그램을 나눠 조건과 준비사항을 비교해요." />
      <div className="modal-content">
        <p className="compare-tip">선택한 {list.length}개 / 최대 3개</p>
        {(['notice', 'program'] as const).map((kind) => {
          const picks = list.filter((i) => i.type === kind);
          if (!picks.length) return null;
          const name = kind === 'notice' ? '공지사항' : '비교과 프로그램';
          return (
            <section key={kind} className="comparison-group" data-kind={kind} aria-label={`${name} 비교`}>
              <div className="section-head"><h2>{name}<span className="group-count">{picks.length}</span></h2></div>
              <div className="cards comparison-cards">{picks.map((i) => <Card key={i.id} item={i} profile={profile} featured comparing />)}</div>
            </section>
          );
        })}
        <p className="hint">실제 신청 조건은 학교 원문에서 확인해야 합니다.</p>
      </div>
      <div className="modal-footer"><button className="primary" data-action="complete-compare" onClick={completeComparison}>비교 완료</button></div>
    </>
  );
}

export function QuickModal({ which, profile }: { which: 'open' | 'urgent'; profile: Profile | null }) {
  const { compared } = useUI();
  const urgent = which === 'urgent';
  const title = urgent ? '마감 PICK!' : profile ? '추천 PICK!' : '모집 중인 기회';
  const entry = live.read(`/recommendations?type=all&status=open&page=1&size=100&sort=${urgent ? 'deadline' : 'recommended'}${urgent ? '&deadlineWithinDays=3' : ''}`);
  if (!entry.data) {
    return (<><ModalHead title={title} /><div className="modal-content">{entry.error
      ? <Empty title="정보를 불러오지 못했어요" text={entry.error.message} action="live-retry" label={<span>다시 시도</span>} icon="info" onAction={retryLive} /> : <Loading />}</div></>);
  }
  const list: Item[] = entry.data.items.map((card: any) => live.remember(card));
  live.loadTargets(list);
  const groups = (['notice', 'program'] as const).map((type) => {
    const items = list.filter((i) => i.type === type);
    if (!items.length) return null;
    return (
      <section key={type} className="quick-list-group">
        <h3><Icon name={type === 'notice' ? 'book' : 'pencil'} />{type === 'notice' ? '공지사항' : '비교과프로그램'}</h3>
        <div className="cards quick-list-cards">{items.map((i) => <Card key={i.id} item={i} profile={profile} />)}</div>
      </section>
    );
  }).filter(Boolean);
  return (
    <>
      <ModalHead title={title} />
      <div className="modal-content">
        <div className="result-line" role="status"><span>총 <strong>{list.length}</strong>개의 기회</span></div>
        {groups.length ? groups : <Empty title={urgent ? '3일 내 마감되는 기회가 없어요' : '현재 모집 중인 기회가 없어요'} text="다른 기회도 맞춤추천에서 확인해보세요." icon={urgent ? 'clock' : 'spark'} />}
      </div>
      <div className="modal-footer">
        <button className="secondary" data-action="compare" disabled={compared.length < 2} onClick={() => openModal({ kind: 'compare' })}>선택한 PICK 비교</button>
        <button className="primary" data-action="close" onClick={() => back(true)}>닫기</button>
      </div>
    </>
  );
}

export function ImageModal({ id, index }: { id: string; index: number }) {
  const item = live.item(id), img = item && noticeImages(item)[index];
  if (!item || !img) return <LoadingDialog title="공지 이미지" error={new Error('이미지를 찾을 수 없어요.')} />;
  return (
    <>
      <ModalHead title="공지 이미지" subtitle={item.title} />
      <div className="modal-content image-viewer">
        <ImageViewerImage url={img.url} alt={img.alt} />
        <a className="secondary" href={img.url} target="_blank" rel="noopener noreferrer">이미지 원본 열기 <Icon name="external" /></a>
      </div>
      <BackFooter />
    </>
  );
}
