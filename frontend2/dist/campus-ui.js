import {campusApi} from './account-api.js?v=3';
import {getAccountUser,setAccountSession} from './account-session.js?v=1.16.73';
import {CampusStore} from './campus-store.js';
import {escapeHtml as h,refKey,parseRef,listPath,cardHtml,detailHtml,documentHtml,comparisonHtml,officialLink} from './campus-content.js';
import {profileSummary,profileForm,profilePayload,unitFields,securityForm,securityPayload} from './campus-fields.js';

const control=(action,label,id='',cls='secondary')=>`<button type="button" class="${cls}" data-action="${action}" data-id="${h(id)}">${h(label)}</button>`;
const loginPrompt=()=>'<p class="empty">로그인 후 이용할 수 있어요. <button class="primary" data-login-action="open">로그인</button></p>';
const panel=(html)=>`<div class="modal-content">${html}</div>`;
function pager(p,action) {
 if(p.totalPages<2)return '';
 return `<nav class="result-line" aria-label="페이지 이동">${p.page>1?control(action,'이전',p.page-1):''}
 <span>${p.page} / ${p.totalPages}</span>${p.hasNext?control(action,'다음',p.page+1):''}</nav>`;
}
export function createCampusUI({state,render,renderResults,openModal,modalHead,closeFlow,toast,icon}) {
 const store=new CampusStore(), records=new Map(), busy=new Set();
 let page=1, previousFilter='', dialogVersion=0, timer, quickPage=1, session=0;
 const modal=document.querySelector('#modal');
 const current=state;
 const user=()=>getAccountUser();
 function reset() {
  session++; dialogVersion++; records.clear(); busy.clear(); store.invalidate();
  previousFilter=''; page=1; clearTimeout(timer);
 }
 function retry(error) {
  return `<div role="status" class="empty"><p>${h(error.message)}</p>${control('live-retry','다시 시도')}</div>`;
 }
 const loading='<p class="result-line" role="status">불러오는 중…</p>';
 function request(path,changed=render) {return store.read(path,changed);}
 function cards(rows,{recommended=false,bookmarks=false}={}) {
  return rows.map(row=>{
   const card=bookmarks?row.content:row;
   if(!card){
    const key=refKey(row.contentRef);
    records.set(key,{...row.contentRef,bookmark:{saved:true}});
    return `<article class="card"><p>현재 볼 수 없는 ${row.contentRef.type==='notice'?'공지':'프로그램'}입니다.</p>${control('save','MY PICK 해제',key)}</article>`;
   }
   const key=refKey(card);records.set(key,card);
   const markup=cardHtml(card,{selected:current().compared.has(key),recommended,icon});
   if(!bookmarks)return markup;
   return `<div>${markup}${control('live-reminder',row.deadlineReminderEnabled?'마감 알림 끄기':'마감 알림 켜기',key)}</div>`;
  }).join('');
 }
 function list() {
  const {view,type,query,category,sort,openOnly}=current();
  if(view==='saved'&&!user())return loginPrompt();
  const filter=listPath(view,type,{query,category,sort,openOnly});
  if(filter!==previousFilter){previousFilter=filter;page=1;}
  const path=listPath(view,type,{query,category,sort,openOnly,page});
  const entry=request(path,()=>{if(current().view===view) renderResults();});
  if(entry.error && entry.error.code==='PROFILE_REQUIRED')return panel('추천 프로필을 입력하면 내 조건에 맞는 항목을 볼 수 있어요. '+control('profile','프로필 입력'));
  if(entry.error)return retry(entry.error);
  if(entry.pending)return loading;
  const {items,pagination}=entry.data;
  if(page>1&&page>Math.max(1,pagination.totalPages)){
   page=Math.max(1,pagination.totalPages);return list();
  }
  const content=cards(items,{recommended:view==='recommend'||category==='recommended',bookmarks:view==='saved'});
  return `<div class="result-line" role="status">총 ${pagination.totalItems}개의 ${view==='saved'?'MY PICK':'기회'}</div>
   <div class="cards listing-cards">${content||'<p class="empty">조건에 맞는 항목이 없어요.</p>'}</div>${pager(pagination,'live-page')}`;
 }
 function categories(type) {
  const path=`/catalog/${type}-categories`;
  const entry=request(path);
  if(entry.error)return retry(entry.error);
  const filters=[{code:'all',name:'전체'},...(entry.data?.items??[])];
  if(current().view!=='recommend'&&user())filters.unshift({code:'recommended',name:'추천'});
  return filters.map(c=>`<button class="chip ${current().category===c.code?'active':''}" data-category="${h(c.code)}" aria-pressed="${current().category===c.code}">${h(c.name)}</button>`).join('');
 }
 function home() {
  const entry=request('/home');
  if(entry.error)return retry(entry.error);
  if(entry.pending)return loading;
  const {pickCount,urgentCount,bookmarkCount}=entry.data.stats;
  return `<div class="quick-stats">${[['quick-open','모집 중인 PICK',pickCount],['quick-urgent','마감 PICK',urgentCount],['go-saved','MY PICK',bookmarkCount]].map(([a,label,n])=>
   `<button class="stat" data-action="${a}"><span class="stat-caption">${label}</span><strong>${n??'—'}</strong></button>`).join('')}</div>`;
 }
 function asDialog(kind,title,load,body,{wide=false,footer='',after}={}) {
  const version=++dialogVersion;
  openModal(modalHead(title,'')+panel(loading),kind,wide);
  const active=()=>version===dialogVersion&&modal.open&&current().modalView===kind;
  Promise.resolve().then(load).then(data=>{
   if(!active())return;
   const header=data?.card?.title||data?.title||title;
   openModal(modalHead(header,'')+body(data)+footer,kind,wide);
   after?.(data,active);
  }).catch(error=>{if(active())openModal(modalHead(title,'')+panel(h(error.message)+control('live-modal-retry','다시 시도')),kind,wide);});
 }
 function detail(key) {
  const {type,id}=parseRef(key);
  asDialog('detail-'+key,type==='notice'?'공지 상세':'프로그램 상세',()=>campusApi.call(`/${type}s/${id}`),
   d=>{
    records.set(key,d.card);
    return detailHtml(d)+`<div class="modal-footer">${control('toggle-detail-compare',current().compared.has(key)?'비교 해제':'AI 비교하기',key)}
     ${control('save',d.card.bookmark?.saved?'MY PICK 해제':'MY PICK 저장',key,'primary')}${control('detail-back','뒤로가기')}</div>`;
   });
 }
 function source(key) {
  const {id}=parseRef(key);
  asDialog('source-'+key,'공지 내용',async()=>{
   try{return await campusApi.call(`/notices/${id}/content`);}
   catch(e){if(e.code!=='SUMMARY_NOT_READY')throw e;
    const card=records.get(key)??(await campusApi.call(`/notices/${id}`)).card;
    return {unavailable:e.message,originalUrl:card.originalUrl};}
  },d=>d.unavailable?panel(h(d.unavailable)+officialLink(d.originalUrl)):documentHtml(d),
  {footer:`<div class="modal-footer">${control('detail-back','돌아가기')}</div>`});
 }
 function compare() {
  const items=[...current().compared].map(parseRef);
  if(items.length<2||items.length>3)return;
  asDialog('compare','AI 비교하기',()=>campusApi.call('/comparisons',{method:'POST',body:{items}}),
   d=>{for(const item of d.items)records.set(refKey(item.content),item.content);
    return panel(comparisonHtml(d.items,icon));},
   {wide:true,footer:`<div class="modal-footer">${control('complete-compare','비교 완료','','primary')}</div>`});
 }
 function quick(kind,next=1) {
  quickPage=next;
  const params=new URLSearchParams({type:'all',status:'open',page:String(next),size:'20',sort:kind==='urgent'?'deadline':'recommended'});
  if(kind==='urgent')params.set('deadlineWithinDays','3');
  asDialog('quick-list-'+kind,kind==='urgent'?'마감 PICK':'모집 중인 PICK',()=>campusApi.call('/recommendations?'+params),
   d=>panel(`<div class="result-line">총 ${d.pagination.totalItems}개의 기회</div><div class="cards">${cards(d.items,{recommended:true})||'모집 중인 항목이 없습니다.'}</div>${pager(d.pagination,'live-quick-page')}`),{wide:true});
 }
 function myPage() {
  if(!user())return loginPrompt();
  const account=request('/users/me'),profile=request('/users/me/profile');
  if(account.error||profile.error)return retry(account.error||profile.error);
  if(account.pending||profile.pending)return loading;
  return `<div class="section-head"><h1>MY PAGE</h1></div><section class="account-management"><h2>내 정보</h2>
   <div class="profile-card">${profileSummary(account.data,profile.data)}${control('live-account','내 정보 수정')}
   ${control('profile',profile.data.completed?'추천 프로필 수정':'추천 프로필 입력','','primary')}</div></section>`;
 }
 function pageProfile(){
  const p=store.entries.get('/users/me/profile')?.data;
  if(!p?.completed)return null;
  return {name:p.name,grade:p.grade==='OTHER'?'other':Number(p.grade.slice(-1)),tracks:p.academicUnits.map(x=>x.unit.name),interests:p.interests.map(i=>i.code)};
 }
 function formDialog(kind,title,load,body,onSave,onReady) {
  if(!user()){toast('로그인 후 이용해 주세요.');return;}
  asDialog(kind,title,load,body,{after:(data,active)=>{
   const form=modal.querySelector('form');
   onReady?.(form,data);
   form.addEventListener('submit',async event=>{
    event.preventDefault();
    const submit=form.querySelector('[type=submit]');
    if(submit.disabled)return;
    submit.disabled=true;
    const feedback=form.querySelector('[data-feedback]');
    feedback.textContent='';
    try{await onSave(form,active,data);}catch(err){if(active())feedback.textContent=err.message;}
    finally{if(active())submit.disabled=false;}
   });
  }});
 }
 function updated(name,active) {
  store.invalidate();
  const account=user();
  setAccountSession({user:{...account,name},logout:()=>campusApi.logout()});
  if(active())closeFlow('profile');
  render();toast('저장했습니다.');
 }
 function editProfile(accountOnly=false){
  formDialog(accountOnly?'account-edit':'campus-profile',accountOnly?'내 정보 수정':'추천 프로필',()=>Promise.all(['/users/me/profile','/catalog/topics','/catalog/academic-units'].map(path=>campusApi.call(path))),
   ([p,t,u])=>profileForm(p,t.items,u.items,accountOnly),async(form,active,[previous])=>{
    const body=profilePayload(form,accountOnly?previous:null);
    const saved=accountOnly?await campusApi.call('/users/me',{method:'PATCH',body}):
     await campusApi.call('/users/me/profile',{method:'PUT',body});
    updated(accountOnly?saved.user.name:saved.name,active);
   },(form,[,,units])=>form.elements.grade.addEventListener('change',()=>{
    const selected=[1,2,3].map(slot=>[slot,form.elements['unit'+slot]?.value]);
    form.querySelector('[data-unit-slots]').innerHTML=unitFields(form.elements.grade.value,units.items,selected);
   }));
 }
 function security(kind){
  const change=kind==='password';
  formDialog('account-'+kind,change?'비밀번호 변경':'회원 탈퇴',()=>null,()=>securityForm(kind),async form=>{
   const data=await campusApi.call(change?'/auth/password/change':'/users/me/withdraw',{method:'POST',body:securityPayload(kind,form)});
   if(change?!data.changed:!data.withdrawn)throw Error('처리 결과를 확인해 주세요.');
   campusApi.clear();setAccountSession(null);
   toast(change?'비밀번호를 변경했습니다. 다시 로그인해 주세요.':'회원 탈퇴를 완료했습니다.');
  });
 }
 function reopen(){
  const kind=current().modalView;
  if(kind?.startsWith('detail-'))detail(kind.slice(7));
  else if(kind?.startsWith('source-'))source(kind.slice(7));
  else if(kind?.startsWith('quick-list-'))quick(kind.slice(11),quickPage);
  else if(kind==='compare')compare();
  else if(kind==='account-edit')editProfile(true);
  else if(kind==='campus-profile')editProfile();
  else if(kind==='account-delete'||kind==='account-password')security(kind.slice(8));
 }
 async function bookmark(key,reminder=false){
  if(!user()){toast('MY PICK은 로그인 후 사용할 수 있어요.');return;}
  if(busy.has(key))return;
  const {type,id}=parseRef(key),card=records.get(key);
  if(!card)return;
  const epoch=session;
  busy.add(key);
  try {
   const saved=card.bookmark?.saved;
   const data=await campusApi.call(`/users/me/bookmarks/${type}s/${id}`,reminder?
    {method:'PATCH',body:{deadlineReminderEnabled:!card.bookmark?.deadlineReminderEnabled}}:{method:saved?'DELETE':'PUT'});
   if(epoch!==session)return;
   card.bookmark=data;
   store.invalidate();render();
   if(modal.open)reopen();
   toast(reminder?'마감 알림 설정을 저장했습니다.':data.saved?'MY PICK에 저장했습니다.':'MY PICK에서 해제했습니다.');
  }catch(e){if(epoch===session)toast(e.message);}
  finally{if(epoch===session)busy.delete(key);}
 }
 function action(a,id){
  switch(a){
   case 'live-account':editProfile(true);break;
   case 'live-reminder':void bookmark(id,true);break;
   case 'live-modal-retry':reopen();break;
   case 'live-retry':store.invalidate();render();break;
   case 'live-page':page=Number(id);renderResults();break;
   case 'live-quick-page':quick(current().modalView.slice(11),Number(id));break;
   case 'restart-profile':editProfile();break;
   default:return false;
  }
  return true;
 }
 function search(){clearTimeout(timer);timer=setTimeout(renderResults,180);}
 return {reset,list,home,quick,categories,detail,source,compare,myPage,pageProfile,editProfile,security,bookmark,action,search,
  refresh(){store.invalidate();render();}, loadProfile(){if(user())request('/users/me/profile');}};
}

