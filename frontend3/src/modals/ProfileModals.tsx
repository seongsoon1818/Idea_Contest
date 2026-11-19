// Two-step "내 정보" form, track picker and related confirmations.
import { useEffect, useRef } from 'react';
import { Icon } from '../lib/icons';
import { CATEGORIES, normalizeTrack } from '../lib/data';
import { TRACK_COLLEGES, trackOptionsForSlot, normalizeTrackSearch, type TrackOption } from '../lib/tracks';
import type { Grade } from '../lib/live';
import { live } from '../lib/live';
import { useUI, setUI, getUI } from '../app/store';
import {
  back, clearTrack, discardProfile, openTrackPicker, restartProfile, returnFromTrackPicker, saveProfile, selectTrack, setGrade, submitProfileStep1, updateDraft,
} from '../app/actions';
import { gradeLabel } from '../components/format';
import { useMobile } from '../components/hooks';
import { ModalHead } from './parts';

const GRADES: Grade[] = [1, 2, 3, 4, 'other'];

export function ProfileStep1() {
  const { draft, formError, trackFocus } = useUI(), mobile = useMobile();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (trackFocus) { formRef.current?.querySelector<HTMLElement>(`#track-picker-${trackFocus}`)?.focus(); setUI({ trackFocus: null }); }
  }, [trackFocus]);
  if (!draft) return null;
  const firstYear = Number(draft.grade) === 1;
  const slots = firstYear ? [1] : [1, 2, 3];
  const incomplete = draft.grade === null || !draft.tracks[0] || (!firstYear && !draft.tracks[1]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const focus = submitProfileStep1();
    if (focus === 'grade') formRef.current?.querySelector<HTMLInputElement>('input[name="grade"]')?.focus();
    else if (focus) formRef.current?.querySelector<HTMLElement>('#' + focus)?.focus();
  };
  return (
    <form id="profile-form" ref={formRef} noValidate onSubmit={submit}>
      <div className="step-progress"><span className="done" /><span /></div>
      <ModalHead title="나에 대해 알려주세요!" subtitle="학년·트랙·관심 분야로 나에게 맞는 추천을 시작해요." eyebrow="01 / 02" />
      <div className="modal-content">
        <label className="form-group account-label" htmlFor="profile-name">이름
          <input id="profile-name" className="form-input" name="displayName" autoComplete="name" maxLength={30} value={draft.name} placeholder="이름을 입력해 주세요"
            onChange={(e) => updateDraft({ name: e.target.value })} />
        </label>
        <fieldset className="form-group"><legend>학년</legend>
          <div className="grades grades-five">
            {GRADES.map((g) => (
              <label key={g} className="radio-tile">
                <input type="radio" name="grade" value={g} checked={String(draft.grade) === String(g)} aria-label={gradeLabel(g)} onChange={() => setGrade(g)} />
                <span>{gradeLabel(g)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div id="profile-track-fields" hidden={draft.grade === null}>
          {slots.map((n) => (
            <div key={n} className="form-group track-field">
              <label className="form-label" htmlFor={`track-picker-${n}`}>{n}트랙 {n <= (firstYear ? 1 : 2) ? <span>필수</span> : <span>선택</span>}</label>
              <input type="hidden" id={`track${n}`} name={`track${n}`} value={draft.tracks[n - 1] || ''} />
              <div className="track-field-control">
                <button type="button" className={`form-input track-picker-trigger ${draft.tracks[n - 1] ? 'has-value' : ''}`} id={`track-picker-${n}`} data-action="pick-track" data-slot={n}
                  aria-haspopup="dialog" onClick={() => openTrackPicker(n)}>
                  <span>{draft.tracks[n - 1] || (n === 1 && firstYear ? '소속 대학·학부·학과를 선택해 주세요' : `${n}트랙을 선택해 주세요`)}</span><Icon name="chevron" />
                </button>
                {n > 1 && draft.tracks[n - 1] ? (
                  <button type="button" className="track-clear" data-action="clear-track" data-slot={n} aria-label={`${n}트랙 선택 해제`} onClick={() => clearTrack(n)}><Icon name="close" /></button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <p id="form-error" className="form-error" role="alert">{formError}</p>
      </div>
      <div className="modal-footer"><button className="primary" type="submit" disabled={mobile && incomplete}>관심 분야 <Icon name="arrow" /></button></div>
    </form>
  );
}

export function ProfileStep2() {
  const { draft, formError, profileBusy } = useUI();
  if (!draft) return null;
  const toggle = (id: string, checked: boolean) => {
    if (checked && draft.interests.length >= 4) { setUI({ formError: '관심 분야는 최대 4개까지 선택할 수 있어요.' }); return; }
    updateDraft({ interests: checked ? [...draft.interests, id] : draft.interests.filter((x) => x !== id) });
  };
  return (
    <form id="interest-form" onSubmit={(e) => { e.preventDefault(); void saveProfile(); }}>
      <div className="step-progress"><span className="done" /><span className="done" /></div>
      <ModalHead title={`${draft.name.trim().slice(-2)}님의 관심 분야를 알려주세요.`} subtitle="관심 분야를 1~4개 선택해 주세요." eyebrow="02 / 02 · 관심 분야" />
      <div className="modal-content">
        <div className="interest-grid">
          {CATEGORIES.map((c) => (
            <label key={c.id} className="interest-tile">
              <input type="checkbox" name="interest" value={c.id} checked={draft.interests.includes(c.id)} aria-label={c.name} onChange={(e) => toggle(c.id, e.target.checked)} />
              <span className="interest-content"><Icon name={c.icon} /><span><b>{c.name}</b><small>{c.hint}</small></span></span>
            </label>
          ))}
        </div>
        <p id="form-error" className="form-error" role="alert">{formError}</p>
      </div>
      <div className="modal-footer">
        <button type="button" className="secondary" data-action="profile-back" onClick={() => back()}>이전</button>
        <button className="primary" type="submit" disabled={profileBusy}><Icon name="spark" /> PICK 보기</button>
      </div>
    </form>
  );
}

export function TrackPickerModal() {
  const { trackPicker: picker, draft } = useUI(), mobile = useMobile();
  if (!picker || !draft) return null;
  const update = (patch: Partial<NonNullable<typeof picker>>) => setUI({ trackPicker: { ...getUI().trackPicker!, ...patch } });
  const firstYear = picker.slot === 1 && Number(draft.grade) === 1;
  const groups = TRACK_COLLEGES.filter((c) => picker.college === 'all' || c.id === picker.college).flatMap((c) => c.groups.map((g, n) => ({ id: `${c.id}-${n}`, name: g.name, college: c.name })));
  const selectedElsewhere = (name: string) => draft.tracks.some((t, n) => n !== picker.slot - 1 && t && normalizeTrack(t) === normalizeTrack(name));

  const filterMenu = (kind: 'college' | 'group') => {
    const college = TRACK_COLLEGES.find((c) => c.id === picker.college);
    const choices = kind === 'college' ? TRACK_COLLEGES : groups;
    const current = kind === 'college' ? picker.college : picker.group;
    const name = kind === 'college' ? college?.name : groups.find((g) => g.id === picker.group)?.name;
    const all = kind === 'college' ? '전체 대학' : '전체 학부·학과';
    const choose = (id: string) => { update({ browsing: true, [kind]: id, ...(kind === 'college' ? { group: 'all' } : {}), menu: null }); };
    return (
      <div className="track-dropdown">
        <button type="button" className={`track-filter-button ${current !== 'all' ? 'selected' : ''}`} data-action="track-filter-menu" data-kind={kind} aria-expanded={picker.menu === kind}
          aria-controls={`track-menu-${kind}`} onClick={() => update({ menu: picker.menu === kind ? null : kind })}>
          {name || all}<Icon name="chevron" />
        </button>
        {picker.menu === kind ? (
          <div className="track-filter-menu" id={`track-menu-${kind}`} role="group" aria-label={`${kind === 'college' ? '대학' : '학부·학과'} 선택`}>
            <button type="button" data-action="track-filter-value" data-kind={kind} data-id="all" aria-pressed={current === 'all'} onClick={() => choose('all')}>{all}</button>
            {choices.map((c) => <button key={c.id} type="button" data-action="track-filter-value" data-kind={kind} data-id={c.id} aria-pressed={current === c.id} onClick={() => choose(c.id)}>{c.name}</button>)}
          </div>
        ) : null}
      </div>
    );
  };
  const option = (o: TrackOption) => {
    const selected = draft.tracks[picker.slot - 1] === o.name, used = selectedElsewhere(o.name);
    return (
      <button key={o.id} type="button" className={`track-option ${selected ? 'selected' : ''}`} data-action="select-track" data-id={o.id} aria-pressed={selected} disabled={used} onClick={() => selectTrack(o.id)}>
        <span><b>{o.name}</b>{o.note ? <small>{o.note}</small> : null}</span>
        <span className="track-option-state">{used ? '선택됨' : selected ? <Icon name="check" /> : <Icon name="chevron" />}</span>
      </button>
    );
  };
  const results = () => {
    const search = normalizeTrackSearch(picker.search);
    if (!picker.browsing && !search) return null;
    if (mobile && !search && (picker.college === 'all' || picker.group === 'all')) {
      if (picker.slot !== 1 || Number(draft.grade) !== 1 || picker.college === 'all') return null;
      const college = trackOptionsForSlot({ slot: 1, grade: 1 }).find((t) => t.kind === 'college' && t.collegeId === picker.college);
      return college ? <><p className="track-result-count">소속 대학으로 선택하거나 학부·학과를 좁혀주세요.</p>{option(college)}</> : null;
    }
    const options = trackOptionsForSlot({ slot: picker.slot, grade: draft.grade }).filter((t) =>
      (picker.college === 'all' || t.collegeId === picker.college) && (picker.group === 'all' || t.groupId === picker.group) && (!search || normalizeTrackSearch(t.searchText).includes(search)));
    const sections = TRACK_COLLEGES.map((c) => {
      const items = options.filter((t) => t.collegeId === c.id);
      if (!items.length) return null;
      return (
        <section key={c.id} className="track-college-group"><h3>{c.name}</h3>{c.note ? <p className="track-catalog-note">{c.note}</p> : null}
          {items.filter((t) => t.kind === 'college').map(option)}
          {c.groups.map((g, n) => {
            const entries = items.filter((t) => t.groupId === `${c.id}-${n}`);
            return entries.length ? <div key={n} className="track-department-group"><h4>{g.name}</h4>{g.note ? <p className="track-catalog-note">{g.note}</p> : null}{entries.map(option)}</div> : null;
          })}
        </section>
      );
    }).filter(Boolean);
    return <><p className="track-result-count" role="status">{options.length}개의 선택 항목</p>{sections.length ? sections : <div className="empty track-empty"><h3>검색 결과가 없어요</h3><p>다른 검색어나 분류로 찾아보세요.</p></div>}</>;
  };
  return (
    <>
      <ModalHead title={`${picker.slot}트랙 선택`} subtitle={firstYear ? '1학년은 소속 대학·학부·학과를 선택해 주세요.' : '대학·학부로 분류하거나 이름으로 검색해 주세요.'} closeAction="cancel-track" onClose={returnFromTrackPicker} />
      <div className="modal-content track-picker-content">
        <label className="track-searchbox"><Icon name="search" />
          <input id="track-search" type="search" value={picker.search} placeholder={firstYear ? '대학·학부·학과 검색' : '트랙·전공·학과 검색'} aria-label={firstYear ? '대학·학부·학과 검색' : '트랙·전공·학과 검색'}
            onChange={(e) => update({ search: e.target.value })} />
        </label>
        <div className="track-filter-bar">{filterMenu('college')}{!mobile || picker.college !== 'all' ? filterMenu('group') : null}</div>
        <div id="track-results">{results()}</div>
      </div>
      <div className="modal-footer"><button type="button" className="secondary" data-action="cancel-track" onClick={returnFromTrackPicker}>이전으로</button></div>
    </>
  );
}

export function ProfileDiscardModal() {
  return (
    <>
      <ModalHead title="수정 내용을 취소할까요?" />
      <div className="modal-content"><p>저장하지 않은 변경사항이 사라져요.</p></div>
      <div className="modal-footer">
        <button className="primary" data-action="keep-profile" onClick={() => { setUI({ discardDestination: null }); history.back(); }}>계속 입력하기</button>
        <button className="secondary" data-action="discard-profile" onClick={discardProfile}>수정 취소</button>
      </div>
    </>
  );
}

export function ResetProfileModal() {
  const count = live.peek('/home')?.data?.stats?.bookmarkCount ?? 0;
  return (
    <>
      <ModalHead title="추천 정보를 다시 설정할까요?" />
      <div className="modal-content"><ul className="management-explanation">
        <li>학년·트랙·관심 분야를 다시 선택할 수 있어요.</li><li>저장한 {count}개의 MY PICK은 유지됩니다.</li><li>새 정보를 저장하기 전까지 기존 정보가 유지됩니다.</li>
      </ul></div>
      <div className="modal-footer">
        <button className="secondary" data-action="close" onClick={() => back(true)}>취소</button>
        <button className="primary" data-action="restart-profile" onClick={restartProfile}>다시 입력하기</button>
      </div>
    </>
  );
}
