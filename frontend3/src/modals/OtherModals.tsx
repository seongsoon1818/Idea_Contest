// Account dialogs, usage guide and first-use guide.
import { useState, type FormEvent } from 'react';
import { Icon, Lines, ProviderSymbol } from '../lib/icons';
import { passwordError, confirmationError } from '../lib/authRules';
import { back, finishOnboarding, securityAction, showOnboarding, currentProfile } from '../app/actions';
import { ModalHead } from './parts';

export function AccountModal({ action }: { action: 'password' | 'delete' | 'social' }) {
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [social, setSocial] = useState('');
  const title = action === 'password' ? '비밀번호 변경' : action === 'delete' ? '회원 탈퇴' : '소셜 계정 연결';
  const run = async (kind: 'password' | 'delete', body: Record<string, string>) => {
    if (busy) return;
    setBusy(true); setFeedback('');
    const error = await securityAction(kind, body);
    setBusy(false);
    if (error) setFeedback(error);
  };
  const submitPassword = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = e.currentTarget;
    const current = (f.elements.namedItem('currentPassword') as HTMLInputElement).value;
    const next = (f.elements.namedItem('newPassword') as HTMLInputElement).value;
    const confirm = (f.elements.namedItem('confirmPassword') as HTMLInputElement).value;
    const error = !current ? '현재 비밀번호를 입력해 주세요.' : passwordError(next) || confirmationError(next, confirm) || (current === next ? '현재 비밀번호와 다른 비밀번호를 입력해 주세요.' : '');
    if (error) { setFeedback(error); return; }
    void run('password', { currentPassword: current, newPassword: next });
  };
  const submitDelete = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('currentPassword') as HTMLInputElement;
    if (!input.value) { setFeedback('현재 비밀번호를 입력해 주세요.'); input.focus(); return; }
    void run('delete', { currentPassword: input.value, confirmation: 'WITHDRAW' });
  };
  return (
    <>
      <ModalHead title={title} />
      <div className="modal-content">
        {action === 'password' ? (
          <form id="account-password-form" noValidate onSubmit={submitPassword}>
            <label className="account-label">현재 비밀번호<input className="form-input" name="currentPassword" type="password" autoComplete="current-password" required maxLength={256} /></label>
            <label className="account-label">새 비밀번호<input className="form-input" name="newPassword" type="password" autoComplete="new-password" required maxLength={32} /></label>
            <p className="signup-hint">영문·숫자·특수문자 포함 8~32자</p>
            <label className="account-label">새 비밀번호 확인<input className="form-input" name="confirmPassword" type="password" autoComplete="new-password" required maxLength={32} /></label>
            <p id="account-feedback" className="form-error" role="status" aria-live="polite">{feedback}</p>
            <button className="primary" type="submit" disabled={busy}>비밀번호 변경</button>
          </form>
        ) : action === 'delete' ? (
          <>
            <ul className="management-explanation"><li>한성 PICK 계정</li><li>이름·학년·트랙·관심 분야</li><li>저장한 MY PICK</li></ul>
            <p className="account-description">연결된 카카오·구글 계정 자체는 삭제되지 않습니다.</p>
            <form id="account-delete-form" noValidate onSubmit={submitDelete}>
              <label className="account-label">현재 비밀번호<input className="form-input" name="currentPassword" type="password" autoComplete="current-password" required maxLength={256} /></label>
              <p id="account-feedback" className="form-error" role="status" aria-live="polite">{feedback}</p>
            </form>
          </>
        ) : (
          <>
            <p className="account-notice">현재 계정 서버가 연결되지 않아 소셜 계정을 연결할 수 없어요.</p>
            <div className="social-connections">
              {(['kakao', 'google'] as const).map((id) => (
                <button key={id} type="button" className="social-connection" data-action="connect-social" data-id={id}
                  onClick={() => setSocial(`계정 서버가 연결되지 않아 ${id === 'kakao' ? '카카오' : '구글'} 계정을 연결할 수 없어요.`)}>
                  <span className={`provider-symbol ${id}-symbol`} aria-hidden="true"><ProviderSymbol id={id} /></span><span>{id === 'kakao' ? '카카오' : '구글'}</span>
                  <span className="connection-state">연결하기 <Icon name="chevron" /></span>
                </button>
              ))}
            </div>
            <p id="social-connect-feedback" className="signup-error" role="status" aria-live="polite">{social}</p>
          </>
        )}
      </div>
      <div className="modal-footer">
        <button className="secondary" data-action="close" onClick={() => back(true)}>뒤로가기</button>
        {action === 'delete' ? <button type="submit" form="account-delete-form" className="withdrawal-confirm" disabled={busy}>회원 탈퇴</button> : null}
      </div>
    </>
  );
}

export function AboutModal() {
  const steps: [string, string, string][] = [
    ['user', '내 정보 입력', '학년·트랙·관심 분야를 입력하면 나에게 맞는 추천을 받을 수 있어요.'],
    ['spark', '추천 확인', '공지사항과 비교과프로그램의 대상·마감·혜택, 추천 이유를 확인해 보세요.'],
    ['bookmark', 'MY PICK 저장', '관심 있는 카드의 북마크를 누르세요. MY PICK에서 다시 볼 수 있어요.'],
    ['compare', 'AI 비교하기', '카드에서 2~3개를 선택하면 대상·기간·혜택을 나란히 비교할 수 있어요.'],
  ];
  return (
    <>
      <ModalHead title="한성 PICK 이용 안내" />
      <div className="modal-content usage-guide">
        <ol className="usage-steps">
          {steps.map(([symbol, title, copy], i) => (
            <li key={title}><span className="usage-icon" aria-hidden="true"><Icon name={symbol} /></span><div><h3><span>{i + 1}.</span> {title}</h3><p>{copy}</p></div></li>
          ))}
        </ol>
        <section className="usage-note"><h3>마감일은 오늘 날짜 기준이에요</h3><p>한국 시간 기준으로 마감일까지 남은 날짜를 표시해요. 마감일에는 ‘오늘 마감’, 날짜가 지나면 ‘모집 마감’으로 보여요.</p></section>
        <section className="usage-note"><h3>실제 신청은 학교 사이트에서</h3><p>상세 화면의 바로가기 버튼을 이용해 주세요. 최종 신청 조건과 안내는 학교 사이트에서 확인할 수 있어요.</p></section>
      </div>
      <div className="modal-footer">
        <button className="secondary" data-action="onboarding-open" onClick={() => showOnboarding(0, false)}>처음 사용 안내 다시 보기</button>
        <button className="primary" data-action="close" onClick={() => back(true)}>확인</button>
      </div>
    </>
  );
}

const ONBOARDING_STEPS = [
  { icon: 'user', title: '나를 알려주면, 추천이 시작돼요', description: '학년·트랙·관심 분야를 입력해 주세요.\n나에게 맞는 공지와 프로그램을 먼저 골라드려요.', label: '내 정보', preview: '학년 → 트랙 → 관심 분야' },
  { icon: 'spark', title: '지금 필요한 기회를 PICK!', description: '추천 이유와 대상·마감·혜택을 확인해 보세요.\n궁금한 기회는 선택해서 함께 비교할 수 있어요.', label: '맞춤 추천', preview: '대상 · 마감 · 혜택을 한눈에' },
  { icon: 'bookmark', title: '관심 있는 기회는 MY PICK', description: '북마크를 누르면 MY PICK에 모아볼 수 있어요.\n실제 신청은 학교 사이트에서 진행해 주세요.', label: 'MY PICK', preview: '저장한 기회를 한곳에' },
  { icon: 'compare', title: '고민되는 기회는 AI 비교하기', description: '카드의 AI 비교하기에서 2~3개를 선택해 주세요.\n대상·기간·혜택을 나란히 확인할 수 있어요.', label: 'AI 비교하기', preview: '최대 3개의 기회를 한눈에 비교' },
];
export function OnboardingModal({ step, beforeLogin }: { step: number; beforeLogin: boolean }) {
  const item = ONBOARDING_STEPS[step], last = step === ONBOARDING_STEPS.length - 1;
  return (
    <>
      <div className="onboarding-top"><span>한성 PICK 시작하기</span>
        <button type="button" className="close-btn onboarding-skip" data-action="onboarding-skip" onClick={() => finishOnboarding()}>건너뛰기</button>
      </div>
      <div className="modal-content onboarding-content">
        <div className="onboarding-preview" aria-hidden="true"><span className="onboarding-symbol"><Icon name={item.icon} /></span><b>{item.label}</b><span>{item.preview}</span></div>
        <div className="onboarding-copy" aria-live="polite" aria-atomic="true">
          <span className="onboarding-step">{step + 1} / {ONBOARDING_STEPS.length}</span>
          <h2 id="modal-title" tabIndex={-1} data-autofocus>{item.title}</h2>
          <p><Lines text={item.description} /></p>
        </div>
        <div className="onboarding-dots" aria-hidden="true">{ONBOARDING_STEPS.map((_, i) => <span key={i} className={i === step ? 'active' : ''} />)}</div>
      </div>
      <div className="modal-footer onboarding-footer">
        {step ? <button type="button" className="secondary" data-action="onboarding-previous" onClick={() => showOnboarding(step - 1, beforeLogin)}>이전</button> : null}
        <button type="button" className="primary" data-action={last ? 'onboarding-finish' : 'onboarding-next'} onClick={() => (last ? finishOnboarding(true) : showOnboarding(step + 1, beforeLogin))}>
          {last ? (beforeLogin ? '시작하기' : currentProfile() ? 'PICK 둘러보기' : '내 정보 입력하기') : '다음'}
        </button>
      </div>
    </>
  );
}
