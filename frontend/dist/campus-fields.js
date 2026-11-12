import {escapeHtml as h, gradeNames} from './campus-content.js';
import {passwordError,confirmationError} from './auth-rules.js?v=1.16.54';

export function profileSummary(account,profile) {
 return `<dl class="profile-dl profile-summary-list">${[
  ['아이디',account.loginId],['이름',account.name],['학년',gradeNames[profile.grade]],
  ['소속',profile.academicUnits.map(x=>x.unit.name).join(' · ')],
  ['관심 분야',profile.interests.map(x=>x.name).join(' · ')]
 ].map(([k,v])=>`<div class="profile-summary-row"><dt>${k}</dt><dd>${h(v||'미입력')}</dd></div>`).join('')}</dl>`;
}
const feedback='<p data-feedback class="signup-hint" role="status"></p>';
const submit=label=>`${feedback}<button class="primary" type="submit">${label}</button>`;
const nameField=name=>`<label class="account-label">이름<input class="form-input" name="name" value="${h(name)}" required maxlength="30" autocomplete="name"></label>`;
export function profileForm(profile,topics,units,accountOnly=false) {
 const grades=Object.entries(gradeNames).map(([code,name])=>`<option value="${code}" ${code===profile.grade?'selected':''}>${name}</option>`).join('');
 const options=topics.map(t=>`<label class="chip"><input type="checkbox" name="interest" value="${h(t.code)}" ${profile.interests.some(i=>i.code===t.code)?'checked':''}> ${h(t.name)}</label>`).join('');
 return `<form class="modal-content" id="${accountOnly?'live-account':'live-profile'}">${nameField(profile.name)}
 <label class="account-label">학년<select name="grade" class="form-input" ${accountOnly&&!profile.grade?'':'required'}><option value="">학년 선택</option>${grades}</select></label>
 <div data-unit-slots>${unitFields(profile.grade,units,profile.academicUnits.map(x=>[x.slot,x.unit.id]))}</div>
 <fieldset><legend>관심 분야 (1~4개)</legend>${options}</fieldset>${submit(accountOnly?'내 정보 저장':'추천 프로필 저장')}</form>`;
}
export function unitFields(grade,units,selection) {
 if(!grade)return '';
 const current=new Map(selection),byId=new Map(units.map(u=>[u.id,u]));
 const slots=grade==='YEAR_1'?[1]:[1,2,3];
 return slots.map(slot=>{
  const choices=units.filter(u=>grade==='YEAR_1'?u.kind!=='TRACK':slot===1||u.kind!=='COLLEGE');
  const options=choices.map(u=>{
   const parent=byId.get(u.parentId);
   return `<option value="${h(u.id)}" ${current.get(slot)===u.id?'selected':''}>${h([parent?.name,u.name].filter(Boolean).join(' / '))}</option>`;
  });
  return `<label class="account-label">소속 ${slot}${slot===3?' (선택)':''}<select class="form-input" name="unit${slot}" ${slot<3?'required':''}><option value="">대학·학부·학과·트랙 선택</option>${options.join('')}</select></label>`;
 }).join('');
}
export function profilePayload(form,previous=null) {
 const data=new FormData(form), interestCodes=data.getAll('interest');
 const academicUnits=[1,2,3].map(slot=>({slot,academicUnitId:data.get('unit'+slot)})).filter(u=>u.academicUnitId);
 const name=data.get('name').trim(),grade=data.get('grade');
 if(previous){
  const patch={};
  if(name!==previous.name)patch.name=name;
  if(grade!==(previous.grade??''))patch.grade=grade;
  if(JSON.stringify(academicUnits)!==JSON.stringify(previous.academicUnits.map(x=>({slot:x.slot,academicUnitId:x.unit.id}))))patch.academicUnits=academicUnits;
  if([...interestCodes].sort().join(',')!==previous.interests.map(x=>x.code).sort().join(','))patch.interestCodes=interestCodes;
  if(!Object.keys(patch).length)throw Error('변경할 내용을 입력해 주세요.');
  if(Object.keys(patch).every(key=>key==='name'))return patch;
  if(!grade||!academicUnits.length)throw Error('학년과 소속을 선택해 주세요.');
  validateChoices(academicUnits,interestCodes);
  return patch;
 }
 validateChoices(academicUnits,interestCodes);
 return {name,grade,academicUnits,interestCodes};
}
function validateChoices(academicUnits,interestCodes) {
 if(new Set(academicUnits.map(u=>u.academicUnitId)).size!==academicUnits.length)throw Error('서로 다른 소속을 선택해 주세요.');
 if(!interestCodes.length||interestCodes.length>4)throw Error('관심 분야를 1~4개 선택해 주세요.');
}
export function securityForm(kind) {
 const change=kind==='password';
 const password=(name,label,autocomplete)=>`<label class="account-label">${label}<input name="${name}" class="form-input" type="password" autocomplete="${autocomplete}" required></label>`;
 return `<form class="modal-content" id="live-security">${password('currentPassword','현재 비밀번호','current-password')}
 ${change?password('newPassword','새 비밀번호','new-password')+password('confirm','새 비밀번호 확인','new-password'):
 '<label><input type="checkbox" name="withdraw" required> 내 계정과 저장한 정보 삭제에 동의합니다.</label>'}
 ${submit(change?'비밀번호 변경':'회원 탈퇴')}</form>`;
}
export function securityPayload(kind,form) {
 const data=new FormData(form),currentPassword=data.get('currentPassword');
 if(kind==='delete'){
  if(!data.has('withdraw'))throw Error('회원 탈퇴를 확인해 주세요.');
  return {currentPassword,confirmation:'WITHDRAW'};
 }
 const newPassword=data.get('newPassword');
 const error=passwordError(newPassword)||confirmationError(newPassword,data.get('confirm'));
 if(error)throw Error(error);
 return {currentPassword,newPassword};
}

