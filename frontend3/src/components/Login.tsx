import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ProviderSymbol } from '../lib/icons';
import { usernameError, passwordError, confirmationError } from '../lib/authRules';
import { useUI } from '../app/store';
import { authFocus, authenticate, browse, openSignup, restoreAccount, returnToLogin } from '../app/actions';

const BackArrow = () => <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 12H4m7-7-7 7 7 7" /></svg>;

function unavailableMessage(kind: string) {
  return kind === 'find-id' ? '아이디 찾기는 계정 서비스 연결 후 이용할 수 있어요.'
    : kind === 'find-password' ? '비밀번호 찾기는 계정 서비스 연결 후 이용할 수 있어요.'
      : `${kind === 'kakao' ? '카카오' : '구글'} 로그인 연결을 준비 중이에요. 지금은 로그인 없이 둘러볼 수 있어요.`;
}

export function LoginScreen() {
  const s = useUI();
  const signup = s.auth === 'signup', connection = s.auth === 'pending' || s.auth === 'retry';
  const titleRef = useRef<HTMLHeadingElement>(null);
  const prevAuth = useRef(s.auth);
  const retried = useRef(false);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [invalid, setInvalid] = useState<{ id?: boolean; password?: boolean }>({});
  const [feedback, setFeedback] = useState('');
  const [form, setForm] = useState({ name: '', id: '', password: '', confirm: '' });
  const [shown, setShown] = useState({ password: false, confirm: false });
  const [nameError, setNameError] = useState('');
  const [touched, setTouched] = useState(false);
  const [idTaken, setIdTaken] = useState('');
  const [signupFeedback, setSignupFeedback] = useState('');
  const fieldRefs = { id: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null), confirm: useRef<HTMLInputElement>(null), name: useRef<HTMLInputElement>(null), loginId: useRef<HTMLInputElement>(null), loginPassword: useRef<HTMLInputElement>(null) };

  // Every time the gate opens, start from a clean form (same as showLogin()).
  useEffect(() => {
    setPassword(''); setPasswordVisible(false); setInvalid({}); setFeedback(s.authMessage);
    setForm({ name: '', id: '', password: '', confirm: '' }); setShown({ password: false, confirm: false }); setNameError(''); setTouched(false); setIdTaken(''); setSignupFeedback('');
    // Like frontend2: a session check on page load shows the gate without moving focus;
    // explicit opens, failed retries and error messages still focus the title.
    const prev = prevAuth.current; prevAuth.current = s.auth;
    if (prev === 'retry' && s.auth === 'pending') retried.current = true;
    const fromRestore = prev === 'pending' && s.auth === 'login' && !s.authMessage && !retried.current;
    if (s.auth !== 'pending') retried.current = false;
    const fromNavigation = authFocus.skipNext; authFocus.skipNext = false;
    if (s.auth !== 'hidden' && s.auth !== 'welcome' && s.auth !== 'pending' && !fromRestore && !fromNavigation) titleRef.current?.focus();
  }, [s.auth, s.authMessage]);

  const errors = [idTaken || usernameError(form.id), passwordError(form.password), confirmationError(form.password, form.confirm)];
  const shownError = (i: number, value: string) => (touched || value ? errors[i] : '');
  const offline = !s.online;

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (s.authBusy || connection) return;
    setInvalid({});
    if (!loginId.trim()) { setInvalid({ id: true }); setFeedback('아이디를 입력해 주세요.'); fieldRefs.loginId.current?.focus(); return; }
    if (!password) { setInvalid({ password: true }); setFeedback('비밀번호를 입력해 주세요.'); fieldRefs.loginPassword.current?.focus(); return; }
    setFeedback('');
    const result = await authenticate('login', { loginId: loginId.trim(), password });
    if (result.message) setFeedback(result.message);
  };
  const submitSignup = async (e: FormEvent) => {
    e.preventDefault();
    if (s.authBusy || connection) return;
    if (!form.name.trim()) { setNameError('이름을 입력해 주세요.'); fieldRefs.name.current?.focus(); return; }
    setNameError('');
    setTouched(true);
    const first = errors.findIndex(Boolean);
    if (first !== -1) { [fieldRefs.id, fieldRefs.password, fieldRefs.confirm][first].current?.focus(); return; }
    setSignupFeedback('');
    const result = await authenticate('signup', { loginId: form.id.trim(), password: form.password, name: form.name.trim() });
    if (result.message) {
      setSignupFeedback(result.message);
      if (result.code === 'LOGIN_ID_TAKEN') { setIdTaken(result.message); fieldRefs.id.current?.focus(); }
    }
  };
  const updateSignup = (patch: Partial<typeof form>) => { setForm({ ...form, ...patch }); setSignupFeedback(''); if (patch.id !== undefined) setIdTaken(''); };
  const busy = s.authBusy;

  return (
    <section id="login-screen" className="login-screen" aria-labelledby="login-title" hidden={s.auth === 'hidden' || s.auth === 'welcome'}>
      <div className="login-intro">
        <img src="assets/hsu-pick-logo.png" width={160} height={87} alt="HSU PICK" />
        <h2>나에게 맞는 기회,<br />한성 PICK!</h2><p>공지사항과 비교과프로그램을<br />한곳에서 확인하세요.</p>
        <div className="login-intro-decoration" aria-hidden="true"><span>✦</span><span>✦</span><span>✦</span></div>
      </div>
      <header className="login-header">
        <button type="button" className="login-back" data-login-action="back" aria-label={signup ? '로그인으로 돌아가기' : '로그인 없이 둘러보기'} hidden={connection}
          onClick={() => (signup ? returnToLogin() : browse())}><BackArrow /></button>
        <h1 id="login-title" tabIndex={-1} ref={titleRef}>{connection ? (s.auth === 'pending' ? '연결 확인 중' : '연결을 확인해 주세요') : signup ? '회원가입' : 'LOGIN'}</h1>
      </header>
      <div className="login-content">
        <img className="login-logo" src="assets/hsu-pick-logo.png" width={108} height={59} alt="HSU PICK" />
        <div id="session-connection" className="session-connection" hidden={!connection}>
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0m-9 3a4.5 4.5 0 0 1 6 0m-3 3h.01" /></svg>
          <p id="session-connection-status" role="status" aria-atomic="true">
            {s.auth === 'pending' ? '로그인 상태를 확인하고 있어요.' : offline ? '인터넷에 연결되어 있지 않아요. 연결을 확인하고 다시 시도해 주세요.' : '서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'}
          </p>
          <button type="button" className="login-submit" data-login-action="retry-session" hidden={s.auth !== 'retry'} onClick={() => void restoreAccount()}>다시 연결하기</button>
        </div>
        <div id="login-panel" hidden={signup || connection}>
          <form id="login-form" className="login-form" noValidate aria-busy={busy} onSubmit={submitLogin}>
            <label className="login-field"><span className="visually-hidden">아이디</span>
              <input id="login-id" ref={fieldRefs.loginId} name="username" type="text" placeholder="아이디" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={100}
                aria-describedby="login-feedback" aria-invalid={!!invalid.id} value={loginId} onChange={(e) => setLoginId(e.target.value)} />
            </label>
            <label className="login-field login-password-field"><span className="visually-hidden">비밀번호</span>
              <input id="login-password" ref={fieldRefs.loginPassword} name="password" type={passwordVisible ? 'text' : 'password'} placeholder="비밀번호" autoComplete="current-password" required maxLength={256}
                aria-describedby="login-feedback" aria-invalid={!!invalid.password} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="password-toggle" data-login-action="toggle-password" aria-label={passwordVisible ? '비밀번호 숨기기' : '비밀번호 표시'} aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible(!passwordVisible)}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" /><path className="eye-slash" d="M3 3l18 18" /></svg>
              </button>
            </label>
            <button type="submit" className="login-submit" disabled={busy}>로그인하기</button>
          </form>
          <div className="login-social"><h2>SNS 계정으로 로그인하기</h2><div className="login-providers">
            {(['kakao', 'google'] as const).map((id) => (
              <button key={id} type="button" className="login-provider" data-login-action={id} aria-label={`${id === 'kakao' ? '카카오' : '구글'}로 로그인`}
                onClick={() => { setPassword(''); setFeedback(unavailableMessage(id)); }}>
                <span className={`provider-symbol ${id}-symbol`}><ProviderSymbol id={id} /></span><span>{id === 'kakao' ? '카카오' : '구글'}</span>
              </button>
            ))}
          </div></div>
          <p id="login-feedback" className="login-feedback" role="status" aria-live="polite">{feedback}</p>
        </div>
        <div id="signup-panel" hidden={!signup || connection}>
          <form id="signup-form" className="signup-form" noValidate aria-busy={busy} onSubmit={submitSignup}>
            <div className="signup-group signup-name-group">
              <label className="signup-label" htmlFor="signup-name">이름</label>
              <div className="login-field"><input id="signup-name" ref={fieldRefs.name} name="displayName" type="text" placeholder="이름" autoComplete="name" maxLength={30} aria-describedby="signup-name-error"
                aria-invalid={!!nameError} value={form.name} onChange={(e) => updateSignup({ name: e.target.value })} /></div>
              <p id="signup-name-error" className="signup-error" aria-live="polite">{nameError}</p>
            </div>
            <div className="signup-group">
              <label className="signup-label" htmlFor="signup-id">아이디</label><p id="signup-id-hint" className="signup-hint">영문·숫자만 사용할 수 있어요.</p>
              <div className="login-field"><input id="signup-id" ref={fieldRefs.id} name="username" type="text" placeholder="영문·숫자 4~20자" autoComplete="username" autoCapitalize="none" spellCheck={false}
                minLength={4} maxLength={20} required aria-describedby="signup-id-hint signup-id-error" aria-invalid={!!shownError(0, form.id)} value={form.id} onChange={(e) => updateSignup({ id: e.target.value })} /></div>
              <p id="signup-id-error" className="signup-error" aria-live="polite">{shownError(0, form.id)}</p>
            </div>
            {([['password', 'signup-password', '비밀번호', '영문·숫자·특수문자 포함 8~32자', 1], ['confirm', 'signup-confirm', '비밀번호 확인', '비밀번호를 다시 입력해 주세요', 2]] as const).map(([key, id, label, placeholder, index]) => (
              <div key={key} className="signup-group">
                <label className="signup-label" htmlFor={id}>{label}</label>
                {key === 'password' ? <p id="signup-password-hint" className="signup-hint">영문·숫자·특수문자를 각각 1개 이상 포함해 주세요.</p> : null}
                <div className="login-field login-password-field">
                  <input id={id} ref={fieldRefs[key]} name={key === 'password' ? 'password' : 'passwordConfirm'} type={shown[key] ? 'text' : 'password'} placeholder={placeholder} autoComplete="new-password"
                    minLength={key === 'password' ? 8 : undefined} maxLength={32} required aria-describedby={key === 'password' ? 'signup-password-hint signup-password-error' : 'signup-confirm-error'}
                    aria-invalid={!!shownError(index, form[key])} value={form[key]} onChange={(e) => updateSignup({ [key]: e.target.value })} />
                  <button type="button" className="signup-password-toggle" data-login-action="toggle-signup-password" data-target={id} aria-pressed={shown[key]}
                    aria-label={`${key === 'confirm' ? '비밀번호 확인' : '비밀번호'} ${shown[key] ? '숨기기' : '표시'}`} onClick={() => setShown({ ...shown, [key]: !shown[key] })}>{shown[key] ? '숨기기' : '보기'}</button>
                </div>
                <p id={`${id}-error`} className="signup-error" aria-live="polite">{shownError(index, form[key])}</p>
              </div>
            ))}
            <button type="submit" className="login-submit" disabled={busy}>회원가입하기</button>
          </form>
          <p id="signup-feedback" className="login-feedback" role="status" aria-live="polite">{signupFeedback}</p>
          <button type="button" className="login-signup" data-login-action="login" onClick={returnToLogin}>로그인으로 돌아가기</button>
        </div>
      </div>
      <footer className="login-help" hidden={signup || connection}>
        <button type="button" className="login-guest" data-login-action="guest" onClick={() => browse()}>로그인 없이 둘러보기</button>
        <button type="button" className="login-signup" data-login-action="signup" onClick={openSignup}>회원가입하기</button>
        <div className="login-recovery">
          <button type="button" data-login-action="find-id" onClick={() => { setPassword(''); setFeedback(unavailableMessage('find-id')); }}>아이디 찾기</button><span aria-hidden="true" />
          <button type="button" data-login-action="find-password" onClick={() => { setPassword(''); setFeedback(unavailableMessage('find-password')); }}>비밀번호 찾기</button>
        </div>
      </footer>
    </section>
  );
}

/** Body classes and inert surfaces while the login gate is shown. */
export function useLoginGate(surfaces: (HTMLElement | null)[], dialog: HTMLElement | null) {
  const { auth } = useUI();
  // Layout effect: inert must be cleared before ModalHost focuses the opened dialog (a passive effect),
  // otherwise the welcome guide opens without focus (frontend2 focuses its title).
  useLayoutEffect(() => {
    document.body.classList.toggle('login-view', auth !== 'hidden');
    document.body.classList.toggle('welcome-view', auth === 'welcome');
    surfaces.forEach((el) => { if (el) el.inert = auth !== 'hidden'; });
    // The welcome guide is a dialog shown over the gate, so only the dialog stays usable.
    if (dialog) dialog.inert = auth !== 'hidden' && auth !== 'welcome';
  });
}
