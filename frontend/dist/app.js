import {getAccountUser,subscribeAccountSession,logoutAccount} from './account-session.js?v=1.16.73';
import {noticeImages} from './notice-images.js?v=1.16.76';
import {passwordError,confirmationError} from './auth-rules.js?v=1.16.54';
import {ITEMS,CATEGORIES,NOTICE_CATEGORIES,PROGRAM_CATEGORIES,todayDate,statusOf,daysLeft,matchProfile,sourceUrl,normalizeTrack,gradeMatches} from './data.js?v=1.16.73';
import {TRACK_COLLEGES,trackOptionsForSlot,normalizeTrackSearch,isSelectableTrack} from './tracks.js?v=1.16.54';
const $=s=>document.querySelector(s);
const KEY='hsupick-v1';
const paths={exclamation:'M10 3h4v12h-4zM12 18a2 2 0 1 0 0 4a2 2 0 0 0 0-4z',pencil:'M16 3l5 5-12 12-6 1 1-6L16 3zM13 6l5 5M4 15l5 5',spark:'M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3z',search:'M21 21l-5-5M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',bookmark:'M6 4h12v17l-6-4-6 4V4z',user:'M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',arrow:'M4 12h16m-6-6 6 6-6 6',chevron:'M9 5l7 7-7 7',close:'M6 6l12 12M18 6 6 18',clock:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',calendar:'M4 5h16v16H4V5zM8 3v4m8-4v4M4 10h16',wallet:'M3 6h17v14H3V6zM3 6V4h14M16 11h5v5h-5v-5z',briefcase:'M3 7h18v14H3V7zM8 7V3h8v4M3 12h18M10 12v3h4v-3',building:'M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 7h1m6 0h1M8 11h1m6 0h1',trophy:'M7 3h10v6a5 5 0 0 1-10 0V3zM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 14v6m-4 1h8',book:'M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15',rocket:'M9 15 5 19l-1-5 5-3m4 4 3 5 3-5-4-2M9 15c-4-5 2-11 11-12 0 9-6 15-11 12zM14 8h.01M5 21l2-2',heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM3 12h18M12 3c4 5 4 13 0 18-4-5-4-13 0-18z',compare:'M4 4h6v16H4V4zM14 4h6v16h-6V4z',info:'M12 10v6m0-9h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',external:'M14 3h7v7M10 14 21 3M10 3H3v18h18v-7',check:'M5 12l4 4L19 6',lock:'M5 10h14v11H5V10zM8 10V7a4 4 0 0 1 8 0v3'};
const icon=(n)=>`<svg class="icon${n==='exclamation'?' icon-exclamation':''}" aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[n]||paths.info}"/></svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cat=id=>CATEGORIES.find(c=>c.id===id);
const categoryForItem=i=>(i.type==='program'?PROGRAM_CATEGORIES.find(c=>c.id===i.programCategory):NOTICE_CATEGORIES.find(c=>c.id===i.noticeCategory))||{id:'unclassified',name:'미분류',short:'미분류',icon:'info',color:'blue'};
const listType=()=>view==='saved'?savedTab:view==='recommend'?recommendTab:exploreViews[view]?.type||'all';
const filterCategories=()=>listType()==='program'?PROGRAM_CATEGORIES:NOTICE_CATEGORIES;
let storageOK=true, stored={};
try{const raw=localStorage.getItem(KEY);try{stored=JSON.parse(raw||'{}')||{};}catch{stored={};}}catch{storageOK=false;}
const isProfile=p=>p&&(p.name===undefined||(typeof p.name==='string'&&p.name.length<=30))&&(p.grade==='other'||[1,2,3,4].includes(Number(p.grade)))&&Array.isArray(p.tracks)&&p.tracks.length>=1&&p.tracks.length<=3&&p.tracks.every(t=>typeof t==='string'&&t.length<=60)&&Array.isArray(p.interests)&&p.interests.length>=1&&p.interests.length<=4&&p.interests.every(id=>CATEGORIES.some(c=>c.id===id));
let profile=isProfile(stored.profile)?stored.profile:null;
if(Number(profile?.grade)===1)profile={...profile,tracks:profile.tracks.slice(0,1)};
let saved=new Set(Array.isArray(stored.saved)?stored.saved.filter(id=>ITEMS.some(i=>i.id===id)):[]);
let compared=new Set(),view='recommend',category='all',query='',type='all',sort='recommended',openOnly=true,savedTab='notice',recommendTab='notice',draft=null,lastFocus=null,modalView=null,toastTimer;
const main=$('#main'), modal=$('#modal');
const mobileLayout=matchMedia('(max-width:800px)');
const isSavedMobile=()=>view==='saved'&&mobileLayout.matches;
let searchExpanded=false;
function persist(){try{localStorage.setItem(KEY,JSON.stringify({profile,saved:[...saved]}));storageOK=true;return true;}catch{storageOK=false;toast('저장 공간을 사용할 수 없어 이번 방문 동안만 유지됩니다.');return false;}}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2800);}
const navs=[['recommend','spark','맞춤 추천'],['notices','book','공지사항'],['programs','pencil','비교과프로그램'],['saved','bookmark','MY PICK'],['profile','user','MY PAGE']];
const CARD_GAP=12;
const carouselIndices={notice:0,program:0};
let heroIndex=0;
const exploreViews={
 notices:{type:'notice',title:'공지사항',heading:'공지사항',description:'장학·취업·현장실습 등 공지사항 소식을 찾아보세요.'},
 programs:{type:'program',title:'비교과 프로그램',heading:'비교과 프로그램',description:'관심 분야별 비교과프로그램을 찾아보세요.'}
};
const isRecommendedTab=()=>(!!exploreViews[view]||view==='saved'||view==='recommend')&&category==='recommended';
const savedTypeCount=kind=>ITEMS.filter(i=>saved.has(i.id)&&i.type===kind).length;
const validView=id=>navs.some(n=>n[0]===id)||!!exploreViews[id];
function renderNav(){
 renderMiniMy();
 const html=navs.map(([id,i,name])=>`<a class="nav-item ${view===id?'active':''}" href="#${id}" ${view===id?'aria-current="page"':''}>${icon(i)}<span>${name}</span></a>`).join('');
 $('.desktop-nav').innerHTML=html;
 $('.mobile-nav').innerHTML=html.replace('<span>내 정보</span>','<span>MY PAGE</span>');
 $('#page-name').textContent=navs.find(n=>n[0]===view)[2];
}
const fmt=d=>esc(d.slice(5).replace('-','.'));
const target=i=>!i.grades.length?'원문 확인':`${i.grades.length===4?'전 학년':i.grades.map(g=>g+'학년').join('·')} · ${i.trackEligibilityKnown===false?'트랙 조건 원문 확인':i.tracks.length?i.tracks.map(t=>t+'트랙').join(', '):'트랙 무관'}`;
function badge(i){
 const s=statusOf(i),d=daysLeft(i);
 if(s==='closed')return '<span class="badge status-badge closed">모집 마감</span>';
 if(s==='upcoming')return '<span class="badge status-badge upcoming">모집 예정</span>';
 return `<span class="badge status-badge ${d===0?'today':d<=7?'deadline':'open'}">${d===0?'<span class="deadline-alert" aria-hidden="true">!</span> 오늘 마감':d<=7?'D-'+d:'모집 중'}</span>`;
}
function eligibility(i){if(!i.grades.length||i.trackEligibilityKnown===false)return '<span class="condition-pill warning">신청 대상은 원문에서 확인해 주세요</span>';if(!profile)return '<span class="condition-pill warning">내 정보를 입력해 대상 확인</span>';const m=matchProfile(i,profile);if(!m.eligible)return `<span class="condition-pill warning">${!gradeMatches(i,profile.grade)?'내 학년은 신청 대상이 아니에요':'내 트랙은 신청 대상이 아니에요'}</span>`;return `<span class="condition-pill eligibility-match ${statusOf(i)==='closed'?'closed':''}">${statusOf(i)==='closed'?'대상 조건 일치 · 모집 마감':statusOf(i)==='upcoming'?'대상 조건 일치 · 모집 예정':'내 학년·트랙 조건에 맞아요'}</span>`;}
function benefitSummary(i){
 if(!i.benefit)return '원문 확인';
 const points=i.benefit.match(/비교과 (\d+)pt/);
 if(points)return points[1]+'pt';
 const money=i.benefit.match(/(\d+)만 원/);
 if(money)return (i.benefit.includes('최대')?'최대 ':'')+money[1]+'만 원';
 if(i.benefit.includes('실습지원비'))return '실습지원비';
 return i.benefit.split(' · ')[0];
}
function cardFacts(i){
 const grade=!i.grades.length?'원문 확인':i.grades.length===4?'전 학년':i.grades.map(g=>g+'').join('·')+'학년';
 const targetSummary=`<span>${esc(grade)}</span>${i.tracks.length?'<span>지정트랙</span>':''}`;
 const fullDeadline=esc(i.deadline.replaceAll('-','.'));
 return `<dl class="card-facts"><div class="fact-cell"><dt>${icon('user')} 대상</dt><dd class="fact-target" title="${esc(target(i))}" aria-label="대상: ${esc(target(i))}">${targetSummary}</dd></div><div class="fact-cell"><dt>${icon('calendar')} 마감</dt><dd title="${fullDeadline}" aria-label="마감: ${fullDeadline}">${fmt(i.deadline)}까지</dd></div><div class="fact-cell"><dt>${icon('exclamation')} 혜택</dt><dd title="${esc(i.benefit||'미기재 · 원문 확인')}" aria-label="혜택: ${esc(i.benefit||'미기재 · 원문 확인')}">${esc(benefitSummary(i))}</dd></div></dl>`;
}
function recommendedItems(onlyOpen=true){
 return ITEMS.filter(i=>(!onlyOpen||statusOf(i)==='open')&&(!profile||matchProfile(i,profile).eligible))
  .sort((a,b)=>matchProfile(b,profile).score-matchProfile(a,profile).score||a.deadline.localeCompare(b.deadline));
}
function bestPickId(kind){return profile?recommendedItems().find(i=>i.type===kind)?.id:null;}
function recommendationReason(i){
 const c=cat(i.category),m=matchProfile(i,profile);
 if(!i.grades.length||i.trackEligibilityKnown===false)return '신청 대상을 원문에서 확인해 주세요.';
 if(profile&&!m.eligible)return !gradeMatches(i,profile.grade)?'내 학년 대상이 아니에요.':'내 트랙 대상이 아니에요.';
 if(statusOf(i)==='closed')return '모집이 끝난 공고예요.';
 if(statusOf(i)==='upcoming')return '신청 일정을 미리 확인해 보세요!';
 if(!profile)return daysLeft(i)<=3?'마감이 가까운 공고예요!':'신청 대상과 일정을 확인해 주세요.';
 if(profile.interests.includes(i.category))return `${c.short} 관심 분야와 맞아요!`;
 if(i.tracks.length)return '내 트랙을 위한 공고예요!';
 return profile.grade==='other'?'전 학년 대상 공고예요!':`${gradeLabel(profile.grade)}이 참여할 수 있어요!`;
}
function comparisonDetails(i){
 if(i.type==='program')return programFacts(i);
 const row=(label,value)=>`<div><dt>${label}</dt><dd>${value}</dd></div>`;
 return `<dl class="comparison-details">${row('신청 대상',esc(target(i))+eligibility(i))}${row('신청 기간',`${esc(i.start.replaceAll('-','.'))} ~ ${esc(i.deadline.replaceAll('-','.'))}`)}${row('활동 / 결과',esc(i.eventAt?i.eventAt.replaceAll('-','.'):'원문 확인'))}${row('전체 혜택',esc(i.benefit||'미기재 · 원문 확인'))}${row('준비사항',i.preparations.length?`<ul>${i.preparations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'미기재 · 원문 확인')}</dl>`;
}
function card(i,featured=false,comparing=false){
 const c=categoryForItem(i),ranked=bestPickId(i.type)===i.id;
 const reason=recommendationReason(i),showReason=!comparing&&(view==='recommend'||isRecommendedTab());
 return `<article class="card ${featured?'featured-card':''} ${comparing?'comparison-card':''}" data-item="${i.id}" data-type="${i.type}" aria-label="${i.type==='notice'?'공지사항':'비교과 프로그램'}: ${esc(i.title)}">
  <div class="card-top"><span class="category-icon ${c.color}">${icon(c.icon)}</span><span class="badge category-badge">${c.name}</span>${ranked?'<span class="rank-badge" title="입력한 학년·트랙·관심 분야에 따른 유형별 조건 기반 1순위">🚩1순위</span>':''}<div class="card-status-actions">${badge(i)}<button class="save-btn ${saved.has(i.id)?'saved':''}" data-action="save" data-id="${i.id}" aria-label="${esc(i.title)} ${saved.has(i.id)?'저장 해제':'저장'}" aria-pressed="${saved.has(i.id)}">${icon('bookmark')}</button></div></div>
  <div class="card-body"><div class="card-title-row"><button class="title-button" data-action="detail" data-id="${i.id}" aria-label="${esc(i.title)} 상세 정보 보기">${esc(i.title)}</button></div>${i.subtitle?`<p class="card-description">${esc(i.subtitle)}</p>`:''}${cardFacts(i)}${comparing?comparisonDetails(i):''}</div>
  ${showReason?`<div class="recommend-reason ${featured?'single-line':''}">${icon('spark')}<span title="${esc(reason)}">${reason}</span></div>`:''}
  <div class="card-bottom">${comparing?`<button class="remove-compare" data-action="remove-compare" data-id="${i.id}">선택 해제</button>`:`<label class="compare-check"><input type="checkbox" data-compare="${i.id}" ${compared.has(i.id)?'checked':''} aria-label="${esc(i.title)} AI 비교하기 선택">AI 비교하기</label>`}</div>
 </article>`;
}
function empty(title,text,action,label,i='search'){return `<div class="empty">${icon(i)}<h3>${title}</h3><p>${text}</p>${action?`<button class="primary" data-action="${action}">${label}</button>`:''}</div>`;}
function getList(includeUnavailable=false){
 const recommendations=view==='recommend'||isRecommendedTab();
 const base=recommendations?recommendedItems(includeUnavailable?false:openOnly):ITEMS;
 const activeQuery=query,activeOpenOnly=includeUnavailable?false:openOnly,activeSort=sort;
 const list=base.filter(i=>(category==='all'||category==='recommended'||category===categoryForItem(i).id)
  &&(listType()==='all'||listType()===i.type)
  &&(!activeOpenOnly||statusOf(i)==='open')&&(!activeQuery||[i.title,i.subtitle,i.benefit,target(i),categoryForItem(i).name,...i.tags].join(' ').toLowerCase().includes(activeQuery.toLowerCase()))
  &&(view!=='saved'||saved.has(i.id)));
 return list.sort((a,b)=>activeSort==='deadline'?a.deadline.localeCompare(b.deadline):activeSort==='latest'?(b.publishedAt||'').localeCompare(a.publishedAt||''):matchProfile(b,profile).score-matchProfile(a,profile).score||a.deadline.localeCompare(b.deadline));
}
const sortOptions=()=>[['recommended',profile?'추천순':'기본순'],['deadline','마감 임박순'],['latest','최근 등록순']];
function closeSortMenu(returnFocus=false){
 const menu=$('#sort-options'),trigger=$('[data-action="toggle-sort"]');
 if(!menu||!trigger)return;
 menu.hidden=true;trigger.setAttribute('aria-expanded','false');
 if(returnFocus)trigger.focus();
}
function toggleSortMenu(){
 const menu=$('#sort-options'),trigger=$('[data-action="toggle-sort"]');
 if(!menu||!trigger)return;
 if(!menu.hidden){closeSortMenu(true);return;}
 menu.hidden=false;trigger.setAttribute('aria-expanded','true');
 menu.querySelector(`[data-id="${sort}"]`)?.focus();
}
function applySort(value){
 if(!sortOptions().some(([id])=>id===value))return;
 sort=value;$('#sort-filter').value=value;
 const current=$('.sort-current');if(current)current.textContent=sortOptions().find(([id])=>id===value)[1];
 const menu=$('#sort-options');if(menu)menu.innerHTML=sortOptions().map(([id,label])=>`<button type="button" class="sort-option" role="option" tabindex="-1" data-action="select-sort" data-id="${id}" aria-selected="${id===sort}">${label}${id===sort?icon('check'):''}</button>`).join('');
 closeSortMenu();renderResults();
}
function filterHtml(){
 const home=view==='recommend',recommended=isRecommendedTab();
 const searchInput=`<input id="search-input" type="search" placeholder="제목, 분야, 혜택으로 찾아보세요" aria-label="공지 검색" value="${esc(query)}">`;
 const options=sortOptions();
 const nativeSort=`<select id="sort-filter" class="filter-select" aria-label="정렬 기준" ${mobileLayout.matches?'hidden tabindex="-1"':''}>${options.map(([value,label])=>`<option value="${value}" ${sort===value?'selected':''}>${label}</option>`).join('')}</select>`;
 const sortSelect=mobileLayout.matches?`<div class="sort-dropdown">${nativeSort}<button type="button" class="sort-trigger" data-action="toggle-sort" aria-label="정렬 기준" aria-haspopup="listbox" aria-expanded="false" aria-controls="sort-options"><span class="sort-current">${options.find(([value])=>value===sort)[1]}</span>${icon('chevron')}</button><div id="sort-options" class="sort-options" role="listbox" aria-label="정렬 기준" hidden>${options.map(([value,label])=>`<button type="button" class="sort-option" role="option" tabindex="-1" data-action="select-sort" data-id="${value}" aria-selected="${value===sort}">${label}${value===sort?icon('check'):''}</button>`).join('')}</div></div>`:nativeSort;
 const recruitmentFilter=`<label class="check-filter"><input id="open-filter" type="checkbox" ${openOnly?'checked':''}>모집중</label>`;
 const searchTools=mobileLayout.matches?`<div class="search-tools mobile-search-tools ${searchExpanded?'is-expanded':''}"><div class="mobile-search-control"><button type="button" class="search-toggle" data-action="toggle-search" aria-label="검색창 ${searchExpanded?'닫기':'열기'}" aria-expanded="${searchExpanded}" aria-controls="mobile-search-field">${icon('search')}</button><label id="mobile-search-field" class="searchbox" ${searchExpanded?'':'hidden inert'}>${searchExpanded?searchInput:''}</label></div>${sortSelect}${recruitmentFilter}</div>`:`<div class="search-tools"><label class="searchbox">${icon('search')}${searchInput}</label>${sortSelect}${recruitmentFilter}</div>`;
 const firstChip=home?`<button class="chip ${category==='all'?'active':''}" data-category="all" aria-pressed="${category==='all'}">전체</button>`:`<button class="chip recommend-chip ${recommended?'active':''}" data-category="recommended" aria-pressed="${recommended}">${icon('spark')} 추천</button><button class="chip ${category==='all'?'active':''}" data-category="all" aria-pressed="${category==='all'}">전체</button>`;
 const categories=filterCategories();
 const categoryChip=c=>`<button class="chip ${category===c.id?'active':''}" data-category="${c.id}" aria-pressed="${category===c.id}"><span>${c.name}</span></button>`;
 const compactNotices=mobileLayout.matches&&listType()==='notice';
 const noticeRows=[['academic','activity','scholarship'],['career','intern','international','startup']];
 const programRows=home?[['startup','major','learning'],['counseling','other']]:[['startup','major'],['learning','counseling','other']];
 const compact=mobileLayout.matches,rows=compactNotices?noticeRows:programRows;
 const categoryButtons=compact?rows.map((ids,n)=>`<div class="category-row ${compactNotices?'notice-category-row':''}">${n===0?firstChip:''}${ids.map(id=>categories.find(c=>c.id===id)).filter(Boolean).map(categoryChip).join('')}</div>`).join(''):firstChip+categories.map(categoryChip).join('');
 return `<div class="filters ${compact?'categories-two-rows':''} ${compactNotices?'notice-categories-two-rows':''} ${listType()==='program'?'program-categories':''}" aria-label="카테고리 필터">${categoryButtons}</div>`+searchTools;
}
// Fill the first row proportionally; keep later rows at that scale when they fit.
// A longer second row is capped to its own space rather than spilling into row three.
function fitCategoryRows(){
 if(!mobileLayout.matches||typeof getComputedStyle!=='function')return;
 const filters=$('.filters.categories-two-rows');
 if(!filters||filters.clientWidth<=0)return;
 const rows=Array.from(filters.querySelectorAll('.category-row')).map(row=>{
  row.style.flexWrap='nowrap';
  const buttons=Array.from(row.querySelectorAll('.chip'));
  buttons.forEach(button=>button.style.width='');
  const widths=buttons.map(button=>button.getBoundingClientRect().width);
  const gap=parseFloat(getComputedStyle(row).columnGap)||0;
  return {row,buttons,widths,available:filters.clientWidth-gap*(buttons.length-1)};
 });
 if(!rows.length||rows.some(({widths})=>!widths.length||!widths.every(width=>width>0)))return;
 const total=widths=>widths.reduce((sum,width)=>sum+width,0);
 const firstScale=Math.max(1,(rows[0].available-.5)/total(rows[0].widths));
 rows.forEach(({row,buttons,widths,available})=>{
  const natural=total(widths);
  // Text enlargement must remain readable even when two rows cannot fit.
  if(natural>available){row.style.flexWrap='wrap';return;}
  const scale=Math.max(1,Math.min(firstScale,(available-.5)/natural));
  buttons.forEach((button,index)=>button.style.width=`${widths[index]*scale}px`);
 });
}
function toggleSearch(){
 searchExpanded=!searchExpanded;
 if(!searchExpanded)query='';
 render();
 (searchExpanded?$('#search-input'):$('[data-action="toggle-search"]'))?.focus();
}

function resultHtml(){
 const list=getList();
 const hiddenSaved=view==='saved'&&openOnly?getList(true).filter(i=>statusOf(i)!=='open').length:0;
 const availability=hiddenSaved?`<div class="saved-availability" role="status"><span>모집 마감·예정 PICK ${hiddenSaved}개가 숨겨져 있어요.</span><button type="button" data-action="show-unavailable">함께 보기</button></div>`:'';
 const summary=`<div class="result-line" role="status"><span>총 <strong>${list.length}</strong>개의 ${view==='saved'?'MY PICK':'기회'}</span></div>`;
 const noSavedType=view==='saved'&&!savedTypeCount(savedTab),name=listType()==='notice'?'공지사항':'비교과 프로그램';
 const noSavedRecommendations=view==='saved'&&isRecommendedTab()&&!query;
 const emptyTitle=noSavedRecommendations?`저장한 추천 ${name}이 없어요`:noSavedType?`저장한 ${name}이 없어요`:'조건에 맞는 소식을 찾지 못했어요';
 const emptyText=noSavedRecommendations?`추천해준 ${savedTab==='notice'?'공지':'프로그램'}의 북마크를 눌러<br>나만의 기회를 모아보세요.`:noSavedType?'관심 있는 공지의 북마크를 눌러<br class="mobile-copy"> 나만의 기회를 모아보세요.':'다른 분야를 선택하거나 검색어·필터를 바꿔보세요.';
 const emptyAction=noSavedRecommendations?'go-recommend':noSavedType?(savedTab==='notice'?'go-notices':'go-programs'):'reset-filter';
 const emptyLabel=noSavedRecommendations?`${icon('spark')}<span>맞춤 추천 살펴보기</span>`:noSavedType?`${icon(savedTab==='notice'?'book':'pencil')}<span>${name} 살펴보기</span>`:'필터 초기화';
 if(hiddenSaved&&!list.length)return summary+availability+empty('저장한 PICK이 있어요','모집이 마감되었거나 아직 시작하지 않아 숨겨져 있어요.','show-unavailable','마감·예정 PICK 보기','bookmark');
 return summary+availability+`<div class="cards listing-cards">${list.length?list.map(i=>card(i)).join(''):empty(emptyTitle,emptyText,emptyAction,emptyLabel,view==='saved'?'bookmark':'search')}</div>`;

}
function renderResults(){const e=$('#results');if(e){e.innerHTML=resultHtml();setupCarousels();}}
// Capture horizontal gestures so one gesture always changes exactly one slot.
// Vertical movement stays available for normal page scrolling.
function setupStepGestures(surface,onStep,drag={}){
 let start=null,suppressClick=false;
 surface.addEventListener('pointerdown',e=>{
  if(e.isPrimary===false||e.target.closest('input')||(e.pointerType==='mouse'&&(e.button!==0||e.target.closest('button')||e.target.closest('a'))))return;
  suppressClick=false;start={x:e.clientX,y:e.clientY,id:e.pointerId,horizontal:false};drag.begin?.();
 });
 surface.addEventListener('pointermove',e=>{
  if(!start||start.id!==e.pointerId)return;
  const dx=e.clientX-start.x,dy=e.clientY-start.y;
  if(!start.horizontal&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.2){start.horizontal=true;surface.setPointerCapture?.(e.pointerId);}
  if(start.horizontal){e.preventDefault();drag.move?.(dx);}
 });
 surface.addEventListener('pointerup',e=>{
  if(!start||start.id!==e.pointerId)return;
  const dx=e.clientX-start.x,dy=e.clientY-start.y,horizontal=start.horizontal||(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.2);
  start=null;suppressClick=horizontal;drag.end?.();
  if(horizontal&&Math.abs(dx)>=40)onStep(dx<0?1:-1);else drag.reset?.();
 });
 surface.addEventListener('pointercancel',()=>{start=null;drag.end?.();drag.reset?.();});
 surface.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopPropagation();suppressClick=false;}},true);
}
function carouselMetrics(track){
 const cards=track.querySelectorAll('.card'),step=(cards[0]?.getBoundingClientRect().width||cards[0]?.offsetWidth||track.clientWidth||300)+CARD_GAP;
 const max=Math.max(0,track.scrollWidth-track.clientWidth);
 return {cards,step,max,lastIndex:Math.max(0,Math.ceil((max-1)/step))};
}
function setupCarousels(){
 document.querySelectorAll('.carousel-track').forEach(track=>{
  const kind=track.dataset.kind,shell=track.closest('.card-carousel');
  track.carouselIndex=carouselIndices[kind]||0;
  const update=()=>{
   const {cards,step,max,lastIndex}=carouselMetrics(track);
   track.carouselIndex=Math.max(0,Math.min(track.carouselIndex,lastIndex));
   carouselIndices[kind]=track.carouselIndex;
   shell.querySelector('.carousel-previous').disabled=track.carouselIndex===0;
   shell.querySelector('.carousel-next').disabled=track.carouselIndex===lastIndex;
   const first=Math.floor(Math.min(track.carouselIndex*step,max)/step),last=Math.min(cards.length,Math.ceil((Math.min(track.carouselIndex*step,max)+track.clientWidth)/step));
   shell.querySelector('.carousel-position').textContent=`${first+1}–${last} / ${cards.length} 카드`;
  };
  track.moveCarouselTo=(index,animate=true)=>{
   track.carouselIndex=index;update();
   const {step,max}=carouselMetrics(track);
   track.scrollTo({left:Math.min(track.carouselIndex*step,max),behavior:animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'});
  };
  track.updateCarousel=()=>track.moveCarouselTo(track.carouselIndex,false);
  track.addEventListener('keydown',e=>{
   if(e.target!==track)return;
   if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();slideCarousel(kind,e.key==='ArrowLeft'?-1:1);}
   else if(e.key==='Home'||e.key==='End'){e.preventDefault();track.moveCarouselTo(e.key==='Home'?0:carouselMetrics(track).lastIndex);}
  });
  let startLeft=0;
  setupStepGestures(track,direction=>slideCarousel(kind,direction),{
   begin:()=>{const {step,max}=carouselMetrics(track);startLeft=Math.min(track.carouselIndex*step,max);},
   move:dx=>{track.style.scrollSnapType='none';const {step}=carouselMetrics(track);track.scrollLeft=startLeft-Math.max(-step,Math.min(dx,step));},
   end:()=>{track.style.scrollSnapType='';},reset:()=>track.moveCarouselTo(track.carouselIndex)
  });
  let wheelTimer,wheelActive=false;
  track.addEventListener('wheel',e=>{
   const dx=e.shiftKey?e.deltaY:e.deltaX;
   if(!dx||(!e.shiftKey&&Math.abs(dx)<=Math.abs(e.deltaY)))return;
   e.preventDefault();
   if(!wheelActive){wheelActive=true;slideCarousel(kind,dx>0?1:-1);}
   clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{wheelActive=false;},180);
  },{passive:false});
  track.updateCarousel();
 });
}
function slideCarousel(kind,direction){
 const track=document.querySelector(`.carousel-track[data-kind="${kind}"]`);
 if(track)track.moveCarouselTo(track.carouselIndex+direction);
}
function hero(){
 const gradeMessages={
  1:'1학년의 출발,<br>한성 PICK과 함께해요!',
  2:'기대되는 2학년,<br>한성 PICK과 함께해요!',
  3:'고민 많은 3학년,<br>한성 PICK이 도와줄게요!',
  4:'고민 많은 4학년,<br>한성 PICK과 함께해요!',
  other:'고민 많은 4학년,<br>한성 PICK과 함께해요!'
 };
 const welcomeTitle=profile?gradeMessages[profile.grade]:'놓치기 쉬운 기회,<br>이번엔 PICK하세요.';
 const slides=[
  {label:'맞춤 추천',title:welcomeTitle,action:profile?`<div class="profile-strip"><span class="profile-tag">${gradeLabel(profile.grade)}</span>${profile.tracks.filter(Boolean).map(t=>`<span class="profile-tag">${esc(t)}</span>`).join('')}<button data-action="profile">정보 수정</button></div>`:`<button class="primary" data-action="profile">내 정보 입력하기 ${icon('arrow')}</button>`,ticket:'PICK!',small:'A LITTLE PICK, A BIG POSSIBILITY.'},
  {label:'학교 소식 탐색',title:'필요한 학교 소식,<br>조건부터 한눈에.',action:`<a class="primary" href="#notices">공지사항 보기 ${icon('arrow')}</a><a class="primary hero-program-primary" href="#programs">비교과프로그램 보기 ${icon('arrow')}</a>`,ticket:'FIND!',small:'공지와 비교과, 필요한 소식부터.'},
  {label:'MY PICK 저장',title:'마음에 든 기회,<br>MY PICK에 모아두세요.',action:`<a class="primary" href="#saved">MY PICK 보기 ${icon('arrow')}</a>`,ticket:'MY<br>PICK',small:'나의 관심을 한곳에 모아두기.'}
 ];
 return `<section class="hero-carousel" role="region" aria-roledescription="캐러셀" aria-label="HSU PICK 서비스 안내"><div class="hero-stage" tabindex="0" aria-label="서비스 안내 배너, 좌우 방향키로 넘기기">${slides.map((slide,index)=>`<div class="hero hero-slide hero-slide-${index}" data-hero-slide="${index}" role="group" aria-roledescription="슬라이드" aria-label="${index+1} / ${slides.length} · ${slide.label}" aria-hidden="${index!==heroIndex}" ${index!==heroIndex?'hidden inert':''}><div class="hero-copy"><${index===0?'h1':'h2'}>${slide.title}</${index===0?'h1':'h2'}><div class="hero-actions">${slide.action}</div></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="pick-ticket"><div class="ticket-head"><span>MY CAMPUS</span>✦</div><div class="ticket-big">${slide.ticket}</div><div class="ticket-dash"></div><div class="ticket-small">${slide.small}</div></div><span class="floating-star">✦</span><span class="ticket-dot"></span></div></div>`).join('')}</div><div class="hero-pagination"><button class="hero-arrow hero-previous" data-action="hero-previous" aria-label="이전 배너">${icon('chevron')}</button><div class="hero-dots" aria-label="배너 선택">${slides.map((slide,index)=>`<button class="hero-dot ${index===heroIndex?'active':''}" data-action="hero-select" data-id="${index}" aria-label="${index+1}번째 배너 · ${slide.label}" aria-pressed="${index===heroIndex}"></button>`).join('')}</div><button class="hero-arrow" data-action="hero-next" aria-label="다음 배너">${icon('chevron')}</button></div></section>`;
}
function setHeroSlide(index){
 const carousel=$('.hero-carousel');if(!carousel)return;
 const slides=carousel.querySelectorAll('[data-hero-slide]');if(!slides.length)return;
 heroIndex=(Number(index)+slides.length)%slides.length;
 slides.forEach((slide,n)=>{slide.hidden=n!==heroIndex;slide.inert=n!==heroIndex;slide.setAttribute('aria-hidden',String(n!==heroIndex));});
 carousel.querySelectorAll('.hero-dot').forEach((dot,n)=>{dot.classList.toggle('active',n===heroIndex);dot.setAttribute('aria-pressed',String(n===heroIndex));});
}
function setupHeroCarousel(){
 const carousel=$('.hero-carousel');if(!carousel)return;
 carousel.addEventListener('keydown',e=>{
  if(e.target!==carousel.querySelector('.hero-stage')&&!e.target.closest('.hero-pagination'))return;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setHeroSlide(heroIndex+(e.key==='ArrowLeft'?-1:1));}
  else if(e.key==='Home'||e.key==='End'){e.preventDefault();setHeroSlide(e.key==='Home'?0:carousel.querySelectorAll('[data-hero-slide]').length-1);}
 });
 setupStepGestures(carousel.querySelector('.hero-stage'),direction=>setHeroSlide(heroIndex+direction));
}
function stats(){
 const eligible=recommendedItems();
 const urgent=eligible.filter(i=>daysLeft(i)<=3).length;
 const tiles=[
  {icon:'spark',label:profile?'맞춤 PICK!':'모집중인 기회',value:eligible.length,action:'quick-open'},
  {icon:'clock',label:'마감 PICK!',value:urgent,action:'quick-urgent',urgent:true},
  {icon:'bookmark',label:'MY PICK!',value:saved.size,action:'go-saved'}
 ];
 return `<div class="quick-stats">${tiles.map(tile=>`
  <button type="button" class="stat ${tile.urgent?'stat-urgent':''}" data-action="${tile.action}" aria-label="${mobileLayout.matches&&tile.mobileLabel?tile.mobileLabel:tile.label} ${tile.value}개 보기" ${tile.action!=='go-saved'?'aria-haspopup="dialog"':''}>
   <span class="stat-content"><span class="stat-caption"><span class="stat-icon">${icon(tile.icon)}</span><span class="stat-label${tile.mobileLabel?' stat-label-desktop':''}">${tile.label}</span>${tile.mobileLabel?`<span class="stat-label-mobile">${tile.mobileLabel}</span>`:''}</span>
   <span class="stat-value"><b class="stat-number">${tile.value}</b><span class="stat-unit">개</span></span>
   </span><span class="stat-arrow">${icon('arrow')}</span>
  </button>`).join('')}</div>`;
}
const pageTitle=(label,glyph,exclaim=false)=>`<h1 class="page-title">${icon(glyph)}<span>${esc(label)}${exclaim?'!':''}</span></h1>`;
function typeTabs(){return `<div class="saved-tabs type-tabs" aria-label="${view==='recommend'?'추천 정보 유형':'저장한 정보 유형'}">${[['notice','book','공지사항'],['program','pencil','비교과 프로그램']].map(([kind,glyph,name])=>`<button class="chip ${listType()===kind?'active':''}" data-tab="${kind}" aria-pressed="${listType()===kind}">${icon(glyph)}${view==='recommend'?`<span>${kind==='notice'?'공지 PICK!':'비교과 PICK!'}</span>`:`<span>${name}</span>`}</button>`).join('')}</div>`;}
function render(){
 renderNav();
 main.classList.toggle('recommend-home',view==='recommend');
 main.classList.toggle('saved-page',view==='saved');
 main.classList.toggle('browse-page',view==='notices'||view==='programs');
 main.classList.toggle('saved-recommended',view==='saved'&&isRecommendedTab());
 if(view==='profile'){main.innerHTML=profilePage();return;}
 if(view==='saved'){renderSaved();return;}
 const config=exploreViews[view];
 const header=view==='recommend'?hero()+stats():`<div class="section-head"><div>${pageTitle(config?.heading||'학교의 모든 기회',config?.type==='program'?'pencil':'book')}<p>${config?.description||'학교 소식을 확인해 보세요.'}</p></div></div>`;
 const results=`<div id="results">${resultHtml()}</div>`;
 const listing=view==='recommend'?`<div class="recommend-filter-panel" role="group" aria-label="맞춤추천 분류와 결과">${typeTabs()}${filterHtml()}${results}</div>`:`<div class="browse-filter-panel" role="group" aria-label="${config?.title||'학교 소식'} 검색과 필터">${filterHtml()}</div>${results}`;
 main.innerHTML=header+`<section class="opportunity-content" aria-label="${view==='recommend'?'맞춤 추천 목록':config?.title||'학교 소식'}">${listing}</section><div class="info-row ai-compare-info">${icon('spark')}<div><b>AI 비교하기</b><p>카드에 있는 'AI 비교하기'로 최대 3개의 정보를 비교할 수 있어요!</p></div></div>`;
 fitCategoryRows();
 setupHeroCarousel();
 setupCarousels();
}
function renderSaved(){
 const listing=typeTabs()+filterHtml()+`<div id="results">${resultHtml()}</div>`;
 main.innerHTML=`<div class="section-head"><div>${pageTitle('MY PICK','bookmark')}</div></div>`+`<div class="recommend-filter-panel saved-filter-panel" role="group" aria-label="저장한 PICK 분류와 결과">${listing}</div>`;
 fitCategoryRows();
}

function profilePage(){
 const info=profile?`<dl class="profile-dl profile-summary-list">${[
  ['이름',esc(profile.name||'아직 입력하지 않았어요')],
  ['학년',gradeLabel(profile.grade)],
  ['트랙',profile.tracks.filter(Boolean).map(t=>`<span class="profile-tag track-profile-tag">${esc(t)}</span>`).join('')],
  ['관심 분야',profile.interests.map(id=>`<span class="profile-tag">${esc(cat(id).name)}</span>`).join('')]
 ].map(([title,value])=>`<div class="profile-summary-row"><dt>${title}</dt><dd>${value}</dd></div>`).join('')}</dl>`:'<p class="account-description profile-empty-copy">이름과 학년·트랙·관심 분야를 알려주세요.</p>';
 return `<div class="section-head"><div>${pageTitle('MY PAGE','user')}</div></div><section class="account-management profile-information" aria-labelledby="profile-information-title"><h2 id="profile-information-title">내 정보</h2><div class="profile-card management-menu profile-summary-card">${info}<div class="profile-edit-actions"><button class="primary" data-action="profile">${profile?'내 정보 수정':'내 정보 입력하기'} ${icon('arrow')}</button></div></div></section><section class="account-management login-settings-card" aria-labelledby="login-management-title"><h2 id="login-management-title">로그인 관리</h2><div class="profile-card management-menu"><button type="button" class="account-row management-menu-row compact-menu-row social-settings-row" data-action="account-social" aria-haspopup="dialog"><span class="management-menu-copy"><span class="management-menu-title">소셜 계정 연결</span></span><span class="account-provider-icons" aria-hidden="true">${['kakao','google'].map(id=>`<span class="provider-symbol ${id}-symbol">${document.querySelector(`[data-login-action="${id}"]`)?.querySelector('.provider-symbol')?.innerHTML||''}</span>`).join('')}</span></button><button type="button" class="account-row management-menu-row compact-menu-row" data-action="account-password" aria-haspopup="dialog"><span class="management-menu-copy"><span class="management-menu-title">비밀번호 변경</span></span>${icon('chevron')}</button></div></section><section class="account-management" aria-labelledby="account-management-title"><h2 id="account-management-title">추천 및 계정 관리</h2><div class="profile-card management-menu"><button type="button" class="management-menu-row" data-action="reset-confirm" aria-haspopup="dialog"><span class="management-menu-copy"><span class="management-menu-title">추천정보 다시 설정</span><span class="management-menu-description">학년·트랙·관심 분야</span></span>${icon('chevron')}</button><button type="button" class="management-menu-row" data-action="account-delete" aria-haspopup="dialog"><span class="management-menu-copy"><span class="management-menu-title">회원 탈퇴</span><span class="management-menu-description">계정·내 정보·MY PICK 삭제</span></span>${icon('chevron')}</button></div>${!mobileLayout.matches?'<button class="local-data-action" data-action="reset-local-confirm">이 브라우저의 정보와 MY PICK 초기화</button>':''}</section>`;
}
function renderMiniMy(){
 const avatar=$('.avatar');if(!avatar)return;
 const displayName=getAccountUser()?.name||profile?.name;avatar.textContent=displayName?displayName.trim().slice(-2):'MY';
 avatar.setAttribute('data-action','mini-my');avatar.setAttribute('aria-label','MY 메뉴 열기');avatar.setAttribute('aria-haspopup','true');avatar.setAttribute('aria-expanded','false');
 let menu=$('#mini-my-menu');if(!menu)return;
 const account=getAccountUser();
 menu.hidden=true;menu.innerHTML=`<button data-action="profile">정보 수정</button>${account?`<button class="mini-my-auth is-logout" data-action="account-logout">${icon('external')}<span>로그아웃</span></button>`:`<button class="mini-my-auth is-login" data-login-action="open">${icon('lock')}<span>로그인</span></button>`}`;
}
async function accountLogout(){
 const button=$('[data-action="account-logout"]');if(button)button.disabled=true;
 try{await logoutAccount();profile=null;saved.clear();compared.clear();profileEpoch++;draft=null;pendingProfileDraft=null;profileOrigin=null;discardDestination=null;persist();closeModal();navigate('recommend');window.dispatchEvent(new Event('hsu-signout'));toast('로그아웃했어요.');}
 catch(error){toast(error?.message||'로그아웃하지 못했어요. 다시 시도해 주세요.');}
 finally{const current=$('[data-action="account-logout"]');if(current)current.disabled=false;}
}
function accountDialog(kind,provider=''){
 const title=kind==='password'?'비밀번호 변경':kind==='delete'?'회원 탈퇴':'소셜 계정 연결';
 const socialOptions=kind==='social'?`<div class="social-connections">${[['kakao','카카오'],['google','구글']].map(([id,label])=>`<button type="button" class="social-connection" data-action="connect-social" data-id="${id}"><span class="provider-symbol ${id}-symbol" aria-hidden="true">${document.querySelector(`[data-login-action="${id}"]`)?.querySelector('.provider-symbol')?.innerHTML||''}</span><span>${label}</span><span class="connection-state">연결하기 ${icon('chevron')}</span></button>`).join('')}</div><p id="social-connect-feedback" class="signup-error" role="status" aria-live="polite"></p>`:'';
 const content=kind==='password'?`<form id="account-password-form" novalidate><label class="account-label">현재 비밀번호<input class="form-input" name="currentPassword" type="password" autocomplete="current-password" required maxlength="256"></label><label class="account-label">새 비밀번호<input class="form-input" name="newPassword" type="password" autocomplete="new-password" required maxlength="32"></label><p class="signup-hint">영문·숫자·특수문자 포함 8~32자</p><label class="account-label">새 비밀번호 확인<input class="form-input" name="confirmPassword" type="password" autocomplete="new-password" required maxlength="32"></label><p id="account-feedback" class="form-error" role="status" aria-live="polite"></p><button class="primary" type="submit">비밀번호 변경</button></form>`:`${kind==='delete'?'<ul class="management-explanation"><li>한성 PICK 계정</li><li>이름·학년·트랙·관심 분야</li><li>저장한 MY PICK</li></ul><p class="account-description">연결된 카카오·구글 계정 자체는 삭제되지 않습니다.</p>':''}<p class="account-notice">현재 계정 서버가 연결되지 않아 ${kind==='delete'?'회원 탈퇴를 진행할':'소셜 계정을 연결할'} 수 없어요.</p>${socialOptions}`;
 openModal(`${modalHead(title,'')}<div class="modal-content">${content}</div><div class="modal-footer"><button class="secondary" data-action="close">뒤로가기</button>${kind==='delete'?'<button type="button" class="withdrawal-confirm" disabled>회원 탈퇴</button>':''}</div>`,'account-'+kind+(provider?'-'+provider:''));
 if(kind==='password')$('#account-password-form').addEventListener('submit',e=>{e.preventDefault();const f=$('#account-password-form'),current=f.querySelector('[name="currentPassword"]'),next=f.querySelector('[name="newPassword"]'),confirm=f.querySelector('[name="confirmPassword"]');const error=!current.value?'현재 비밀번호를 입력해 주세요.':passwordError(next.value)||confirmationError(next.value,confirm.value)||(current.value===next.value?'현재 비밀번호와 다른 비밀번호를 입력해 주세요.':'');$('#account-feedback').textContent=error||'계정 서버가 연결되지 않아 비밀번호를 변경할 수 없어요.';if(!error)[current,next,confirm].forEach(el=>el.value='');});
}
function renderTray(){document.body.classList.toggle('has-tray',compared.size>0);$('#compare-tray').innerHTML=compared.size?`<div class="compare-bar"><span>${icon('compare')}</span><div><b>비교할 PICK ${compared.size} / 3</b><small>${compared.size<2?'하나 더 골라 나란히 비교해요':'대상·기간·혜택·준비사항 한눈에'}</small></div><button class="clear-btn" data-action="clear-compare">선택 해제</button><button class="primary" data-action="compare" ${compared.size<2?'disabled':''}>AI 비교하기 ${icon('arrow')}</button></div>`:'';}
// History stores logical screens on every viewport; passwords are never included.
let overlayDepth=0,restoringHistory=false,pendingProfileDraft=null,pendingDestination=null,pendingTrackFocus=null,pendingOnboardingProfile=false;
let profileOrigin=null,profileBaseline='',discardDestination=null,profileEpoch=0,accountEpoch=0;
const profileDraftKey=value=>JSON.stringify({name:value?.name||'',grade:value?.grade??null,tracks:[1,2,3].map(n=>value?.tracks[n-1]||''),interests:[...(value?.interests||[])].sort()});
function profileChanged(){if($('#profile-form'))captureProfileDraft();return !!draft&&profileDraftKey(draft)!==profileBaseline;}
function confirmProfileDiscard(destination=null){discardDestination=destination;openModal(`${modalHead('수정 내용을 취소할까요?','')}<div class="modal-content"><p>저장하지 않은 변경사항이 사라져요.</p></div><div class="modal-footer"><button class="primary" data-action="keep-profile">계속 입력하기</button><button class="secondary" data-action="discard-profile">수정 취소</button></div>`,'profile-discard');}
function mobileSnapshot(){
 if($('#profile-form'))captureProfileDraft();
 return {view,category,query,type,sort,openOnly,savedTab,recommendTab,searchExpanded,heroIndex,profileEpoch,accountEpoch,onboardingStep,onboardingEpoch,onboardingBeforeLogin,scrollY:window.scrollY||0,modalScroll:modal.scrollTop||0,contentScroll:modal.querySelector('.modal-content')?.scrollTop||0,modal:modal.open?modalView:null,depth:modal.open?overlayDepth:0,draft:draft?structuredClone(draft):null,trackPicker:trackPicker?structuredClone(trackPicker):null};
}
function rememberMobile(){if(!restoringHistory)history.replaceState({...history.state,hsuUI:mobileSnapshot()},'',location.hash||'#recommend');}
function backInApp(all=false){
 if(modalView==='onboarding'&&onboardingBeforeLogin){finishOnboarding();return;}
 if(modalView==='onboarding')markOnboardingSeen();
 if(modalView==='profile-discard'){discardDestination=null;if(overlayDepth>0)history.back();return;}
 if((modalView==='profile-1'||(modalView==='profile-2'&&all))&&profileChanged()){confirmProfileDiscard();return;}
 if(overlayDepth>0){history.go(all?-overlayDepth:-1);return;}
 closeModal();
}
function finishMobileFlow(next){
 if(overlayDepth>0){pendingDestination=next;history.go(-overlayDepth);return;}
 closeModal();navigate(next);
}
function restoreMobile(state){
 if(state.accountEpoch!==accountEpoch)state={...state,modal:null,depth:0,draft:null,trackPicker:null,profileEpoch};
 if(modalView==='onboarding'&&state.modal!=='onboarding')markOnboardingSeen();
 if(state.modal==='onboarding'&&state.onboardingEpoch!==onboardingEpoch)state={...state,modal:null,depth:0};
 if(['profile-1','profile-2','track-picker','profile-discard'].includes(state.modal)&&state.profileEpoch!==profileEpoch)state={...state,modal:null,depth:0,draft:null,trackPicker:null};
 const profileFlow=kind=>kind==='track-picker'||kind==='profile-1'||kind==='profile-2';
 if($('#profile-form'))captureProfileDraft();
 const liveDraft=modal.open&&profileFlow(modalView)&&profileFlow(state.modal)?structuredClone(draft):null;
 restoringHistory=true;if(modal.open)closeModal();
 ({view,category,query,type,sort,openOnly,savedTab,recommendTab,searchExpanded,heroIndex}=state);
 draft=pendingProfileDraft||liveDraft||state.draft;pendingProfileDraft=null;trackPicker=state.trackPicker;overlayDepth=state.depth||0;
 render();renderTray();const kind=state.modal;
 if(kind?.startsWith('detail-'))detail(kind.slice(7));
 else if(kind?.startsWith('source-'))source(kind.slice(7));
 else if(kind?.startsWith('quick-list-'))quickList(kind.slice(11));
 else if(kind==='profile-1'||kind==='profile-2')profileStep(kind==='profile-1'?1:2);
 else if(kind==='track-picker'&&trackPicker)renderTrackPicker();
 else if(kind==='compare')comparison();
 else if(kind==='reset-profile'||kind==='reset')resetConfirm(kind==='reset');
 else if(kind?.startsWith('account-')){const [,action,provider]=kind.split('-');accountDialog(action,provider);}
 else if(kind?.startsWith('image-')){const parts=kind.match(/^image-(.*)-(\d+)$/);if(parts)imageViewer(parts[1],Number(parts[2]));}
 else if(kind==='profile-discard')confirmProfileDiscard(discardDestination);
 else if(kind==='about')about();
 else if(kind==='onboarding')showOnboarding(state.onboardingStep||0,!!state.onboardingBeforeLogin);
 if(pendingTrackFocus&&kind==='profile-1'){$('#track-picker-'+pendingTrackFocus)?.focus();pendingTrackFocus=null;}restoringHistory=false;if(modal.open){modal.scrollTop=state.modalScroll||0;const content=modal.querySelector('.modal-content');if(content)content.scrollTop=state.contentScroll||0;}window.scrollTo({top:state.scrollY||0,behavior:'instant'});
 if(pendingDestination){const next=pendingDestination;pendingDestination=null;navigate(next);}
 if(pendingOnboardingProfile){pendingOnboardingProfile=false;startProfile();}
}
function openModal(html,kind,wide=false){const changed=kind!==modalView,previousDepth=modal.open?overlayDepth:0;if(!restoringHistory)rememberMobile();if(!modal.open)lastFocus=document.activeElement;modalView=kind;modal.className=(wide?'compare-dialog ':'')+(!modal.open&&!restoringHistory?'modal-enter':'');modal.innerHTML='<p class="connection-notice" hidden role="status"></p>'+html;if(!modal.open){modal.showModal();document.body.style.overflow='hidden';}modal.scrollTop=0;updateConnectivity();const focusEl=modal.querySelector('[data-autofocus]')||modal.querySelector('.close-btn');focusEl?.focus();if(!restoringHistory){overlayDepth=changed?previousDepth+1:previousDepth;const state={...history.state,hsuUI:mobileSnapshot()};if(changed)history.pushState(state,'',location.hash||'#recommend');else history.replaceState(state,'',location.hash||'#recommend');}}
const ONBOARDING_KEY='hsupick-onboarding-v2';
let onboardingStep=0,onboardingEpoch=0,onboardingSeen=false,onboardingBeforeLogin=false;
const onboardingSteps=[
 {icon:'user',title:'나를 알려주면, 추천이 시작돼요',description:'학년·트랙·관심 분야를 입력해 주세요.\n나에게 맞는 공지와 프로그램을 먼저 골라드려요.',label:'내 정보',preview:'학년 → 트랙 → 관심 분야'},
 {icon:'spark',title:'지금 필요한 기회를 PICK!',description:'추천 이유와 대상·마감·혜택을 확인해 보세요.\n궁금한 기회는 선택해서 함께 비교할 수 있어요.',label:'맞춤 추천',preview:'대상 · 마감 · 혜택을 한눈에'},
 {icon:'bookmark',title:'관심 있는 기회는 MY PICK',description:'북마크를 누르면 MY PICK에 모아볼 수 있어요.\n실제 신청은 학교 사이트에서 진행해 주세요.',label:'MY PICK',preview:'저장한 기회를 한곳에'},
 {icon:'compare',title:'고민되는 기회는 AI 비교하기',description:'카드의 AI 비교하기에서 2~3개를 선택해 주세요.\n대상·기간·혜택을 나란히 확인할 수 있어요.',label:'AI 비교하기',preview:'최대 3개의 기회를 한눈에 비교'}
];
function markOnboardingSeen(){onboardingSeen=true;try{localStorage.setItem(ONBOARDING_KEY,'1');}catch{}}
function showOnboarding(step=0,beforeLogin=onboardingBeforeLogin){
 onboardingBeforeLogin=beforeLogin;onboardingStep=Math.max(0,Math.min(onboardingSteps.length-1,Number(step)||0));const item=onboardingSteps[onboardingStep],last=onboardingStep===onboardingSteps.length-1;
 openModal(`<div class="onboarding-top"><span>한성 PICK 시작하기</span><button type="button" class="close-btn onboarding-skip" data-action="onboarding-skip">건너뛰기</button></div><div class="modal-content onboarding-content"><div class="onboarding-preview" aria-hidden="true"><span class="onboarding-symbol">${icon(item.icon)}</span><b>${item.label}</b><span>${item.preview}</span></div><div class="onboarding-copy" aria-live="polite" aria-atomic="true"><span class="onboarding-step">${onboardingStep+1} / ${onboardingSteps.length}</span><h2 id="modal-title" tabindex="-1" data-autofocus>${item.title}</h2><p>${item.description.split('\n').join('<br>')}</p></div><div class="onboarding-dots" aria-hidden="true">${onboardingSteps.map((_,i)=>`<span class="${i===onboardingStep?'active':''}"></span>`).join('')}</div></div><div class="modal-footer onboarding-footer">${onboardingStep?'<button type="button" class="secondary" data-action="onboarding-previous">이전</button>':''}<button type="button" class="primary" data-action="${last?'onboarding-finish':'onboarding-next'}">${last?(beforeLogin?'시작하기':profile?'PICK 둘러보기':'내 정보 입력하기'):'다음'}</button></div>`,'onboarding');
 modal.classList.add('onboarding-dialog');if(beforeLogin)modal.classList.add('welcome-dialog');
}
function finishOnboarding(start=false){
 markOnboardingSeen();onboardingEpoch++;
 if(onboardingBeforeLogin){onboardingBeforeLogin=false;closeModal();overlayDepth=0;history.replaceState(null,'','#login');window.dispatchEvent(new Event('hsu-onboarding-complete'));return;}
 if(start&&!profile){if(overlayDepth>0){pendingOnboardingProfile=true;backInApp(true);}else{closeModal();startProfile();}}else backInApp(true);
}
window.addEventListener('hsu-onboarding-start',()=>showOnboarding(0,true));
window.addEventListener('hsu-app-enter',()=>{
 let seen=onboardingSeen;try{seen=seen||localStorage.getItem(ONBOARDING_KEY)==='1';}catch{}
 if(!seen&&!modal.open)showOnboarding();
});
function quickList(kind){
 const urgent=kind==='urgent';
 const list=recommendedItems().filter(i=>!urgent||daysLeft(i)<=3);
 if(urgent)list.sort((a,b)=>a.deadline.localeCompare(b.deadline));
 const title=urgent?'마감 PICK!':profile?'추천 PICK!':'모집 중인 기회';
 const groups=['notice','program'].map(type=>{
  const items=list.filter(i=>i.type===type);if(!items.length)return '';
  return `<section class="quick-list-group"><h3>${icon(type==='notice'?'book':'pencil')}${type==='notice'?'공지사항':'비교과프로그램'}</h3><div class="cards quick-list-cards">${items.map(i=>card(i)).join('')}</div></section>`;
 }).join('');
 openModal(`${modalHead(title,'')}<div class="modal-content"><div class="result-line" role="status"><span>총 <strong>${list.length}</strong>개의 기회</span></div>${groups||empty(urgent?'3일 내 마감되는 기회가 없어요':'현재 모집 중인 기회가 없어요','다른 기회도 맞춤추천에서 확인해보세요.','','',urgent?'clock':'spark')}</div><div class="modal-footer"><button class="secondary" data-action="compare" ${compared.size<2?'disabled':''}>선택한 PICK 비교</button><button class="primary" data-action="close">닫기</button></div>`,'quick-list-'+kind,true);
}
function closeModal(){modal.close();modalView=null;}
modal.addEventListener('close',()=>{if(modal.open)return;document.body.style.overflow='';modalView=null;modal.innerHTML='';updateConnectivity();const selector=lastFocus?.dataset?.action?`[data-action="${lastFocus.dataset.action}"]${lastFocus.dataset.id?`[data-id="${lastFocus.dataset.id}"]`:''}`:null;const returnTo=lastFocus?.isConnected?lastFocus:selector?document.querySelector(selector):null;(returnTo||main).focus();});
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){if(modalView==='track-picker')returnFromTrackPicker();else backInApp(true);}}});
modal.addEventListener('cancel',e=>{e.preventDefault();if(modalView==='track-picker'&&trackPicker?.menu){trackPicker.menu=null;renderTrackPicker();}else if(modalView==='track-picker')returnFromTrackPicker();else backInApp();});
const modalHead=(title,subtitle,eyebrow='')=>`<div class="modal-head"><div>${eyebrow?`<div class="step-label">${esc(eyebrow)}</div>`:''}<h2 id="modal-title">${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button class="close-btn" data-action="close" aria-label="닫기">${icon('close')}</button></div>`;
const gradeLabel=grade=>grade==='other'?'기타':`${grade}학년`;
let trackPicker=null;
function captureProfileDraft(){
 const selected=modal.querySelector('input[name="grade"]:checked');
 if($('#profile-name'))draft.name=$('#profile-name').value.trim();
 draft.grade=selected?(selected.value==='other'?'other':Number(selected.value)):null;
 draft.tracks=(Number(draft.grade)===1?[1]:[1,2,3]).map(n=>$('#track'+n)?.value.trim()||'');
}
function updateProfileProgress(){if(!mobileLayout.matches||!$('#profile-form'))return;const next=$('#profile-form').querySelector('[type="submit"]');next.disabled=draft.grade===null||!draft.tracks[0]||(Number(draft.grade)!==1&&!draft.tracks[1]);}
function trackFields(){
 return (Number(draft.grade)===1?[1]:[1,2,3]).map(n=>`<div class="form-group track-field"><label class="form-label" for="track-picker-${n}">${n}트랙${n<=(Number(draft.grade)===1?1:2)?' <span>필수</span>':' <span>선택</span>'}</label><input type="hidden" id="track${n}" name="track${n}" value="${esc(draft.tracks[n-1]||'')}"><div class="track-field-control"><button type="button" class="form-input track-picker-trigger ${draft.tracks[n-1]?'has-value':''}" id="track-picker-${n}" data-action="pick-track" data-slot="${n}" aria-haspopup="dialog"><span>${esc(draft.tracks[n-1]||(n===1&&Number(draft.grade)===1?'소속 대학·학부·학과를 선택해 주세요':`${n}트랙을 선택해 주세요`))}</span>${icon('chevron')}</button>${n>1&&draft.tracks[n-1]?`<button type="button" class="track-clear" data-action="clear-track" data-slot="${n}" aria-label="${n}트랙 선택 해제">${icon('close')}</button>`:''}</div></div>`).join('');
}
function startProfile(){profileEpoch++;profileOrigin=profile?view:null;draft=profile?structuredClone(profile):{name:'',grade:null,tracks:[''],interests:[]};draft.tracks=draft.tracks.map(t=>t==='미정'?'':t);profileBaseline=profileDraftKey(draft);profileStep(1);}
function profileStep(step){
 if(Number(draft.grade)===1)draft.tracks=draft.tracks.slice(0,1);
 if(step===1){
  openModal(`<form id="profile-form" novalidate><div class="step-progress"><span class="done"></span><span></span></div>${modalHead('나에 대해 알려주세요!','학년·트랙·관심 분야로 나에게 맞는 추천을 시작해요.','01 / 02')}<div class="modal-content">${`<label class="form-group account-label" for="profile-name">이름<input id="profile-name" class="form-input" name="displayName" autocomplete="name" maxlength="30" value="${esc(draft.name||'')}" placeholder="이름을 입력해 주세요"></label>`}<fieldset class="form-group"><legend>학년</legend><div class="grades grades-five">${[1,2,3,4,'other'].map(g=>`<label class="radio-tile"><input type="radio" name="grade" value="${g}" ${String(draft.grade)===String(g)?'checked':''} aria-label="${gradeLabel(g)}"><span>${gradeLabel(g)}</span></label>`).join('')}</div></fieldset><div id="profile-track-fields" ${draft.grade===null?'hidden':''}>${trackFields()}</div><p id="form-error" class="form-error" role="alert"></p></div><div class="modal-footer"><button class="primary" type="submit">관심 분야 ${icon('arrow')}</button></div></form>`,'profile-1');
  updateProfileProgress();
  $('#profile-form').addEventListener('change',e=>{
   if(e.target.name!=='grade')return;
   captureProfileDraft();
   if(draft.tracks[0]&&!isSelectableTrack(draft.tracks[0],{slot:1,grade:draft.grade}))draft.tracks[0]='';
   $('#profile-track-fields').hidden=false;$('#profile-track-fields').innerHTML=trackFields();updateProfileProgress();$('#form-error').textContent='';
  });
  $('#profile-form').addEventListener('submit',e=>{
   e.preventDefault();captureProfileDraft();
   if(!draft.name){$('#form-error').textContent='이름을 입력해 주세요.';$('#profile-name').focus();return;}
   if(draft.grade===null){$('#form-error').textContent='학년을 선택해 주세요.';modal.querySelector('input[name="grade"]').focus();return;}
   if(!draft.tracks[0]){$('#form-error').textContent='1트랙을 선택해 주세요. 1학년은 소속 대학·학부·학과를 선택해 주세요.';$('#track-picker-1').focus();return;}
   if(Number(draft.grade)!==1&&!draft.tracks[1]){$('#form-error').textContent='2트랙을 선택해 주세요.';$('#track-picker-2').focus();return;}
   const tracks=draft.tracks.filter(Boolean),normalized=tracks.map(normalizeTrack);
   if(new Set(normalized).size!==normalized.length){$('#form-error').textContent='같은 트랙을 두 번 선택할 수 없어요. 선택한 트랙을 확인해 주세요.';return;}
   if(draft.tracks.some((t,n)=>t&&!isSelectableTrack(t,{slot:n+1,grade:draft.grade}))){$('#form-error').textContent='목록에서 선택해 주세요. 1학년의 1트랙은 소속 대학·학부·학과를 선택해야 해요.';return;}
   profileStep(2);
  });
 }else{
  openModal(`<form id="interest-form"><div class="step-progress"><span class="done"></span><span class="done"></span></div>${modalHead(`${(draft.name||'').trim().slice(-2)}님의 관심 분야를 알려주세요.`,'관심 분야를 1~4개 선택해 주세요.','02 / 02 · 관심 분야')}<div class="modal-content"><div class="interest-grid">${CATEGORIES.map(c=>`<label class="interest-tile"><input type="checkbox" name="interest" value="${c.id}" ${draft.interests.includes(c.id)?'checked':''} aria-label="${c.name}"><span class="interest-content">${icon(c.icon)}<span><b>${c.name}</b><small>${c.hint}</small></span></span></label>`).join('')}</div><p id="form-error" class="form-error" role="alert"></p></div><div class="modal-footer"><button type="button" class="secondary" data-action="profile-back">이전</button><button class="primary" type="submit">${icon('spark')} PICK 보기</button></div></form>`,'profile-2');
  $('#interest-form').addEventListener('change',e=>{if(e.target.name==='interest'){const selected=[...modal.querySelectorAll('input[name="interest"]:checked')];if(selected.length>4){e.target.checked=false;$('#form-error').textContent='관심 분야는 최대 4개까지 선택할 수 있어요.';}else{$('#form-error').textContent='';}draft.interests=[...modal.querySelectorAll('input[name="interest"]:checked')].map(i=>i.value);}});
  $('#interest-form').addEventListener('submit',e=>{e.preventDefault();if(!draft.interests.length){$('#form-error').textContent='관심 분야를 최소 1개 선택해 주세요.';modal.querySelector('input[name="interest"]').focus();return;}const tracks=Number(draft.grade)===1?draft.tracks.slice(0,1):[...draft.tracks];while(tracks.length>1&&!tracks.at(-1))tracks.pop();profile={...structuredClone(draft),tracks};const ok=persist();profileBaseline=profileDraftKey(draft);profileEpoch++;finishMobileFlow(profileOrigin||'recommend');toast(ok?(profileOrigin?'내 정보를 수정했어요.':'나에게 맞는 추천이 준비됐어요.'):'추천이 준비됐어요. 이번 방문 동안만 정보가 유지됩니다.');});
 }
}
function openTrackPicker(slot){
 captureProfileDraft();if(Number(draft.grade)===1&&Number(slot)!==1)return;trackPicker={slot:Number(slot),college:'all',group:'all',search:'',menu:null,browsing:false};renderTrackPicker();
}
function trackGroups(){return TRACK_COLLEGES.filter(c=>trackPicker.college==='all'||c.id===trackPicker.college).flatMap(c=>c.groups.map((g,n)=>({id:`${c.id}-${n}`,name:g.name,college:c.name})));}
function trackFilterMenu(kind){
 const college=TRACK_COLLEGES.find(c=>c.id===trackPicker.college),groups=trackGroups();
 const choices=kind==='college'?TRACK_COLLEGES:groups;
 const current=kind==='college'?trackPicker.college:trackPicker.group;
 const name=kind==='college'?college?.name:groups.find(g=>g.id===trackPicker.group)?.name;
 return `<div class="track-dropdown"><button type="button" class="track-filter-button ${current!=='all'?'selected':''}" data-action="track-filter-menu" data-kind="${kind}" aria-expanded="${trackPicker.menu===kind}" aria-controls="track-menu-${kind}">${esc(name||(kind==='college'?'전체 대학':'전체 학부·학과'))}${icon('chevron')}</button>${trackPicker.menu===kind?`<div class="track-filter-menu" id="track-menu-${kind}" role="group" aria-label="${kind==='college'?'대학':'학부·학과'} 선택"><button type="button" data-action="track-filter-value" data-kind="${kind}" data-id="all" aria-pressed="${current==='all'}">${kind==='college'?'전체 대학':'전체 학부·학과'}</button>${choices.map(c=>`<button type="button" data-action="track-filter-value" data-kind="${kind}" data-id="${c.id}" aria-pressed="${current===c.id}">${esc(c.name)}</button>`).join('')}</div>`:''}</div>`;
}
function selectedElsewhere(name){return draft.tracks.some((t,n)=>n!==trackPicker.slot-1&&t&&normalizeTrack(t)===normalizeTrack(name));}
function trackOption(option){
 const selected=draft.tracks[trackPicker.slot-1]===option.name,used=selectedElsewhere(option.name);
 return `<button type="button" class="track-option ${selected?'selected':''}" data-action="select-track" data-id="${option.id}" aria-pressed="${selected}" ${used?'disabled':''}><span><b>${esc(option.name)}</b>${option.note?`<small>${esc(option.note)}</small>`:''}</span><span class="track-option-state">${used?'선택됨':selected?icon('check'):icon('chevron')}</span></button>`;
}
function firstYearCollegeOption(){if(trackPicker.slot!==1||Number(draft.grade)!==1||trackPicker.college==='all')return '';const option=trackOptionsForSlot({slot:1,grade:1}).find(t=>t.kind==='college'&&t.collegeId===trackPicker.college);return option?`<p class="track-result-count">소속 대학으로 선택하거나 학부·학과를 좁혀주세요.</p>${trackOption(option)}`:'';}
function trackResultsHtml(){
 const search=normalizeTrackSearch(trackPicker.search);
 if(!trackPicker.browsing&&!search)return '';
 if(mobileLayout.matches&&!search&&(trackPicker.college==='all'||trackPicker.group==='all'))return firstYearCollegeOption();
 const options=trackOptionsForSlot({slot:trackPicker.slot,grade:draft.grade}).filter(t=>(trackPicker.college==='all'||t.collegeId===trackPicker.college)&&(trackPicker.group==='all'||t.groupId===trackPicker.group)&&(!search||normalizeTrackSearch(t.searchText).includes(search)));
 const groups=TRACK_COLLEGES.map(c=>{
  const items=options.filter(t=>t.collegeId===c.id);if(!items.length)return '';
  return `<section class="track-college-group"><h3>${esc(c.name)}</h3>${c.note?`<p class="track-catalog-note">${esc(c.note)}</p>`:''}${items.filter(t=>t.kind==='college').map(trackOption).join('')}${c.groups.map((g,n)=>{const entries=items.filter(t=>t.groupId===`${c.id}-${n}`);return entries.length?`<div class="track-department-group"><h4>${esc(g.name)}</h4>${g.note?`<p class="track-catalog-note">${esc(g.note)}</p>`:''}${entries.map(trackOption).join('')}</div>`:'';}).join('')}</section>`;
 }).join('');
 return `<p class="track-result-count" role="status">${options.length}개의 선택 항목</p>${groups||`<div class="empty track-empty"><h3>검색 결과가 없어요</h3><p>다른 검색어나 분류로 찾아보세요.</p><button type="button" class="secondary" data-action="reset-track-filter">검색·분류 초기화</button></div>`}`;
}
function renderTrackPicker(){
 const firstYear=trackPicker.slot===1&&Number(draft.grade)===1;
 const head=modalHead(`${trackPicker.slot}트랙 선택`,firstYear?'1학년은 소속 대학·학부·학과를 선택해 주세요.':'대학·학부로 분류하거나 이름으로 검색해 주세요.').replace('data-action="close"','data-action="cancel-track"');
 openModal(`${head}<div class="modal-content track-picker-content"><label class="track-searchbox">${icon('search')}<input id="track-search" type="search" value="${esc(trackPicker.search)}" placeholder="${firstYear?'대학·학부·학과 검색':'트랙·전공·학과 검색'}" aria-label="${firstYear?'대학·학부·학과 검색':'트랙·전공·학과 검색'}"></label><div class="track-filter-bar">${trackFilterMenu('college')}${!mobileLayout.matches||trackPicker.college!=='all'?trackFilterMenu('group'):''}</div><div id="track-results">${trackResultsHtml()}</div></div><div class="modal-footer"><button type="button" class="secondary" data-action="cancel-track">이전으로</button></div>`,'track-picker');
 modal.classList.add('track-picker-dialog');
}
function returnFromTrackPicker(){const slot=trackPicker.slot;if(overlayDepth>0){pendingProfileDraft=structuredClone(draft);pendingTrackFocus=slot;backInApp();return;}trackPicker=null;profileStep(1);$('#track-picker-'+slot)?.focus();}
function selectTrackOption(id){
 const option=trackOptionsForSlot({slot:trackPicker.slot,grade:draft.grade}).find(t=>t.id===id);
 if(!option||selectedElsewhere(option.name))return;
 draft.tracks[trackPicker.slot-1]=option.name;returnFromTrackPicker();
}
const applicationNotice=()=>`<div class="application-notice" role="note"><span class="application-notice-icon" aria-hidden="true">⚠️</span><span class="application-notice-copy">실제 신청은 한성대학교 홈페이지에서 진행해야 합니다.<br>아래 버튼을 통해 사이트로 이동해주세요.</span></div>`;
function imageGallery(item){
 const images=noticeImages(item);if(!images.length)return '';
 return `<section class="detail-group notice-images"><h3>공지 이미지</h3>${images.map((img,index)=>`<figure><button type="button" class="notice-image-button" data-action="image-open" data-id="${item.id}" data-index="${index}" aria-label="${esc(img.alt)} 확대 보기"><img src="${esc(img.url)}" alt="${esc(img.alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button><figcaption class="image-fallback" hidden>이미지를 불러오지 못했어요. 아래 공식 사이트에서 확인해 주세요.</figcaption></figure>`).join('')}<p class="signup-hint">이미지를 누르면 크게 볼 수 있어요.</p></section>`;
}
function imageViewer(id,index){
 const item=ITEMS.find(i=>i.id===id),img=item&&noticeImages(item)[index];if(!img)return;
 openModal(`${modalHead('공지 이미지',item.title)}<div class="modal-content image-viewer"><img src="${esc(img.url)}" alt="${esc(img.alt)}" referrerpolicy="no-referrer"><p class="image-fallback" hidden>이미지를 불러오지 못했어요. 원문에서 확인해 주세요.</p><a class="secondary" href="${esc(img.url)}" target="_blank" rel="noopener noreferrer">이미지 원본 열기 ${icon('external')}</a></div><div class="modal-footer"><button class="secondary" data-action="detail-back">뒤로가기</button></div>`,'image-'+id+'-'+index,true);
}
// Only public-list metadata is used for program detail. An explicit publicInfo
// object is authoritative: absent fields are not filled from richer fixture data.
function programInfo(item){
 const source=Object.prototype.hasOwnProperty.call(item,'publicInfo')?(item.publicInfo&&typeof item.publicInfo==='object'?item.publicInfo:{}):{summary:item.subtitle,audience:target(item),applicationPeriod:[item.start,item.deadline].filter(Boolean).map(v=>v.replaceAll('-','.')).join(' ~ '),points:item.benefit?.match(/(\d+)\s*pt/)?.[1],department:item.department};
 const text=key=>typeof source[key]==='string'?source[key].trim():typeof source[key]==='number'?String(source[key]):'';
 const rawPoints=text('points').replace(/\s*pt$/i,'');
 return {summary:text('summary'),audience:text('audience'),applicationPeriod:text('applicationPeriod'),points:/^\d+(?:\.\d+)?$/.test(rawPoints)?rawPoints:'',department:text('department'),location:text('location'),format:text('format')};
}
function programFacts(item){
 const info=programInfo(item),row=(label,value)=>`<div><dt>${label}</dt><dd>${esc(value||'원문 확인')}</dd></div>`;
 return `<dl class="program-facts">${row('신청 대상',info.audience)}${row('신청 기간',info.applicationPeriod)}${row('비교과 pt',info.points?info.points.replace(/\s*pt$/i,'')+'pt':'')}${row('운영 부서',info.department)}${info.location?row('진행 장소',info.location):''}${info.format?row('진행 방식',info.format):''}</dl>`;
}
function programDetailBody(item){
 const summary=programInfo(item).summary;
 return `${summary?`<section class="detail-group program-overview"><h3>${icon('pencil')} 프로그램 한눈에</h3><p class="detail-overview">${esc(summary.length>180?summary.slice(0,180)+'…':summary)}</p></section>`:''}<section class="detail-group"><h3>${icon('info')} 핵심 정보</h3>${programFacts(item)}${programInfo(item).audience?eligibility(item):''}</section><p class="program-source-note">세부 일정·참여 조건·준비사항은 스마트자기관리시스템에서 확인해 주세요.</p>${applicationNotice()}`;
}
function officialUrl(item){
 try{const url=new URL(item.originalUrl);if(url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='hansung.ac.kr'||url.hostname.endsWith('.hansung.ac.kr')))return url.href;}catch{}
 return sourceUrl(item.type);
}
function detail(id){
 const i=ITEMS.find(i=>i.id===id);if(!i)return;
 const shortcut=`<a class="secondary official-shortcut" href="${esc(officialUrl(i))}" target="_blank" rel="noopener noreferrer">${i.type==='notice'?'공지사항':'스마트자기관리시스템'} 바로가기 ${icon('external')}</a>`;
 openModal(`${modalHead(i.title,'',categoryForItem(i).name)}<div class="modal-content">
  <div class="detail-meta"><span class="badge">${i.type==='notice'?'공지사항':'비교과프로그램'}</span>${badge(i)}</div>
  ${i.type==='program'?programDetailBody(i):` ${i.subtitle?`<p class="detail-overview">${esc(i.subtitle)}</p>`:''}${imageGallery(i)}
  <section class="detail-group"><h3>${icon('user')} 신청 대상</h3><p>${esc(target(i))}</p>${eligibility(i)}</section>
  <section class="detail-group"><h3>${icon('calendar')} 신청·활동 기간</h3><p>신청: ${esc(i.start.replaceAll('-','.'))} ~ ${esc(i.deadline.replaceAll('-','.'))}<br>활동 / 결과 안내: ${esc(i.eventAt?i.eventAt.replaceAll('-','.'):'원문 확인')}</p></section>
  <section class="detail-group"><h3>${icon('exclamation')} 받을 수 있는 혜택</h3><p>${esc(i.benefit||'혜택이 기재되어 있지 않습니다. 원문을 확인해 주세요.')}</p></section>
  <section class="detail-group"><h3>${icon('check')} 미리 준비할 것</h3>${i.preparations.length?`<ul>${i.preparations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<p>준비사항이 기재되어 있지 않습니다. 원문을 확인해 주세요.</p>'}</section>
  <section class="detail-group"><h3>${icon('building')} 운영·신청 안내</h3><p>운영 부서: ${esc(i.department||'원문 확인')}</p>${applicationNotice()}</section>`}
  ${i.type==='program'?imageGallery(i):''}<div class="original-actions">${shortcut}${mobileLayout.matches||i.type==='program'?'':`<a class="real-source" href="#source/${i.id}" data-action="source" data-id="${i.id}">공지 내용 보기 ${icon('external')}</a>`}</div>
 </div><div class="modal-footer">${mobileLayout.matches?`<button class="primary" data-action="save" data-id="${i.id}" aria-pressed="${saved.has(i.id)}" aria-label="${saved.has(i.id)?'MY PICK 저장 해제':'MY PICK에 저장'}">${icon('bookmark')} MY PICK</button><button class="secondary" data-action="detail-back">뒤로가기</button>`:`<button class="secondary" data-action="toggle-detail-compare" data-id="${i.id}">${icon('compare')} ${compared.has(i.id)?'비교 해제':'AI 비교하기'}</button><button class="primary" data-action="save" data-id="${i.id}" aria-pressed="${saved.has(i.id)}" aria-label="${saved.has(i.id)?'MY PICK 저장 해제':'MY PICK에 저장'}">${icon('bookmark')} MY PICK</button><button class="secondary" data-action="detail-back">뒤로가기</button>`}</div>`,'detail-'+id);
}
function source(id){
 const i=ITEMS.find(i=>i.id===id);if(!i)return;if(i.type==='program'){detail(id);return;}
 const raw=`${i.title}\n\n작성 부서: ${i.department}\n등록일: ${i.publishedAt?i.publishedAt.slice(0,10):'(기재 없음)'}\n\n${i.subtitle}\n\n■ 모집 대상\n${target(i)}\n\n■ 신청 기간\n${i.start} ~ ${i.deadline}\n\n■ 활동 / 결과 안내\n${i.eventAt||'(기재 없음)'}\n\n■ 참여 혜택\n${i.benefit||'(기재 없음)'}\n\n■ 제출 / 준비사항\n${i.preparations.length?i.preparations.map((x,n)=>(n+1)+'. '+x).join('\n'):'(기재 없음)'}`;
 openModal(`${modalHead('공지 내용',i.title)}<div class="modal-content">${imageGallery(i)}<div class="raw-document">${esc(raw)}</div>${applicationNotice()}<a class="secondary official-shortcut" href="${esc(officialUrl(i))}" target="_blank" rel="noopener noreferrer">${i.type==='notice'?'공지사항':'스마트자기관리시스템'} 바로가기 ${icon('external')}</a></div><div class="modal-footer"><button class="primary" data-action="detail" data-id="${i.id}">상세 정보로 돌아가기</button></div>`,'source-'+id);
}
function comparison(){
 if(compared.size<2)return;
 const list=ITEMS.filter(i=>compared.has(i.id));
 const groups=['notice','program'].map(kind=>{
  const picks=list.filter(i=>i.type===kind);if(!picks.length)return '';
  const name=kind==='notice'?'공지사항':'비교과 프로그램';
  return `<section class="comparison-group" data-kind="${kind}" aria-label="${name} 비교"><div class="section-head"><h2>${name}<span class="group-count">${picks.length}</span></h2></div><div class="cards comparison-cards">${picks.map(i=>card(i,true,true)).join('')}</div></section>`;
 }).join('');
 openModal(`${modalHead('AI 비교하기','공지사항과 비교과 프로그램을 나눠 조건과 준비사항을 비교해요.')}<div class="modal-content"><p class="compare-tip">선택한 ${list.length}개 / 최대 3개</p>${groups}<p class="hint">실제 신청 조건은 학교 원문에서 확인해야 합니다.</p></div><div class="modal-footer"><button class="primary" data-action="complete-compare">비교 완료</button></div>`,'compare',true);
}
function about(){
 const steps=[
 ['user','내 정보 입력','학년·트랙·관심 분야를 입력하면 나에게 맞는 추천을 받을 수 있어요.'],
 ['spark','추천 확인','공지사항과 비교과프로그램의 대상·마감·혜택, 추천 이유를 확인해 보세요.'],
 ['bookmark','MY PICK 저장','관심 있는 카드의 북마크를 누르세요. MY PICK에서 다시 볼 수 있어요.'],
 ['compare','AI 비교하기','카드에서 2~3개를 선택하면 대상·기간·혜택을 나란히 비교할 수 있어요.']
 ];
 openModal(`${modalHead('한성 PICK 이용 안내','')}<div class="modal-content usage-guide"><ol class="usage-steps">${steps.map(([symbol,title,copy],i)=>`<li><span class="usage-icon" aria-hidden="true">${icon(symbol)}</span><div><h3><span>${i+1}.</span> ${title}</h3><p>${copy}</p></div></li>`).join('')}</ol><section class="usage-note"><h3>마감일은 오늘 날짜 기준이에요</h3><p>한국 시간 기준으로 마감일까지 남은 날짜를 표시해요. 마감일에는 ‘오늘 마감’, 날짜가 지나면 ‘모집 마감’으로 보여요.</p></section><section class="usage-note"><h3>실제 신청은 학교 사이트에서</h3><p>상세 화면의 바로가기 버튼을 이용해 주세요. 최종 신청 조건과 안내는 학교 사이트에서 확인할 수 있어요.</p></section></div><div class="modal-footer"><button class="secondary" data-action="onboarding-open">처음 사용 안내 다시 보기</button><button class="primary" data-action="close">확인</button></div>`,'about');
}

function navigate(next,updateHash=true){
 if(!validView(next))return;
 if(updateHash)rememberMobile();
 if(next==='saved'&&!savedTypeCount(savedTab)&&savedTypeCount(savedTab==='notice'?'program':'notice'))savedTab=savedTab==='notice'?'program':'notice';
 view=next;searchExpanded=false;heroIndex=0;carouselIndices.notice=0;carouselIndices.program=0;category='all';query='';type=listType();sort='recommended';openOnly=true;
 if(updateHash&&location.hash!=='#'+next)history.pushState(null,'','#'+next);render();renderTray();overlayDepth=0;window.scrollTo({top:0,behavior:'instant'});rememberMobile();
}
function toggleSave(id){if(!ITEMS.some(i=>i.id===id))return;const removing=saved.has(id);removing?saved.delete(id):saved.add(id);const ok=persist();const kind=modalView;const active=document.activeElement;const attr=active?.dataset?.action;const modalScroll=modal.scrollTop,contentScroll=modal.querySelector('.modal-content')?.scrollTop||0;render();renderTray();if(kind==='compare')comparison();else if(kind?.startsWith('quick-list-'))quickList(kind.slice(11));else if(kind?.startsWith('detail-'))detail(kind.slice(7));if(modal.open&&attr==='save')modal.querySelector(`[data-action="save"][data-id="${id}"]`)?.focus();else if(!modal.open)document.querySelector(`[data-action="save"][data-id="${id}"]`)?.focus();if(modal.open){modal.scrollTop=modalScroll;const content=modal.querySelector('.modal-content');if(content)content.scrollTop=contentScroll;}toast(ok?(removing?'MY PICK에서 삭제했어요.':'MY PICK에 저장했어요.'):'저장 공간을 사용할 수 없어 이번 방문 동안만 유지됩니다.');}
function toggleCompare(id){if(compared.has(id)){compared.delete(id);}else if(compared.size===3){toast('최대 3개까지 비교할 수 있어요. 기존 선택을 해제해 주세요.');const check=document.querySelector(`[data-compare="${id}"]`);if(check)check.checked=false;return false;}else{compared.add(id);}document.querySelectorAll('[data-compare]').forEach(el=>el.checked=compared.has(el.dataset.compare));renderTray();return true;}
function completeComparison(){compared.clear();document.querySelectorAll('[data-compare]').forEach(el=>el.checked=false);renderTray();backInApp(true);}
function resetConfirm(local=false){if(!local){openModal(`${modalHead('추천 정보를 다시 설정할까요?','')}<div class="modal-content"><ul class="management-explanation"><li>학년·트랙·관심 분야를 다시 선택할 수 있어요.</li><li>저장한 ${saved.size}개의 MY PICK은 유지됩니다.</li><li>새 정보를 저장하기 전까지 기존 정보가 유지됩니다.</li></ul></div><div class="modal-footer"><button class="secondary" data-action="close">취소</button><button class="primary" data-action="restart-profile">다시 입력하기</button></div>`,'reset-profile');return;}openModal(`${modalHead('나의 데이터를 초기화할까요?','내 정보와 MY PICK이 이 브라우저에서 삭제됩니다.')}<div class="modal-content"><p class="detail-overview">저장한 ${saved.size}개의 PICK과 학년·트랙·관심 분야를 지워요.<br class="mobile-copy"> 다시 입력하여 추천을 시작할 수 있습니다.</p></div><div class="modal-footer"><button class="secondary" data-action="close">취소</button><button class="primary" data-action="reset-data">초기화하기</button></div>`,'reset');}
document.addEventListener('click',e=>{const anchor=e.target.closest('a'),href=anchor?.getAttribute('href');const nav=e.target.closest('.nav-item')||(!anchor?.dataset.action&&href?.startsWith('#')&&validView(href.slice(1))?anchor:null);if(nav&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();if((modalView==='profile-1'||modalView==='profile-2')&&profileChanged()){confirmProfileDiscard(nav.getAttribute('href').slice(1));return;}if(modal.open)closeModal();navigate(nav.getAttribute('href').slice(1));return;}if(!e.target.closest('.mini-my-wrap')){const menu=$('#mini-my-menu');if(menu)menu.hidden=true;$('.avatar')?.setAttribute('aria-expanded','false');}if(e.target.closest('#mini-my-menu')){$('#mini-my-menu').hidden=true;$('.avatar').setAttribute('aria-expanded','false');}if(e.target.closest('[data-login-action]')&&modal.open)modal.close();if(!e.target.closest('.sort-dropdown'))closeSortMenu();const el=e.target.closest('[data-action]');if(el){const a=el.dataset.action,id=el.dataset.id;if(a==='onboarding-open'){showOnboarding(0,false);return;}if(a==='onboarding-skip'){finishOnboarding();return;}if(a==='onboarding-next'){showOnboarding(onboardingStep+1);return;}if(a==='onboarding-previous'){showOnboarding(onboardingStep-1);return;}if(a==='onboarding-finish'){finishOnboarding(true);return;}if(a==='account-logout'){accountLogout();return;}if(a==='keep-profile'){discardDestination=null;backInApp();return;}if(a==='discard-profile'){profileBaseline=profileDraftKey(draft);profileEpoch++;if(discardDestination)pendingDestination=discardDestination;discardDestination=null;modalView='profile-discarded';backInApp(true);return;}if(a==='image-open'){imageViewer(id,Number(el.dataset.index));return;}if(a==='mini-my'){const menu=$('#mini-my-menu');menu.hidden=!menu.hidden;el.setAttribute('aria-expanded',String(!menu.hidden));return;}if(a==='account-social'){accountDialog('social');return;}if(a==='connect-social'){const feedback=$('#social-connect-feedback');if(feedback)feedback.textContent=`계정 서버가 연결되지 않아 ${id==='kakao'?'카카오':'구글'} 계정을 연결할 수 없어요.`;return;}if(a==='account-password'){accountDialog('password');return;}if(a==='account-delete'){accountDialog('delete');return;}if(a==='restart-profile'){profileEpoch++;profileOrigin=profile?view:null;draft={name:profile?.name||'',grade:null,tracks:[''],interests:[]};profileBaseline=profileDraftKey(draft);profileStep(1);return;}if(a==='toggle-sort'){toggleSortMenu();return;}if(a==='select-sort'){applySort(id);closeSortMenu(true);return;}if(a==='card-previous'||a==='card-next'){slideCarousel(el.dataset.kind,a==='card-previous'?-1:1);return;}if(a==='hero-previous'){setHeroSlide(heroIndex-1);return;}if(a==='hero-next'){setHeroSlide(heroIndex+1);return;}if(a==='hero-select'){setHeroSlide(id);return;}if(a==='quick-open'||a==='quick-urgent'){quickList(a==='quick-urgent'?'urgent':'open');return;}if(a==='toggle-search'){toggleSearch();return;}if(a==='pick-track'){openTrackPicker(el.dataset.slot);return;}if(a==='cancel-track'){returnFromTrackPicker();return;}if(a==='select-track'){selectTrackOption(id);return;}if(a==='clear-track'){captureProfileDraft();draft.tracks[Number(el.dataset.slot)-1]='';profileStep(1);$('#track-picker-'+el.dataset.slot)?.focus();return;}if(a==='track-filter-menu'){trackPicker.menu=trackPicker.menu===el.dataset.kind?null:el.dataset.kind;renderTrackPicker();modal.querySelector(`[data-action="track-filter-menu"][data-kind="${el.dataset.kind}"]`)?.focus();return;}if(a==='track-filter-value'){trackPicker.browsing=true;trackPicker[el.dataset.kind]=id;if(el.dataset.kind==='college')trackPicker.group='all';trackPicker.menu=null;renderTrackPicker();modal.querySelector(`[data-action="track-filter-menu"][data-kind="${el.dataset.kind}"]`)?.focus();return;}if(a==='reset-track-filter'){trackPicker.browsing=false;trackPicker.college='all';trackPicker.group='all';trackPicker.search='';trackPicker.menu=null;renderTrackPicker();$('#track-search').focus();return;}if(a==='source')e.preventDefault();if(a==='remove-compare'){toggleCompare(id);if(compared.size>=2)comparison();else{closeModal();toast('두 개 이상 선택하면 비교할 수 있어요.');}}else if(a==='profile')startProfile();else if(a==='profile-back')backInApp();else if(a==='detail')detail(id);else if(a==='source')source(id);else if(a==='save')toggleSave(id);else if(a==='close')backInApp(true);else if(a==='detail-back')backInApp();else if(a==='complete-compare')completeComparison();else if(a==='about')about();else if(a==='compare')comparison();else if(a==='clear-compare'){compared.clear();renderResults();renderTray();}else if(a==='toggle-detail-compare'){if(toggleCompare(id))detail(id);}else if(a==='show-unavailable'){openOnly=false;render();}else if(a==='reset-filter'){const recommended=isRecommendedTab();category=recommended?'recommended':'all';query='';type=listType();openOnly=true;render();}else if(a==='go-saved')navigate('saved');else if(a==='go-recommend')navigate('recommend');else if(a==='go-notices')navigate('notices');else if(a==='go-programs')navigate('programs');else if(a==='reset-confirm')resetConfirm();else if(a==='reset-local-confirm')resetConfirm(true);else if(a==='reset-data'){profile=null;saved.clear();compared.clear();profileEpoch++;draft=null;pendingProfileDraft=null;profileOrigin=null;discardDestination=null;persist();closeModal();navigate('recommend');toast('내 정보와 MY PICK을 초기화했어요.');}return;}const c=e.target.closest('[data-category]');if(c){category=c.dataset.category;if(category==='recommended'){query='';sort='recommended';if(!isSavedMobile())openOnly=true;}const filterX=$('.filters').scrollLeft;render();$('.filters').scrollLeft=filterX;main.querySelector(`[data-category="${category}"]`)?.focus();}const t=e.target.closest('[data-tab]');if(t){const recommended=isRecommendedTab()&&!isSavedMobile();if(view==='recommend')recommendTab=t.dataset.tab;else savedTab=t.dataset.tab;type=listType();category=recommended?'recommended':'all';query='';sort='recommended';openOnly=true;render();main.querySelector(`[data-tab="${listType()}"]`)?.focus();}});
document.addEventListener('change',e=>{if(e.target.dataset.compare){const id=e.target.dataset.compare;toggleCompare(id);if(modalView?.startsWith('quick-list-')){quickList(modalView.slice(11));modal.querySelector(`[data-compare="${id}"]`)?.focus();}return;}if(e.target.id==='type-filter'){type=e.target.value;renderResults();}else if(e.target.id==='sort-filter'){applySort(e.target.value);}else if(e.target.id==='open-filter'){openOnly=e.target.checked;renderResults();}});
document.addEventListener('input',e=>{if(e.target.id==='track-search'){trackPicker.search=e.target.value;$('#track-results').innerHTML=trackResultsHtml();return;}if(e.target.id==='search-input'){query=e.target.value;renderResults();}});
function route(event){if(event?.type==='popstate'&&(modalView==='profile-1'||modalView==='profile-2')&&!['profile-1','profile-2','track-picker'].includes(history.state?.hsuUI?.modal)&&profileChanged()){const current=mobileSnapshot();history.pushState({hsuUI:current},'','#'+view);confirmProfileDiscard();return;}if(event?.type==='popstate'&&history.state?.hsuUI){restoreMobile(history.state.hsuUI);return;}const hash=location.hash.slice(1);if(event?.type==='hashchange'&&history.state?.hsuUI?.view===hash){restoreMobile(history.state.hsuUI);return;}if(hash.startsWith('source/')){const id=hash.slice(7),item=ITEMS.find(i=>i.id===id);if(item){navigate(item.type==='notice'?'notices':'programs',false);source(id);return;}}const next=hash==='explore'?'notices':validView(hash)?hash:'recommend';if(modal.open)closeModal();navigate(next,false);if(hash==='explore')history.replaceState(null,'','#notices');}
window.addEventListener('resize',()=>{fitCategoryRows();document.querySelectorAll('.carousel-track').forEach(track=>track.updateCarousel?.());});
document.fonts?.ready.then(()=>fitCategoryRows());
mobileLayout.addEventListener('change',()=>{if(mobileLayout.matches&&query)searchExpanded=true;const state=mobileSnapshot();restoreMobile(state);rememberMobile();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&e.target.id==='search-input'&&mobileLayout.matches&&searchExpanded){e.preventDefault();toggleSearch();}});
window.addEventListener('hashchange',route);window.addEventListener('popstate',route);
// Refresh an open app when the Korean calendar day changes, including return from sleep.
let displayedDate=todayDate();
function refreshVisibleData(){
 const currentModal=modalView,scroll=modal.scrollTop,innerScroll=modal.querySelector('.modal-content')?.scrollTop||0;
 render();renderTray();
 if(currentModal?.startsWith('detail-'))detail(currentModal.slice(7));
 else if(currentModal?.startsWith('source-'))source(currentModal.slice(7));
 else if(currentModal?.startsWith('image-')){
  const parts=currentModal.match(/^image-(.*)-(\d+)$/),item=parts&&ITEMS.find(i=>i.id===parts[1]);
  if(item&&noticeImages(item)[Number(parts[2])])imageViewer(item.id,Number(parts[2]));
  else if(item){if(overlayDepth>0)backInApp();else detail(item.id);}
 }
 else if(currentModal==='compare')comparison();
 else if(currentModal?.startsWith('quick-list-'))quickList(currentModal.slice(11));
 if(modal.open&&modalView===currentModal){modal.scrollTop=scroll;const content=modal.querySelector('.modal-content');if(content)content.scrollTop=innerScroll;}
}
function refreshDateState(){
 const next=todayDate();if(next===displayedDate)return;
 displayedDate=next;refreshVisibleData();
}
// Apply completed writes from another tab without replacing an open input form.
window.addEventListener('storage',event=>{
 if(event.key!==KEY&&event.key!==null)return;
 if(event.storageArea&&event.storageArea!==localStorage)return;
 let next;try{next=JSON.parse(event.newValue||'{}');}catch{return;}
 if(!next||typeof next!=='object'||Array.isArray(next))return;
 profile=isProfile(next.profile)?next.profile:null;
 if(Number(profile?.grade)===1)profile={...profile,tracks:profile.tracks.slice(0,1)};
 saved=new Set(Array.isArray(next.saved)?next.saved.filter(id=>ITEMS.some(i=>i.id===id)):[]);
 refreshVisibleData();
});
function updateConnectivity(){
 const offline=globalThis.navigator?.onLine===false;
 const message=offline?'오프라인 상태예요. 학교 사이트 이동은 연결 후 다시 시도해 주세요.':'';
 const banner=$('#connection-status');if(banner){banner.textContent=message;banner.hidden=!offline||modal.open;}
 document.querySelectorAll('.connection-notice').forEach(note=>{note.textContent=message;note.hidden=!offline;});
}
window.addEventListener('hsu-content-updated',()=>{
 for(const id of compared)if(!ITEMS.some(item=>item.id===id))compared.delete(id);
 const itemId=modalView?.startsWith('detail-')?modalView.slice(7):modalView?.startsWith('source-')?modalView.slice(7):modalView?.match(/^image-(.*)-\d+$/)?.[1];
 if((itemId&&!ITEMS.some(item=>item.id===itemId))||(modalView==='compare'&&compared.size<2)){closeModal();overlayDepth=0;toast('변경된 목록에서 소식을 다시 선택해 주세요.');}
 refreshVisibleData();
});
window.addEventListener('online',updateConnectivity);window.addEventListener('offline',updateConnectivity);
document.addEventListener('keydown',event=>{
 const menu=$('#mini-my-menu');
 if(event.key==='Escape'&&menu&&!menu.hidden){event.preventDefault();menu.hidden=true;$('.avatar')?.setAttribute('aria-expanded','false');$('.avatar')?.focus();}
});

function scheduleDateRefresh(){
 const nextMidnight=Date.parse(todayDate()+'T00:00:00+09:00')+86400000;
 setTimeout(()=>{refreshDateState();scheduleDateRefresh();},Math.max(20,nextMidnight-Date.now()+20));
}
window.addEventListener('focus',refreshDateState);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='hidden')refreshDateState();});
let renderedAccountId=getAccountUser()?.id||null;
subscribeAccountSession(account=>{
 const nextId=account?.id||null;
 if(nextId!==renderedAccountId){
  renderedAccountId=nextId;accountEpoch++;profileEpoch++;
  profile=null;saved.clear();compared.clear();draft=null;pendingProfileDraft=null;profileOrigin=null;discardDestination=null;
  if(modal.open)closeModal();overlayDepth=0;render();renderTray();
  if(!account&&typeof window.dispatchEvent==='function')window.dispatchEvent(new Event('hsu-signout'));
 }else renderNav();
});
renderTray();route();scheduleDateRefresh();updateConnectivity();

document.addEventListener('keydown',e=>{
 const dropdown=e.target.closest('.sort-dropdown');if(!dropdown)return;
 const menu=$('#sort-options');
 if(e.key==='Escape'){e.preventDefault();closeSortMenu(true);return;}
 if(e.key==='Tab'){closeSortMenu();return;}
 if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
  e.preventDefault();const wasClosed=menu.hidden;
  if(wasClosed)toggleSortMenu();
  const options=[...menu.querySelectorAll('.sort-option')];
  let index=options.indexOf(document.activeElement);
  if(e.key==='Home')index=0;else if(e.key==='End')index=options.length-1;
  else if(!wasClosed)index=(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;
  options[Math.max(0,index)]?.focus();
 }else if((e.key==='Enter'||e.key===' ')&&e.target.dataset.action==='select-sort'){
  e.preventDefault();applySort(e.target.dataset.id);closeSortMenu(true);
 }
});

// Failed remote images keep an explicit path to the original notice.
document.addEventListener('error',event=>{const img=event.target;if(img.tagName!=='IMG')return;const figure=img.closest('figure'),viewer=img.closest('.image-viewer');if(!figure&&!viewer)return;img.hidden=true;const fallback=(figure||viewer).querySelector('.image-fallback');if(fallback)fallback.hidden=false;if(figure){const button=figure.querySelector('button');if(button)button.disabled=true;}},true);
