import {usernameError,passwordError,confirmationError} from './auth-rules.js?v=1.16.54';
import {campusApi, usesCampusApi} from './account-api.js?v=3';
import {getAccountUser,setAccountSession} from './account-session.js?v=1.16.73';
// Local development uses a same-origin proxy; production can opt in after deployment.
const accountApi=usesCampusApi()?campusApi:null;
// Browsing permission is a per-tab preview preference, never an authenticated session.
const screen=document.querySelector('#login-screen');
const form=document.querySelector('#login-form');
const username=document.querySelector('#login-id');
const password=document.querySelector('#login-password');
const feedback=document.querySelector('#login-feedback');
const loginTitle=document.querySelector('#login-title');
const loginPanel=document.querySelector('#login-panel');
const signupPanel=document.querySelector('#signup-panel');
const loginHelp=document.querySelector('.login-help');
const loginBack=document.querySelector('.login-back');
const connectionPanel=document.querySelector('#session-connection');
const connectionStatus=document.querySelector('#session-connection-status');
const retryConnection=document.querySelector('[data-login-action="retry-session"]');
const signupForm=document.querySelector('#signup-form');
const signupName=document.querySelector('#signup-name');
const signupId=document.querySelector('#signup-id');
const signupPassword=document.querySelector('#signup-password');
const signupConfirm=document.querySelector('#signup-confirm');
const signupFields=[signupId,signupPassword,signupConfirm];
const isAuthHash=hash=>hash==='#login'||hash==='#signup';
let signupMode=false;
const surfaces=['.sidebar','.workspace','.mobile-nav','#compare-tray','#modal'].map(s=>document.querySelector(s));
const GUEST_KEY='hsupick-browse-this-tab';
let browsing=false,welcomeActive=false,connectionPhase=null;
let passwordVisible=false;
let returnHash=location.hash&&!isAuthHash(location.hash)?location.hash:'#recommend';
try{browsing=sessionStorage.getItem(GUEST_KEY)==='1';}catch{}
function message(text){feedback.textContent=text;}
function resetSignup(){signupName.value='';signupName.setAttribute('aria-invalid','false');document.querySelector('#signup-name-error').textContent='';
 signupFields.forEach(el=>{el.value='';el.setAttribute('aria-invalid','false');document.querySelector(`#${el.id}-error`).textContent='';});
 [signupPassword,signupConfirm].forEach(el=>el.setAttribute('type','password'));
 document.querySelectorAll('.signup-password-toggle').forEach(el=>{el.textContent='보기';el.setAttribute('aria-pressed','false');el.setAttribute('aria-label',el.dataset.target==='signup-confirm'?'비밀번호 확인 표시':'비밀번호 표시');});
 document.querySelector('#signup-feedback').textContent='';
}
function showAccountGate(){
 welcomeActive=false;document.body.classList.remove('welcome-view');
 const modal=document.querySelector('#modal');if(modal?.open)modal.close();
 screen.hidden=false;document.body.classList.add('login-view');
 surfaces.forEach(el=>{if(el)el.inert=true;});
}
function clearConnection(){connectionPhase=null;connectionPanel.hidden=true;}
function showLogin(){
 clearConnection();
 if(location.hash&&!isAuthHash(location.hash))returnHash=location.hash;
 if(!isAuthHash(location.hash))history.replaceState(null,'','#login');
 showAccountGate();
 signupMode=location.hash==='#signup';
 loginPanel.hidden=signupMode;signupPanel.hidden=!signupMode;loginHelp.hidden=signupMode;loginBack.hidden=false;
 loginTitle.textContent=signupMode?'회원가입':'LOGIN';
 loginBack.setAttribute('aria-label',signupMode?'로그인으로 돌아가기':'로그인 없이 둘러보기');
 resetSignup();
 password.value='';passwordVisible=false;password.setAttribute('type','password');
 const toggle=document.querySelector('.password-toggle');
 toggle.setAttribute('aria-pressed','false');toggle.setAttribute('aria-label','비밀번호 표시');
 message('');window.scrollTo({top:0,behavior:'instant'});
}
function returnToLogin(){
 if(location.hash==='#signup'&&history.state?.hsuAuth?.from==='login'){history.back();return;}
 history.replaceState(null,'','#login');showLogin();document.querySelector('#login-title')?.focus();
}
function browse({authenticated=false,restoreRoute=false}={}){
 clearConnection();
 browsing=!authenticated;
 try{if(authenticated)sessionStorage.removeItem(GUEST_KEY);else sessionStorage.setItem(GUEST_KEY,'1');}catch{}
 username.value='';password.value='';resetSignup();message('');screen.hidden=true;
 document.body.classList.remove('login-view');surfaces.forEach(el=>{if(el)el.inert=false;});
 if(isAuthHash(location.hash)){history.replaceState(null,'',returnHash);restoreRoute=true;}
 if(restoreRoute)window.dispatchEvent(new Event('hashchange'));
 window.dispatchEvent(new Event('resize'));
 document.querySelector('#main')?.focus();window.scrollTo({top:0,behavior:'instant'});
 window.dispatchEvent(new Event('hsu-app-enter'));
}
function unavailable(kind){
 password.value='';
 message(kind==='signup'?'회원가입 기능을 준비 중이에요. 지금은 로그인 없이 둘러볼 수 있어요.':kind==='find-id'?'아이디 찾기는 계정 서비스 연결 후 이용할 수 있어요.':kind==='find-password'?'비밀번호 찾기는 계정 서비스 연결 후 이용할 수 있어요.':`${kind==='kakao'?'카카오':'구글'} 로그인 연결을 준비 중이에요. 지금은 로그인 없이 둘러볼 수 있어요.`);
}
function validateSignup(showEmpty=false){
 const errors=[usernameError(signupId.value),passwordError(signupPassword.value),confirmationError(signupPassword.value,signupConfirm.value)];
 signupFields.forEach((el,i)=>{const error=showEmpty||el.value?errors[i]:'';el.setAttribute('aria-invalid',String(Boolean(error)));document.querySelector(`#${el.id}-error`).textContent=error;});
 return errors;
}
signupForm.addEventListener('input',()=>{validateSignup();document.querySelector('#signup-feedback').textContent='';});
let accountBusy=false;
function setAccountBusy(busy){
 accountBusy=busy;
 for(const f of [form,signupForm]){
  f.setAttribute('aria-busy',String(busy));
  for(const button of f.querySelectorAll('button[type="submit"]'))button.disabled=busy;
 }
}
function enterAccount(user,{restored=false}={}){
 setAccountSession({user,logout:()=>accountApi.logout()});
 browse({authenticated:true,restoreRoute:restored});
}
async function authenticate(kind,input,feedbackElement){
 if(accountBusy)return;
 setAccountBusy(true);feedbackElement.textContent='';
 try{
  const user=await accountApi.authenticate(kind,input);
  enterAccount(user);
 }catch(error){
  feedbackElement.textContent=error.message;
  if(kind==='signup'&&error.code==='LOGIN_ID_TAKEN'){
   signupId.setAttribute('aria-invalid','true');
   document.querySelector('#signup-id-error').textContent=error.message;
   signupId.focus();
  }
 }finally{setAccountBusy(false);}
}
signupForm.addEventListener('submit',event=>{
 event.preventDefault();if(accountBusy||connectionPhase)return;if(!signupName.value.trim()){signupName.setAttribute('aria-invalid','true');document.querySelector('#signup-name-error').textContent='이름을 입력해 주세요.';signupName.focus();return;}signupName.setAttribute('aria-invalid','false');document.querySelector('#signup-name-error').textContent='';const errors=validateSignup(true);const invalid=errors.findIndex(Boolean);
 if(invalid!==-1){signupFields[invalid].focus();return;}
 if(accountApi){
  void authenticate('signup',{loginId:signupId.value.trim(),password:signupPassword.value,name:signupName.value.trim()},document.querySelector('#signup-feedback'));
  return;
 }
 // No fake registration or local credential storage when the server is unavailable.
 signupPassword.value='';signupConfirm.value='';
 document.querySelector('#signup-feedback').textContent='입력 규칙을 확인했어요. 계정 서버가 아직 연결되지 않아 회원가입을 완료할 수 없어요.';
});
form.addEventListener('submit',event=>{
 event.preventDefault();
 if(accountBusy||connectionPhase)return;
 username.setAttribute('aria-invalid','false');password.setAttribute('aria-invalid','false');
 if(!username.value.trim()){username.setAttribute('aria-invalid','true');message('아이디를 입력해 주세요.');username.focus();return;}
 if(!password.value){password.setAttribute('aria-invalid','true');message('비밀번호를 입력해 주세요.');password.focus();return;}
 if(accountApi){
  void authenticate('login',{loginId:username.value.trim(),password:password.value},feedback);
  return;
 }
 password.value='';message('로그인 연결을 준비 중이에요. 지금은 로그인 없이 둘러볼 수 있어요.');
});
document.addEventListener('click',event=>{
 const control=event.target.closest('[data-login-action]');if(!control)return;
 const action=control.dataset.loginAction;
 if(accountBusy)return;
 if(connectionPhase){if(action==='retry-session')void restoreAccount();return;}
 if(action==='guest')browse();
 else if(action==='signup'){
  history.pushState({hsuAuth:{from:'login'}},'','#signup');showLogin();document.querySelector('#login-title')?.focus();
 }
 else if(action==='login'||(action==='back'&&signupMode))returnToLogin();
 else if(action==='back')browse();
 else if(action==='open'){if(location.hash&&!isAuthHash(location.hash))returnHash=location.hash;history.pushState(null,'','#login');showLogin();document.querySelector('#login-title')?.focus();}
 else if(action==='toggle-signup-password'){
  const field=document.querySelector(`#${control.dataset.target}`);const visible=field.getAttribute('type')!=='text';
  field.setAttribute('type',visible?'text':'password');control.setAttribute('aria-pressed',String(visible));control.textContent=visible?'숨기기':'보기';control.setAttribute('aria-label',`${control.dataset.target==='signup-confirm'?'비밀번호 확인':'비밀번호'} ${visible?'숨기기':'표시'}`);
 }
 else if(action==='toggle-password'){
  passwordVisible=!passwordVisible;
  password.setAttribute('type',passwordVisible?'text':'password');
  control.setAttribute('aria-pressed',String(passwordVisible));control.setAttribute('aria-label',passwordVisible?'비밀번호 숨기기':'비밀번호 표시');
 }else unavailable(action);
});
function welcomeOrLogin(){
 let seen=false;try{seen=localStorage.getItem('hsupick-onboarding-v2')==='1';}catch{}
 if(seen||location.hash==='#signup'){showLogin();return;}
 // Prepare the login gate underneath, then show the guide instead of its fields.
 showLogin();welcomeActive=true;screen.hidden=true;document.body.classList.add('welcome-view');
 const dialog=document.querySelector('#modal');if(dialog)dialog.inert=false;
 window.dispatchEvent(new Event('hsu-onboarding-start'));
}
const isOffline=()=>globalThis.navigator?.onLine===false;
function updateConnectionStatus(){
 if(connectionPhase!=='retry')return;
 connectionStatus.textContent=isOffline()?'인터넷에 연결되어 있지 않아요. 연결을 확인하고 다시 시도해 주세요.':'서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
function showConnection(phase){
 if(!connectionPhase){showAccountGate();window.scrollTo({top:0,behavior:'instant'});}
 connectionPhase=phase;
 loginPanel.hidden=true;signupPanel.hidden=true;loginHelp.hidden=true;loginBack.hidden=true;
 connectionPanel.hidden=false;retryConnection.hidden=phase==='pending';
 loginTitle.textContent=phase==='pending'?'연결 확인 중':'연결을 확인해 주세요';
 if(phase==='pending')connectionStatus.textContent='로그인 상태를 확인하고 있어요.';
 else{updateConnectionStatus();loginTitle.focus();}
}
async function restoreAccount(){
 if(accountBusy)return;
 if(isOffline()){showConnection('retry');return;}
 const retrying=connectionPhase==='retry';
 setAccountBusy(true);showConnection('pending');
 let user;
 try{
  user=await accountApi.restore();
 }catch(error){
  if(error.status===401&&['INVALID_REFRESH_TOKEN','SESSION_REVOKED'].includes(error.code)){
   welcomeOrLogin();if(retrying&&!welcomeActive)loginTitle.focus();
  }else if(error.status===403&&error.code==='ACCOUNT_DISABLED'){
   showLogin();message(error.message);loginTitle.focus();
  }else showConnection('retry');
  return;
 }finally{setAccountBusy(false);}
 enterAccount(user,{restored:true});
}
window.addEventListener('online',()=>{if(connectionPhase==='retry')connectionStatus.textContent='인터넷에 다시 연결됐어요. 로그인 상태를 다시 확인해 주세요.';});
window.addEventListener('offline',updateConnectionStatus);
window.addEventListener('hsu-onboarding-complete',()=>{welcomeActive=false;showLogin();document.querySelector('#login-title')?.focus();});
function handleAuthNavigation(){
 if(connectionPhase){const modal=document.querySelector('#modal');if(modal?.open)modal.close();return;}
 if(welcomeActive){welcomeActive=false;showLogin();return;}
 if(getAccountUser()){if(isAuthHash(location.hash)||!screen.hidden)browse({authenticated:true});}
 else if(isAuthHash(location.hash)||!browsing)showLogin();else if(!screen.hidden)browse();
}
window.addEventListener('hashchange',handleAuthNavigation);
window.addEventListener('popstate',handleAuthNavigation);
if(accountApi&&!browsing)void restoreAccount();
else if(!browsing||isAuthHash(location.hash))welcomeOrLogin();else browse();

window.addEventListener('hsu-session-expired',()=>{if(getAccountUser())setAccountSession(null);});
// The adapter emits this only after the server logout request succeeds.
window.addEventListener('hsu-signout',()=>{browsing=false;try{sessionStorage.removeItem(GUEST_KEY);}catch{}returnHash='#recommend';history.replaceState(null,'','#login');showLogin();});
