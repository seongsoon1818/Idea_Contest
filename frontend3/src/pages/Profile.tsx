import { Icon, ProviderSymbol } from '../lib/icons';
import { cat } from '../lib/data';
import type { Profile } from '../lib/live';
import { getAccountUser } from '../lib/session';
import { useUI } from '../app/store';
import { accountDialog, navigate, openLogin, openModal, startProfile } from '../app/actions';
import { notificationCenter, enablePush, markNotificationsRead, updateNotificationSetting } from '../app/notifications';
import { toast } from '../app/actions';
import { gradeLabel } from '../components/format';
import { CampusTownCard } from '../components/CampusTownCard';
import { PageTitle } from './Home';

export function NotificationSettings() {
  const { notificationBusy, pushEnabled } = useUI();
  const settings = notificationCenter.state.settings;
  const rows: ['deadline' | 'recommendation', string, string][] = [
    ['deadline', '마감 알림', '저장한 PICK의 마감 하루 전, 한 번만'],
    ['recommendation', '맞춤 알림', '새로운 맞춤 소식을 하루 한 번 모아서'],
  ];
  return (
    <section className="account-management notification-settings" aria-labelledby="notification-settings-title">
      <h2 id="notification-settings-title">알림 설정</h2>
      <div className="profile-card management-menu">
        {rows.map(([key, title, description]) => (
          <label key={key} className="notification-setting-row">
            <span className="management-menu-copy"><span className="management-menu-title">{title}</span><span className="management-menu-description">{description}</span></span>
            <span className="notification-switch">
              <input type="checkbox" role="switch" data-notification-setting={key} aria-label={title} checked={settings[key]} disabled={notificationBusy}
                onChange={(e) => void updateNotificationSetting(key, e.target.checked)} />
              <span aria-hidden="true" />
            </span>
          </label>
        ))}
        <div className="notification-push-row">
          <div><b>웹 푸시 알림</b><p id="push-status">{pushEnabled ? '이 브라우저에서 알림을 받을 수 있어요.' : globalThis.Notification?.permission === 'denied' ? '브라우저 설정에서 알림 허용이 필요해요.' : '사이트 밖에서도 마감과 맞춤 소식을 받아보세요.'}</p></div>
          <button type="button" className="secondary push-enable" data-action="notification-push" disabled={notificationBusy} onClick={() => void enablePush()}>{pushEnabled ? '끄기' : '켜기'}</button>
        </div>
      </div>
      <p className="notification-settings-note">매일 오전 9시 기준 · 새로운 추천이 없으면 보내지 않아요.<br />푸시를 꺼도 켜둔 종류의 알림은 알림함에 남아요.</p>
    </section>
  );
}

export function ProfilePage({ profile }: { profile: Profile | null }) {
  if (!getAccountUser()) {
    return (
      <>
        <div className="section-head"><div><PageTitle label="MY PAGE" icon="user" /></div></div>
        <section className="account-management profile-information" aria-labelledby="profile-information-title">
          <h2 id="profile-information-title">내 정보</h2>
          <div className="profile-card management-menu profile-summary-card">
            <p className="account-description profile-empty-copy">로그인하고 이름과 학년·트랙·관심 분야를 알려주세요.</p>
            <div className="profile-edit-actions"><button className="primary" data-login-action="open" onClick={openLogin}>로그인하기 <Icon name="arrow" /></button></div>
          </div>
        </section>
        <CampusTownCard variant="profile" />
        <NotificationSettings />
      </>
    );
  }
  const rows: [string, React.ReactNode][] = profile ? [
    ['이름', profile.name || '아직 입력하지 않았어요'],
    ['학년', gradeLabel(profile.grade)],
    ['트랙', profile.tracks.filter(Boolean).map((t) => <span key={t} className="profile-tag track-profile-tag">{t}</span>)],
    ['관심 분야', profile.interests.map((id) => <span key={id} className="profile-tag">{cat(id)?.name}</span>)],
  ] : [];
  return (
    <>
      <div className="section-head"><div><PageTitle label="MY PAGE" icon="user" /></div></div>
      <section className="account-management profile-information" aria-labelledby="profile-information-title">
        <h2 id="profile-information-title">내 정보</h2>
        <div className="profile-card management-menu profile-summary-card">
          {profile ? (
            <dl className="profile-dl profile-summary-list">
              {rows.map(([title, value]) => <div key={title} className="profile-summary-row"><dt>{title}</dt><dd>{value}</dd></div>)}
            </dl>
          ) : <p className="account-description profile-empty-copy">이름과 학년·트랙·관심 분야를 알려주세요.</p>}
          <div className="profile-edit-actions"><button className="primary" data-action="profile" onClick={startProfile}>{profile ? '내 정보 수정' : '내 정보 입력하기'} <Icon name="arrow" /></button></div>
        </div>
      </section>
      <CampusTownCard variant="profile" />
      <NotificationSettings />
      <section className="account-management login-settings-card" aria-labelledby="login-management-title">
        <h2 id="login-management-title">로그인 관리</h2>
        <div className="profile-card management-menu">
          <button type="button" className="account-row management-menu-row compact-menu-row social-settings-row" data-action="account-social" aria-haspopup="dialog" onClick={() => accountDialog('social')}>
            <span className="management-menu-copy"><span className="management-menu-title">소셜 계정 연결</span></span>
            <span className="account-provider-icons" aria-hidden="true">
              <span className="provider-symbol kakao-symbol"><ProviderSymbol id="kakao" /></span><span className="provider-symbol google-symbol"><ProviderSymbol id="google" /></span>
            </span>
          </button>
          <button type="button" className="account-row management-menu-row compact-menu-row" data-action="account-password" aria-haspopup="dialog" onClick={() => accountDialog('password')}>
            <span className="management-menu-copy"><span className="management-menu-title">비밀번호 변경</span></span><Icon name="chevron" />
          </button>
        </div>
      </section>
      <section className="account-management" aria-labelledby="account-management-title">
        <h2 id="account-management-title">추천 및 계정 관리</h2>
        <div className="profile-card management-menu">
          <button type="button" className="management-menu-row" data-action="reset-confirm" aria-haspopup="dialog" onClick={() => openModal({ kind: 'reset-profile' })}>
            <span className="management-menu-copy"><span className="management-menu-title">추천정보 다시 설정</span><span className="management-menu-description">학년·트랙·관심 분야</span></span><Icon name="chevron" />
          </button>
          <button type="button" className="management-menu-row" data-action="account-delete" aria-haspopup="dialog" onClick={() => accountDialog('delete')}>
            <span className="management-menu-copy"><span className="management-menu-title">회원 탈퇴</span><span className="management-menu-description">계정·내 정보·MY PICK 삭제</span></span><Icon name="chevron" />
          </button>
        </div>
      </section>
    </>
  );
}

export function NotificationPage() {
  const { notificationBusy } = useUI();
  const entries = notificationCenter.state.entries, unread = entries.some((n) => !n.read);
  const date = (value: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  const open = async (id: string) => {
    const entry = notificationCenter.state.entries.find((n) => n.id === id);
    if (!entry) return;
    await markNotificationsRead([id]);
    if (entry.type === 'recommendation') { navigate('recommend'); return; }
    // Connected mode has no local item list for deadline entries (unchanged from frontend2).
    toast('더 이상 제공되지 않는 소식이에요.');
  };
  return (
    <>
      <div className="section-head notification-page-head">
        <div><PageTitle label="알림" icon="bell" /><p>놓치지 않도록, 나의 PICK 소식을 모았어요.</p></div>
        <button type="button" className="notification-settings-link" data-action="notification-settings"
          onClick={() => { navigate('profile'); requestAnimationFrame(() => document.querySelector('#notification-settings-title')?.scrollIntoView({ block: 'start' })); }}>
          <Icon name="settings" /><span>설정</span>
        </button>
      </div>
      <section className="notification-panel" aria-label="받은 알림">
        <div className="notification-list-head"><span>최근 알림</span>
          <button type="button" data-action="notification-read-all" disabled={!unread || notificationBusy} onClick={() => void markNotificationsRead(entries.filter((n) => !n.read).map((n) => n.id))}>모두 읽음</button>
        </div>
        {entries.length ? (
          <ul className="notification-list">
            {entries.map((n) => (
              <li key={n.id}>
                <button type="button" className={`notification-item ${n.read ? 'is-read' : 'is-unread'}`} data-action="notification-open" data-id={n.id} onClick={() => void open(n.id)}>
                  <span className="notification-type-icon"><Icon name={n.type === 'deadline' ? 'clock' : 'spark'} /></span>
                  <span className="notification-copy">
                    <span className="notification-type">{n.type === 'deadline' ? '마감 알림' : '맞춤 알림'}{!n.read ? <span className="notification-unread" aria-label="읽지 않음" /> : null}</span>
                    <strong>{n.title}</strong><span className="notification-body">{n.body}</span><time dateTime={n.createdAt}>{date(n.createdAt)}</time>
                  </span>
                  <Icon name="chevron" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="notification-empty"><Icon name="bell" /><h2>아직 도착한 알림이 없어요</h2><p>저장한 PICK의 마감 소식과<br />새로운 맞춤 소식을 여기서 확인하세요.</p>
            <button className="secondary" data-action="go-saved" onClick={() => navigate('saved')}>MY PICK 보기</button></div>
        )}
      </section>
    </>
  );
}
