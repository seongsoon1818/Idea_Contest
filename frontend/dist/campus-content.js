export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c =>
 ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const h = escapeHtml;
const statusNames = {open:'모집 중', upcoming:'모집 예정', closed:'모집 마감', unknown:'일정 미확인', not_applicable:'신청 대상 아님'};
export const gradeNames = {YEAR_1:'1학년', YEAR_2:'2학년', YEAR_3:'3학년', YEAR_4:'4학년', OTHER:'기타'};
export const refKey = ({type,id}) => `${type}:${id}`;
export function parseRef(key) {
 const match = /^(notice|program):([a-zA-Z0-9_-]{1,128})$/.exec(key);
 if (!match) throw new Error('콘텐츠 식별자가 올바르지 않습니다.');
 return {type:match[1], id:match[2]};
}
export function listPath(view, type, {page=1, query='', category='all', sort, openOnly=false}={}) {
 const params = new URLSearchParams({page:String(page), size:'20', status:openOnly?'open':'all'});
 if (query.trim()) params.set('q',query.trim());
 if (category==='recommended') params.set('recommendedOnly','true');
 else if (category!=='all') params.set(`${type}Category`,category);
 params.set('sort',sort || (view==='saved'?'saved':view==='recommend'?'recommended':'latest'));
 if (view==='recommend') {
  params.set('type',type);
  params.delete('recommendedOnly');
  return `/recommendations?${params}`;
 }
 const path = view==='saved'?`/users/me/bookmarks/${type}`:`/${type}s`;
 return `${path}?${params}`;
}
export function schoolLink(value) {
 try {
  const url = new URL(value);
  return url.protocol==='https:' && !url.username && !url.password && !url.port &&
   /(^|\.)hansung\.ac\.kr$/.test(url.hostname) ? url.href : null;
 } catch { return null; }
}
const button = (action,key,label,cls='secondary') =>
 `<button type="button" class="${cls}" data-action="${action}" data-id="${h(key)}">${label}</button>`;
export function officialLink(url,label='학교 원문 바로가기') {
 const href=schoolLink(url);
 return href ? `<a class="secondary official-shortcut" href="${h(href)}" target="_blank" rel="noopener noreferrer">${h(label)}</a>` : '';
}
export function section(title,lines) {
 const present = lines.filter(line=>typeof line==='string' && line.trim());
 return present.length ? `<section class="detail-group"><h3>${h(title)}</h3>${present.map(line=>`<p>${h(line)}</p>`).join('')}</section>` : '';
}
const boundary = d => d?.rawText || d?.value || '';
function periods(rows=[]) {
 return rows.map(p=>[p.label,[boundary(p.start),boundary(p.end)].filter(Boolean).join(' ~ ')].filter(Boolean).join(' · '));
}
function conditions(a,targets) {
 const result=[a?.description];
 if (targets?.gradeScope==='ALL') result.push('전 학년');
 if (targets?.academicScope==='ALL') result.push('소속 제한 없음');
 const purposes={REQUIRED:'필수',PREFERRED:'우대',RECOMMENDED:'추천'};
 for(const entry of targets?.grades??[]) result.push(`${purposes[entry.purpose]} · ${gradeNames[entry.grade]}`);
 for(const entry of targets?.academicUnits??[]) result.push(`${purposes[entry.purpose]} · ${entry.unit.name}${entry.includeDescendants?' (하위 소속 포함)':''}`);
 for(const [key,label] of [['qualifications','필수 자격'],['exclusions','제외 조건']]) {
  for (const rule of a?.[key]??[]) result.push(`${label} · ${rule.text}${rule.exceptions?.length?` (예외: ${rule.exceptions.join(', ')})`:''}`);
 }
 for(const [key,label] of [['preferences','우대'],['recommended','추천']]) {
  for (const line of a?.[key]??[]) result.push(`${label} · ${line}`);
 }
 return result;
}
const facts = (label,value) => `<div><dt>${label}</dt><dd><span class="card-fact-preview">${h(value||'원문 확인')}</span></dd></div>`;
export function cardHtml(card, {selected=false,recommended=false,removable=false,icon=()=>'',details=''}={}) {
 const key=refKey(card), category=card.noticeCategory??card.programCategory;
 const status=statusNames[card.recruitmentStatus]||'일정 미확인',saved=card.bookmark?.saved===true;
 const reason=card.recommendation?.reasons?.join(' · ')||card.recommendation?.eligibility?.reasons?.[0]?.message;
 return `<article class="card ${removable?'comparison-card':''}" data-type="${h(card.type)}" data-item="${h(key)}">
 <div class="card-top"><span class="category-icon">${icon(card.type==='notice'?'book':'pencil')}</span><span class="badge category-badge">${h(category?.name||card.sourceCategory||'미분류')}</span>
 <div class="card-status-actions"><span class="badge status-badge ${h(card.recruitmentStatus)}">${h(status)}</span><button class="save-btn ${saved?'saved':''}" data-action="save" data-id="${h(key)}" aria-pressed="${saved}" aria-label="${h(card.title)} ${saved?'저장 해제':'저장'}">${icon('bookmark')}</button></div></div>
 <div class="card-body"${removable?'':` data-action="detail" data-id="${h(key)}"`}><button class="title-button" data-action="detail" data-id="${h(key)}">${h(card.title)}</button>
 ${card.oneLineSummary?`<p class="card-description">${h(card.oneLineSummary)}</p>`:''}
 <dl class="card-facts">${facts('대상',card.targetSummary)}${facts('마감',boundary(card.deadline))}${facts('혜택',card.benefitSummary)}</dl>${details}</div>
 ${recommended && reason?`<p class="recommend-reason">${h(reason)}</p>`:''}
 <div class="card-bottom">${removable?button('remove-compare',key,'선택 해제','remove-compare'):`<label class="compare-check"><input type="checkbox" data-compare="${h(key)}" ${selected?'checked':''}>AI 비교하기</label>`}</div></article>`;
}
function detailFields(d,card) {
 const info=d.publicInfo, summary=d.summary??d;
 const eligibility=card.recommendation?.eligibility?.reasons?.map(r=>r.message)??[];
 const audience=info?{description:info.audience}:summary.audience;
 const benefits=(summary.benefits??[]).map(b=>[b.text,b.condition,{ended:'혜택 종료',conditional:'조건부',unknown:'제공 여부 미확인'}[b.availability]].filter(Boolean).join(' · '));
 const preparations=(summary.preparations??[]).map(p=>[p.text,p.condition,p.required===true?'필수':p.required===false?'선택':''].filter(Boolean).join(' · '));
 return section('신청 대상',[...conditions(audience,d.targetRules),...eligibility])+
  section('신청 기간',[info?.applicationPeriod,...periods(summary.application?.periods)])+
  section('활동 · 결과 안내',periods(summary.activityPeriods))+
  section('받을 수 있는 혜택',[info?.pointsText || (info?.points!=null?`${info.points}pt`:null),...benefits])+
  section('미리 준비할 것',preparations)+
  section('운영 · 신청 안내',[info?.department,info?.location,info?.format,info?.participationMode,...(summary.application?.methods??[]),...(summary.operationGuide??[])]);
}
function assets(d) {
 const imageHtml=(d.images??[]).filter(a=>schoolLink(a.url)).map(a=>`<figure><a href="${h(a.url)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="${h(a.url)}" alt="${h(a.alt||'안내 이미지')}" referrerpolicy="no-referrer"></a></figure>`).join('');
 return (imageHtml?`<section class="detail-group notice-images"><h3>안내 이미지</h3>${imageHtml}</section>`:'')+
  (d.attachments??[]).map(a=>officialLink(a.url,a.filename||'첨부파일')).join('');
}
export function detailHtml(d) {
 const card=d.card, key=refKey(card), s=d.summary;
 const sessions=(d.sessions??[]).map(x=>section(x.title,[
  x.applicationPeriodText||[boundary(x.applicationStart),boundary(x.deadline)].filter(Boolean).join(' ~ '),
  x.audienceText,x.pointsText??(x.points!=null?`${x.points}pt`:''),x.capacity!=null?`정원 ${x.capacity}명`:'',...periods(x.activityPeriods)
 ])+officialLink(x.originalUrl,'회차 바로가기')).join('');
 return `<div class="modal-content">${section(card.type==='notice'?'공지 요약':'프로그램 한눈에',[card.oneLineSummary,...(s?.summary??[])])}
 ${detailFields(d,card)}${sessions}${section('프로그램 내용',[d.body?.bodyText])}
 ${(s?.details??[]).map(x=>section(x.label,x.items)).join('')}
 ${(s?.items??[]).map(x=>section(x.title,[x.organization,boundary(x.deadline),...x.facts])).join('')}
 ${section('확인 사항',(d.warnings??[]).map(w=>w.message))}${assets(d)}
 <div class="original-actions">${officialLink(card.originalUrl)}${card.type==='notice'?button('source',key,'공지 내용 보기'):''}</div></div>`;
}
export function documentHtml(d) {
 return `<div class="modal-content">${section('게시 정보',[d.author,d.publishedDate])}${section('한 줄 요약',[d.oneLineSummary])}
 ${(d.sections??[]).map(s=>section(s.label,s.lines)).join('')}${assets(d)}${officialLink(d.originalUrl)}</div>`;
}
export function comparisonHtml(items,icon) {
 return ['notice','program'].map(type=>{
  const group=items.filter(d=>d.content.type===type);
  if(!group.length)return '';
  return `<section class="comparison-group"><h3>${type==='notice'?'공지사항':'비교과 프로그램'} ${group.length}</h3><div class="cards comparison-cards">${group.map(d=>
   cardHtml(d.content,{selected:true,removable:true,icon,details:detailFields(d,d.content)+section('확인 사항',(d.warnings??[]).map(w=>w.message))})).join('')}</div></section>`;
 }).join('');
}

