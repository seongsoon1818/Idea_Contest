// Executes the actual app and its rendered controls in an in-memory DOM.
// This checks behavior, not browser layout or painting.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {ITEMS,statusOf,daysLeft,matchProfile} from '../dist/data.js';
import {TRACK_OPTIONS,trackOptionsForSlot} from '../dist/tracks.js';
// Retain the original regression fixture, then advance the clock for live-date tests.
const RealDate=globalThis.Date;
let runtimeNow='2026-10-09T03:00:00Z';
globalThis.Date=class extends RealDate{
 constructor(...args){super(...(args.length?args:[runtimeNow]));}
 static now(){return RealDate.parse(runtimeNow);}
};
const decode=s=>s.replace(/&(amp|lt|gt|quot|#39);/g,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[x]));
class Element {
 constructor(tag='div',attrs={}){this.tagName=tag.toUpperCase();this.attrs=attrs;this.children=[];this.parentElement=null;this.listeners={};this.hidden='hidden'in attrs;this.inert='inert'in attrs;this.checked='checked'in attrs;this.disabled='disabled'in attrs;this.open=false;this._value=attrs.value??null;this.style={};this._scrollLeft=0;this.scrollTop=0;this.dataset={};for(const[k,v]of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;this.classList={contains:c=>(this.attrs.class||'').split(/\s+/).includes(c),add:c=>{if(!this.classList.contains(c))this.attrs.class=((this.attrs.class||'')+' '+c).trim();},remove:c=>{this.attrs.class=(this.attrs.class||'').split(/\s+/).filter(x=>x!==c).join(' ');},toggle:(c,v)=>{v??=!this.classList.contains(c);v?this.classList.add(c):this.classList.remove(c);return v;}};}
 get className(){return this.attrs.class||'';}set className(v){this.attrs.class=v;}
 get id(){return this.attrs.id;}get name(){return this.attrs.name;}
 get value(){if(this._value!==null)return this._value;if(this.tagName==='SELECT')return(this.children.find(x=>'selected'in x.attrs)||this.children[0])?.value??'';return this.textContent;}
 set value(v){this._value=v;}
 get innerHTML(){return this._html||'';}set innerHTML(v){this._html=v;this.children=parse(v,this);}
 get textContent(){return this.children.map(c=>c.tagName==='#TEXT'?c.text:c.textContent).join('');}
 set textContent(v){this.children=[];const c=new Element('#text');c.text=String(v);c.parentElement=this;this.children.push(c);}
 matches(selector){let checked=selector.endsWith(':checked');selector=selector.replace(/:checked$/,'');if(checked&&!this.checked)return false;let tag=selector.match(/^[a-z][a-z0-9-]*/i)?.[0];if(tag&&tag.toUpperCase()!==this.tagName)return false;let id=selector.match(/#([\w-]+)/)?.[1];if(id&&this.id!==id)return false;for(const m of selector.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(m[1]))return false;for(const m of selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)){if(!(m[1]in this.attrs))return false;if(m[2]!==undefined&&this.attrs[m[1]]!==m[2])return false;}return true;}
 querySelectorAll(selector){let result=[];for(const c of this.children){if(c.matches(selector))result.push(c);result.push(...c.querySelectorAll(selector));}return result;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 closest(selector){let e=this;while(e){if(e.matches(selector))return e;e=e.parentElement;}return null;}
 setAttribute(name,value){this.attrs[name]=String(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
 getAttribute(name){return this.attrs[name]??null;}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 focus(){document.activeElement=this;}
 dispatch(type,target=this,props={}){const e={type,target,...props,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;}};for(const f of this.listeners[type]||[])f(e);return e;}
 showModal(){this.open=true;}
 close(){this.open=false;this.dispatch('close');}
 get clientWidth(){return this._clientWidth??(this.classList.contains('carousel-track')?860:900);}
 get offsetWidth(){return this._offsetWidth??(this.classList.contains('card')?270:900);}
 get scrollWidth(){return this.classList.contains('carousel-track')?this.querySelectorAll('.card').length*282-12:this.clientWidth;}
 get scrollLeft(){return this._scrollLeft||0;}
 set scrollLeft(v){this._scrollLeft=Math.max(0,Math.min(v,Math.max(0,this.scrollWidth-this.clientWidth)));}
 scrollBy(options){this.scrollLeft+=options.left;this.dispatch('scroll');}
 scrollTo(options){this.lastScrollOptions=options;if(this.deferSmooth&&options.behavior==='smooth'){this.pendingScroll=options;return;}this.scrollLeft=options.left;this.dispatch('scroll');}
 getBoundingClientRect(){return this._rect??{left:0,right:100,top:0,bottom:100};}
}
const voids=new Set(['META','LINK','INPUT','BR','HR','IMG','OPTION']);
function parse(html,parent){const root=new Element('root');let stack=[root];for(const m of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<[^>]*>|[^<]+/g)){const t=m[0];if(t.startsWith('<!'))continue;if(t.startsWith('</')){const tag=t.slice(2,-1).trim().toUpperCase();let n=stack.length-1;while(n>0&&stack[n].tagName!==tag)n--;if(n>0)stack.length=n;continue;}let el;if(t.startsWith('<')){const tag=t.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const attrs={};const rem=t.slice(tag.length+1,-1);for(const a of rem.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs[a[1]]=decode(a[2]??a[3]??a[4]??'');el=new Element(tag,attrs);}else{el=new Element('#text');el.text=decode(t);}el.parentElement=stack.at(-1);stack.at(-1).children.push(el);if(t.startsWith('<')&&!voids.has(el.tagName)&&!t.endsWith('/>'))stack.push(el);}for(const c of root.children)c.parentElement=parent;return root.children;}
const storage=new Map(),timerCallbacks=new Map();let timerId=0;
const flushTimers=()=>{const callbacks=[...timerCallbacks.values()];timerCallbacks.clear();callbacks.forEach(fn=>fn());};
let setMobileViewport;
function setup(mobile=false,{firstVisit=false}={}){if(!firstVisit)storage.set('hsupick-onboarding-v2','1');const doc=new Element('document');doc.innerHTML=fs.readFileSync('dist/index.html','utf8');doc.body=doc.querySelector('body');globalThis.document=doc;const win=new Element('window');win.scrollY=0;win.scrollTo=options=>{win.scrollY=options.top??win.scrollY;};globalThis.window=win;const media=new Element('media');media.matches=mobile;globalThis.matchMedia=q=>q==='(max-width:800px)'?media:{matches:true};setMobileViewport=matches=>{media.matches=matches;media.dispatch('change');};globalThis.location={hash:''};const entries=[{state:null,hash:''}];let cursor=0;globalThis.history={get state(){return entries[cursor].state;},get length(){return entries.length;},pushState(state,title,hash=location.hash){entries.splice(cursor+1);entries.push({state:structuredClone(state),hash});cursor++;location.hash=hash;},replaceState(state,title,hash=location.hash){entries[cursor]={state:structuredClone(state),hash};location.hash=hash;},go(delta){const next=Math.max(0,Math.min(entries.length-1,cursor+delta));if(next===cursor)return;const previousHash=location.hash;cursor=next;location.hash=entries[cursor].hash;window.dispatch('popstate',window,{state:entries[cursor].state});if(location.hash!==previousHash)window.dispatch('hashchange');},back(){this.go(-1);},forward(){this.go(1);}};globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};globalThis.setTimeout=fn=>{const id=++timerId;timerCallbacks.set(id,fn);return id;};globalThis.clearTimeout=id=>timerCallbacks.delete(id);return doc;}
const $=s=>document.querySelector(s);
const all=s=>document.querySelectorAll(s);
const text=()=>$('#main').textContent;
const click=(selector)=>{const el=typeof selector==='string'?$(selector):selector;assert(el,'Control not found: '+selector);assert(!el.disabled,'Control disabled: '+selector);document.dispatch('click',el);return el;};
const change=(selector,value)=>{const el=$(selector);assert(el,'Control not found: '+selector);if(value!==undefined)el.value=value;document.dispatch('change',el);return el;};
const submit=form=>{const f=$(form);assert(f);f.dispatch('submit');};
const navigate=hash=>{history.pushState(null,'','#'+hash);window.dispatch('hashchange');};
const selectGrade=n=>{if($('#profile-name')&&!$('#profile-name').value)$('#profile-name').value='테스트';for(const r of all('input[name="grade"]'))r.checked=r.value===String(n);};
const interest=id=>{const input=$(`input[name="interest"][value="${id}"]`);assert(input);input.checked=!input.checked;$('#interest-form').dispatch('change',input);};
const mainCards=()=>$('#main').querySelectorAll('.card');
const mainIds=()=>mainCards().map(e=>e.dataset.item);
const allEligibleSaved=ids=>ITEMS.filter(i=>ids.includes(i.id)&&matchProfile(i,JSON.parse(storage.get('hsupick-v1')).profile).eligible).sort((a,b)=>matchProfile(b,JSON.parse(storage.get('hsupick-v1')).profile).score-matchProfile(a,JSON.parse(storage.get('hsupick-v1')).profile).score||a.deadline.localeCompare(b.deadline)).map(i=>i.id);
const homeSelect=kind=>{if(!$('#main').classList.contains('recommend-home'))return;const tab=$('.type-tabs').querySelector(`[data-tab="${kind}"]`);if(tab.attrs['aria-pressed']!=='true')click(tab);};
const homeIds=kind=>{const current=$('.type-tabs').querySelector('[aria-pressed="true"]').dataset.tab;homeSelect(kind);const ids=mainIds();homeSelect(current);return ids;};
const homeNoticeIds=()=>homeIds('notice');
const homeProgramIds=()=>homeIds('program');
let count=0;const check=(fn)=>{fn();count++;};
setup();await import('../dist/app.js?initial');
// First-entry login UI never treats input or social-button clicks as authentication.
window.dispatchEvent=event=>window.dispatch(event.type);
await import('../dist/login.js?initial');
check(()=>assert(!$('#login-screen').hidden&&document.body.classList.contains('login-view')));
check(()=>assert($('.workspace').inert&&$('.mobile-nav').inert));
check(()=>assert.equal($('#login-id').attrs.type,'text','Username does not require an email address'));
check(()=>assert.deepEqual(all('.login-provider').map(e=>e.dataset.loginAction),['kakao','google']));
submit('#login-form');
check(()=>assert.equal($('#login-feedback').textContent,'아이디를 입력해 주세요.'));
check(()=>assert.equal(document.activeElement,$('#login-id')));
$('#login-id').value='hsupick';submit('#login-form');
check(()=>assert.equal($('#login-feedback').textContent,'비밀번호를 입력해 주세요.'));
$('#login-password').value='temporary-login-test';click('[data-login-action="toggle-password"]');
check(()=>assert.equal($('#login-password').attrs.type,'text'));
check(()=>assert.equal($('.password-toggle').attrs['aria-pressed'],'true'));
click('[data-login-action="toggle-password"]');
check(()=>assert.equal($('#login-password').attrs.type,'password'));
submit('#login-form');
check(()=>assert($('#login-feedback').textContent.includes('로그인 연결을 준비 중')));
check(()=>assert(!$('#login-screen').hidden,'Unconnected credentials cannot log in'));
check(()=>assert.equal($('#login-password').value,''));
check(()=>assert(!JSON.stringify([...storage]).includes('temporary-login-test')));
for(const provider of ['kakao','google']){
 click(`[data-login-action="${provider}"]`);
 check(()=>assert($('#login-feedback').textContent.includes(provider==='kakao'?'카카오':'구글')));
 check(()=>assert(!$('#login-screen').hidden));
}
// Registration validates rules and confirmation without creating a fake account.
click('[data-login-action="signup"]');
check(()=>assert.equal(location.hash,'#signup'));
check(()=>assert(!$('#signup-panel').hidden&&$('#login-panel').hidden));
check(()=>assert.equal($('#login-title').textContent,'회원가입'));
submit('#signup-form');
check(()=>assert.equal(document.activeElement,$('#signup-name')));
$('#signup-name').value='이지원';submit('#signup-form');
check(()=>assert.equal(document.activeElement,$('#signup-id')));
$('#signup-id').value='한성pick';submit('#signup-form');
check(()=>assert($('#signup-id-error').textContent.includes('영문·숫자만')));
$('#signup-id').value='hsupick';$('#signup-password').value='Password1';submit('#signup-form');
check(()=>assert($('#signup-password-error').textContent.includes('특수문자')));
$('#signup-password').value='Password1!';$('#signup-confirm').value='Different1!';submit('#signup-form');
check(()=>assert.equal($('#signup-confirm-error').textContent,'비밀번호가 일치하지 않아요.'));
$('#signup-confirm').value='Password1!';$('#signup-form').dispatch('input',$('#signup-confirm'));
check(()=>assert.equal($('#signup-confirm-error').textContent,''));
click('[data-target="signup-password"]');
check(()=>assert.equal($('#signup-password').attrs.type,'text'));
click('[data-target="signup-password"]');
check(()=>assert.equal($('#signup-password').attrs.type,'password'));
submit('#signup-form');
check(()=>assert($('#signup-feedback').textContent.includes('회원가입을 완료할 수 없어요')));
check(()=>assert.equal($('#signup-password').value,''));
check(()=>assert.equal($('#signup-confirm').value,''));
check(()=>assert(!JSON.stringify([...storage]).includes('Password1!')));
click('[data-login-action="back"]');
check(()=>assert.equal(location.hash,'#login'));
check(()=>assert($('#signup-panel').hidden&&!$('#login-panel').hidden));
check(()=>assert.equal($('#signup-id').value,''));
click('[data-login-action="guest"]');
check(()=>assert($('#login-screen').hidden&&!document.body.classList.contains('login-view')));
check(()=>assert(!$('.workspace').inert&&!$('.mobile-nav').inert));
check(()=>assert.equal($('#login-id').value,''));
navigate('saved');click('[data-login-action="open"]');
check(()=>assert.equal(location.hash,'#login'));
check(()=>assert(!$('#login-screen').hidden));
click('[data-login-action="guest"]');
check(()=>assert.equal(location.hash,'#saved','Browsing returns to the prior destination'));
navigate('recommend');
// Banner navigation, accessible visibility and touch gestures.
const activeHero=()=>all('.hero-slide').filter(e=>!e.hidden);
check(()=>assert.equal(all('.hero-slide').length,3));
check(()=>assert.deepEqual(activeHero().map(e=>e.dataset.heroSlide),['0']));
check(()=>assert(all('.hero-slide').filter(e=>e.hidden).every(e=>e.inert&&e.attrs['aria-hidden']==='true')));
click('[data-action="hero-next"]');
check(()=>assert.deepEqual(activeHero().map(e=>e.dataset.heroSlide),['1']));
check(()=>assert(activeHero()[0].textContent.includes('필요한 학교 소식')));
check(()=>assert.equal($('.hero-dot[data-id="1"]').attrs['aria-pressed'],'true'));
click('[data-action="hero-next"]');click('[data-action="hero-next"]');
check(()=>assert.deepEqual(activeHero().map(e=>e.dataset.heroSlide),['0'],'Next wraps to the first banner'));
click('[data-action="hero-previous"]');
check(()=>assert.deepEqual(activeHero().map(e=>e.dataset.heroSlide),['2'],'Previous wraps to the last banner'));
click('[data-action="hero-select"][data-id="1"]');
check(()=>assert.equal($('.hero-position'),null));
const banner=$('.hero-carousel'),stage=$('.hero-stage');
banner.dispatch('keydown',stage,{key:'Home'});
check(()=>assert.deepEqual(activeHero().map(e=>e.dataset.heroSlide),['0']));
banner.dispatch('keydown',stage,{key:'End'});
check(()=>assert.deepEqual(activeHero().map(e=>e.dataset.heroSlide),['2']));
banner.dispatch('keydown',stage,{key:'ArrowRight'});
check(()=>assert.deepEqual(activeHero().map(e=>e.dataset.heroSlide),['0']));
banner.dispatch('keydown',stage,{key:'ArrowLeft'});
check(()=>assert.deepEqual(activeHero().map(e=>e.dataset.heroSlide),['2']));
stage.dispatch('pointerdown',stage,{pointerType:'touch',pointerId:1,clientX:220,clientY:40});
stage.dispatch('pointerup',stage,{pointerType:'touch',pointerId:1,clientX:110,clientY:45});
check(()=>assert.deepEqual(activeHero().map(e=>e.dataset.heroSlide),['0'],'Horizontal swipe advances the banner'));
stage.dispatch('pointerdown',stage,{pointerType:'touch',pointerId:2,clientX:110,clientY:40});
stage.dispatch('pointerup',stage,{pointerType:'touch',pointerId:2,clientX:220,clientY:45});
check(()=>assert.deepEqual(activeHero().map(e=>e.dataset.heroSlide),['2'],'Reverse swipe goes back'));
stage.dispatch('pointerdown',stage,{pointerType:'touch',pointerId:3,clientX:220,clientY:40});
stage.dispatch('pointerup',stage,{pointerType:'touch',pointerId:3,clientX:180,clientY:140});
check(()=>assert.deepEqual(activeHero().map(e=>e.dataset.heroSlide),['2'],'Vertical scrolling does not change banners'));
stage.dispatch('pointerdown',stage,{pointerType:'touch',pointerId:4,clientX:220,clientY:40});
stage.dispatch('pointercancel',stage);stage.dispatch('pointerup',stage,{pointerType:'touch',pointerId:4,clientX:100,clientY:40});
check(()=>assert.deepEqual(activeHero().map(e=>e.dataset.heroSlide),['2'],'Canceled gestures do not change banners'));
check(()=>assert.equal(activeHero()[0].querySelector('a').attrs.href,'#saved'));
homeSelect('notice');click('[data-action="save"][data-id="n01"]');
check(()=>assert.deepEqual(activeHero().map(e=>e.dataset.heroSlide),['2'],'Saving preserves the selected banner'));
homeSelect('notice');click('[data-action="save"][data-id="n01"]');click('[data-action="hero-select"][data-id="0"]');
check(()=>assert.equal(all('.stat-number').length,3));
check(()=>assert.deepEqual(all('.stat-number').map(e=>e.textContent),['16','2','0']));
// Summary shortcuts must show exactly the items included in their counts.
check(()=>assert.equal($('.quick-stats').querySelectorAll('button').length,3));
check(()=>assert($('.quick-stats').querySelectorAll('button').every(e=>e.querySelector('.stat-arrow')&&!e.querySelector('.stat-hint'))));
check(()=>assert.equal($('.stat-urgent').querySelector('.stat-label').textContent,'마감 PICK!'));
check(()=>assert.equal($('[data-action="go-saved"]').querySelector('.stat-value').textContent,'0개'));
click('[data-action="quick-open"]');
check(()=>assert($('#modal').open&&$('#modal').querySelector('h2').textContent==='모집 중인 기회'));
check(()=>assert.deepEqual($('#modal').querySelectorAll('.card').map(e=>e.dataset.item).sort(),ITEMS.filter(i=>statusOf(i)==='open').map(i=>i.id).sort()));
check(()=>assert.equal($('#modal').querySelector('.result-line').querySelector('strong').textContent,'16'));
click($('#modal').querySelector('[data-action="save"][data-id="n01"]'));
check(()=>assert($('#modal').open&&$('#modal').querySelectorAll('.card').length===16,'Saving retains the full shortcut list'));
check(()=>assert.equal($('[data-action="go-saved"]').querySelector('.stat-value').textContent,'1개'));
check(()=>assert.equal($('#modal').querySelector('[data-action="save"][data-id="n01"]').attrs['aria-pressed'],'true'));
for(const id of ['n01','p02']){const input=$('#modal').querySelector(`[data-compare="${id}"]`);input.checked=true;document.dispatch('change',input);}
check(()=>assert.equal($('#modal').querySelector('[data-action="compare"]').disabled,false));
click($('#modal').querySelector('[data-action="compare"]'));
check(()=>assert.equal($('#modal').querySelectorAll('.comparison-card').length,2));
click('[data-action="close"]');click('[data-action="clear-compare"]');
click('[data-action="quick-open"]');click($('#modal').querySelector('[data-action="save"][data-id="n01"]'));click('[data-action="close"]');
check(()=>assert.equal($('[data-action="go-saved"]').querySelector('.stat-value').textContent,'0개'));
click('[data-action="quick-urgent"]');
check(()=>assert($('#modal').open&&$('#modal').querySelector('h2').textContent==='마감 PICK!'));
check(()=>assert.deepEqual($('#modal').querySelectorAll('.card').map(e=>e.dataset.item).sort(),ITEMS.filter(i=>statusOf(i)==='open'&&daysLeft(i)<=3).map(i=>i.id).sort()));
check(()=>assert.equal($('#modal').querySelector('.result-line').querySelector('strong').textContent,'2'));
click($('#modal').querySelector('.title-button'));
check(()=>assert($('#modal').querySelector('.detail-overview'),'Shortcut cards open their real detail view'));
click('[data-action="close"]');
click('[data-action="go-saved"]');
check(()=>assert.equal(location.hash,'#saved'));
check(()=>assert(text().includes('총 0개의 MY PICK')));
navigate('recommend');

check(()=>assert.equal($('#results').querySelectorAll('.group-count').length,0));
check(()=>assert(!document.textContent.includes('포인트')));
// Layout regression: summary cards must be siblings, outside the recommendations.
check(()=>assert.equal($('.quick-stats').children.filter(e=>e.classList.contains('stat')).length,3,'Summary cards must be three siblings'));
check(()=>assert($('.quick-stats').children.filter(e=>e.tagName!=='#TEXT').every(e=>e.classList.contains('stat')),'Only summary cards belong in quick-stats'));
check(()=>assert.equal($('.quick-stats').querySelectorAll('.stat').length,3));
check(()=>assert.equal($('.quick-stats').querySelectorAll('section').length,0,'Recommendation section must not be nested inside a statistic'));
check(()=>assert.equal($('#results').closest('section').parentElement,$('#main')));
check(()=>assert.equal(all('.card').length,5));
check(()=>assert(text().includes('이번엔 PICK하세요')));
// Annotation changes: separate types, concise reasons, corrected copy and submenus.
check(()=>assert.equal(all('.type-tabs').length,1));
check(()=>assert.deepEqual($('.type-tabs').querySelectorAll('button').map(e=>e.querySelector('span').textContent.trim()),['공지 PICK!','비교과 PICK!']));
check(()=>assert.equal($('.type-tabs').querySelector('[aria-pressed="true"]').dataset.tab,'notice'));
check(()=>assert(!text().includes('이런 기회가 기다리고 있어요')));
check(()=>assert.deepEqual(all('.stat-value').map(e=>e.textContent.trim()),['16개','2개','0개']));
check(()=>assert.equal(all('.stat-emphasis').length,0));
check(()=>assert.equal(all('.stat-label').map(e=>e.textContent).join(','),'모집중인 기회,마감 PICK!,MY PICK!'));
check(()=>assert.equal($('.quick-stats').querySelectorAll('strong').length,0));
check(()=>assert($('.hero-art')&&$('.pick-ticket')&&!$('.hero-compact')));
check(()=>assert.equal(all('.brand-logo').length,2));
check(()=>assert(!document.textContent.includes('나의 캠퍼스 기회')));
check(()=>assert(!document.textContent.includes('프로토타입 안내 ↗')));
check(()=>assert.equal($('.demo-pill'),null));
check(()=>assert.equal(all('.rank-badge').length,0,'No personal rank before profile input'));
check(()=>assert(all('.card').every(e=>e.querySelector('.card-status-actions').querySelector('.status-badge')&&e.querySelector('.card-status-actions').querySelector('.save-btn'))));
check(()=>assert(all('.card').every(e=>!e.querySelector('.card-title-row').querySelector('.status-badge'))));
check(()=>assert(all('.card').every(e=>e.children.filter(c=>c.tagName!=='#TEXT').at(-2).classList.contains('recommend-reason')&&e.children.filter(c=>c.tagName!=='#TEXT').at(-1).classList.contains('card-bottom')&&e.querySelector('.card-body').children.filter(c=>c.tagName!=='#TEXT')[0].classList.contains('card-title-row'))));
check(()=>assert(all('.recommend-reason').every(e=>!e.textContent.includes('추천 이유')&&!e.textContent.includes('모집 중'))));
homeSelect('program');check(()=>assert($('.status-badge.today').textContent.includes('! 오늘 마감')));
check(()=>assert(text().includes('AI 비교하기')&&text().includes("카드에 있는 'AI 비교하기'로 최대 3개의 정보를 비교할 수 있어요!")));
check(()=>assert(!text().includes('비교에 담기')));
check(()=>assert(all('.card').every(e=>!e.classList.contains('featured-card'))));
check(()=>assert.equal($('.explore-subnav'),null));
check(()=>assert.equal($('.desktop-nav').children.filter(e=>e.tagName==='A').length,5));
check(()=>assert.equal($('.mobile-nav').querySelectorAll('a').length,5));
for(const kind of ['notice','program']){homeSelect(kind);check(()=>assert(mainCards().every(e=>e.dataset.type===kind)));}
const baselineNotices=homeNoticeIds();
const baselinePrograms=homeProgramIds();
// Program taxonomy is shared by filters, cards and home recommendations.
check(()=>assert.equal($('[data-item="p06"]').querySelector('.category-badge').textContent,'전공역량강화'));
check(()=>assert.equal($('[data-item="p08"]').querySelector('.category-badge').textContent,'상담·심리지원'));
navigate('programs');
check(()=>assert.equal($('#main').querySelector('h1').textContent,'비교과 프로그램'));
check(()=>assert.deepEqual($('.filters').querySelectorAll('button').map(e=>e.textContent.trim()),['추천','전체','학습역량강화','상담·심리지원','창업지원','전공역량강화','기타']));
check(()=>assert($('#search-input')&&$('#sort-filter')&&$('#open-filter'),'Program exploration retains all tools'));
check(()=>assert($('.filters').querySelectorAll('button').every(e=>Boolean(e.querySelector('.icon'))===(e.dataset.category==='recommended'))));
click('[data-category="recommended"]');
check(()=>assert.deepEqual(mainIds(),baselinePrograms,'Program recommendations match the home list and order'));
check(()=>assert(mainCards().every(e=>e.dataset.type==='program'&&e.querySelector('.recommend-reason'))));
$('#search-input').value='no-results';document.dispatch('input',$('#search-input'));check(()=>assert.equal($('[data-action="reset-filter"]'),null));$('#search-input').value='';document.dispatch('input',$('#search-input'));
check(()=>assert.equal($('[data-category="recommended"]').attrs['aria-pressed'],'true'));
check(()=>assert.deepEqual(mainIds(),baselinePrograms));
for(const [category,ids,label] of [['learning',['p11','p17'],'학습역량강화'],['counseling',['p08'],'상담·심리지원'],['startup',['p07'],'창업지원'],['major',['p06'],'전공역량강화'],['other',['p13','p05','p02','p04','p09','p16'],'기타']]){
 click(`[data-category="${category}"]`);
 check(()=>assert.deepEqual(mainIds(),ids));
 check(()=>assert(mainCards().every(e=>e.querySelector('.category-badge').textContent===label&&!e.querySelector('.recommend-reason'))));
}
navigate('recommend');
// Home exposes search/sort/recruitment on both viewport sizes.
check(()=>assert($('#search-input')&&$('#sort-filter')&&$('#open-filter')&&$('.filters')&&$('.listing-cards')));
check(()=>assert.equal(all('.carousel-track').length,0));
check(()=>assert.equal(all('.carousel-arrow').length,0));
check(()=>assert(all('.card-facts').every(e=>e.querySelectorAll('.fact-cell').length===3)));
check(()=>assert(all('.fact-cell').every(e=>e.querySelector('dt')&&e.querySelector('dd').attrs['aria-label'])));
check(()=>assert.equal(all('input[type="range"]').length,0));
check(()=>assert(all('.card').every(e=>e.querySelector('.title-button').dataset.action==='detail')));
const gridFlow=$('.opportunity-content').children.filter(e=>e.tagName!=='#TEXT');
check(()=>assert(gridFlow.length===1&&gridFlow[0].classList.contains('recommend-filter-panel')&&gridFlow[0].querySelector('.type-tabs')&&gridFlow[0].querySelector('.filters')&&gridFlow[0].querySelector('#results')));
check(()=>assert.equal($('.filters').querySelectorAll('[data-category="all"]').length,1));
check(()=>assert.equal($('.filters').querySelectorAll('[data-category="recommended"]').length,0));
check(()=>assert.equal($('.filters').querySelector('button').textContent.trim(),'전체'));
check(()=>assert($('.filters').querySelectorAll('button').every(e=>!e.querySelector('.icon'))));
homeSelect('notice');check(()=>assert.deepEqual(mainIds(),baselineNotices));
homeSelect('program');check(()=>assert.deepEqual(mainIds(),baselinePrograms));
check(()=>assert.equal($('[data-item="p06"]').querySelector('.fact-target').textContent,'전 학년지정트랙'));
check(()=>assert($('#search-input')&&$('#sort-filter')&&$('#open-filter'),'Both home types expose search, sorting and open-only controls'));
check(()=>assert.equal($('.filters').querySelectorAll('[data-category="all"]').length,1));
check(()=>assert.equal($('.filters').querySelector('button').textContent.trim(),'전체'));
check(()=>assert($('.filters').querySelectorAll('button').every(e=>!e.querySelector('.icon'))));
click('[data-category="learning"]');
check(()=>assert.deepEqual(mainIds(),['p11','p17']));
homeSelect('notice');
check(()=>assert.equal($('[data-category="all"]').attrs['aria-pressed'],'true','Changing the recommendation type resets the category'));
check(()=>assert.deepEqual(mainIds(),baselineNotices,'Changing the type restores the complete eligible notice list'));
homeSelect('program');
click('[data-category="all"]');
check(()=>assert.deepEqual(mainIds(),baselinePrograms,'Home All restores every eligible recommendation in its default order'));
check(()=>assert.equal($('[data-category="all"]').attrs['aria-pressed'],'true'));
homeSelect('program');click('[data-action="save"][data-id="p02"]');
check(()=>assert.equal($('.type-tabs').querySelector('[aria-pressed="true"]').dataset.tab,'program'));
check(()=>assert.deepEqual(mainIds(),baselinePrograms,'Saving retains the current recommendation list'));
check(()=>assert.equal(all('.stat-number').at(-1).textContent,'1'));
homeSelect('program');click('[data-action="save"][data-id="p02"]');
homeSelect('notice');check(()=>assert.equal($('[data-item="n03"]').querySelector('.fact-target').textContent,'3·4학년지정트랙'));
navigate('explore');
check(()=>assert.equal(location.hash,'#notices'));
check(()=>assert(!document.textContent.includes('전체 탐색')));
check(()=>assert.equal($('.explore-tabs'),null));
check(()=>assert.equal($('#main').querySelectorAll('h2').length,0));
check(()=>assert(!text().includes('관심 분야와 신청 기간을 확인하고 필요한 소식을 찾아보세요.')));
check(()=>assert.equal(all('.listing-cards').length,1));
check(()=>assert(text().includes('공지사항')));
check(()=>assert(all('.card').every(e=>e.dataset.item.startsWith('n'))));
check(()=>assert.equal($('#type-filter'),null));
check(()=>assert($('.desktop-nav').querySelector('.active').attrs.href==='#notices'));
check(()=>assert.equal($('.filters').children.find(e=>e.tagName==='BUTTON').dataset.category,'recommended'));
check(()=>assert.equal($('#main').querySelectorAll('.recommend-reason').length,0));
click('[data-category="recommended"]');
check(()=>assert.deepEqual(mainIds(),baselineNotices));
check(()=>assert(mainCards().every(e=>e.querySelector('.recommend-reason'))));
check(()=>assert($('#sort-filter')&&$('#open-filter'),'Recommended items use the shared filter controls'));
$('#search-input').value='no-results';document.dispatch('input',$('#search-input'));check(()=>assert.equal($('[data-action="reset-filter"]'),null));$('#search-input').value='';document.dispatch('input',$('#search-input'));
check(()=>assert.equal($('[data-category="recommended"]').attrs['aria-pressed'],'true'));
check(()=>assert.deepEqual(mainIds(),baselineNotices));
click('[data-category="all"]');check(()=>assert.equal($('#main').querySelectorAll('.recommend-reason').length,0));

$('#search-input').value='no-results';document.dispatch('input',$('#search-input'));check(()=>assert.equal($('[data-action="reset-filter"]'),null));$('#search-input').value='';document.dispatch('input',$('#search-input'));
check(()=>assert(all('.card').every(e=>e.dataset.item.startsWith('n'))));
navigate('programs');
check(()=>assert.equal($('#main').querySelector('h1').textContent,'비교과 프로그램'));
check(()=>assert(all('.card').every(e=>e.dataset.item.startsWith('p'))));
check(()=>assert($('.mobile-nav').querySelector('.active').attrs.href==='#programs'));
check(()=>assert.equal($('[data-category="recommended"]').attrs['aria-pressed'],'false'));
check(()=>assert.equal($('#main').querySelectorAll('.recommend-reason').length,0));
navigate('recommend');
click('[data-action="profile"]');submit('#profile-form');
check(()=>assert($('#form-error').textContent.includes('이름')));
$('#profile-name').value='테스트';submit('#profile-form');
check(()=>assert($('#form-error').textContent.includes('학년')));
selectGrade(4);submit('#profile-form');check(()=>assert($('#form-error').textContent.includes('트랙')));
$('#track1').value='기업경영트랙';$('#track2').value='기업경영';submit('#profile-form');
check(()=>assert($('#form-error').textContent.includes('같은 트랙')));
$('#track2').value='글로벌비즈니스트랙';submit('#profile-form');submit('#interest-form');
check(()=>assert($('#form-error').textContent.includes('최소 1개')));
for(const id of ['career','intern','contest','study'])interest(id);interest('startup');
check(()=>assert.equal($('#interest-form').querySelectorAll('input[name="interest"]:checked').length,4));
interest('study');submit('#interest-form');
check(()=>assert(!$('#modal').open));
check(()=>assert(text().includes('고민 많은 4학년,한성 PICK과 함께해요!')));homeSelect('notice');
check(()=>assert(!$('[data-item="n12"]')));
check(()=>assert(!$('[data-item="p11"]')));
check(()=>assert($('[data-item="n03"]')));
check(()=>assert($('[data-item="n18"]')));
check(()=>assert.equal(all('.rank-badge').length,1));
check(()=>assert(all('.rank-badge').every(e=>e.textContent==='🚩1순위'&&e.parentElement.classList.contains('card-top'))));
check(()=>assert(mainCards()[0].querySelector('.rank-badge')));homeSelect('program');check(()=>assert(!$('[data-item="p11"]')&&mainCards()[0].querySelector('.rank-badge')));homeSelect('notice');
const personalizedNotices=homeNoticeIds();
click('[data-action="quick-open"]');
const storedProfile=JSON.parse(storage.get('hsupick-v1')).profile;
check(()=>assert.deepEqual($('#modal').querySelectorAll('.card').map(e=>e.dataset.item).sort(),ITEMS.filter(i=>statusOf(i)==='open'&&matchProfile(i,storedProfile).eligible).map(i=>i.id).sort(),'Shortcut counts and lists use the current profile eligibility'));
check(()=>assert.equal(Number($('#modal').querySelector('.result-line').querySelector('strong').textContent),Number(all('.stat-number')[0].textContent)));
click('[data-action="close"]');
navigate('notices');click('[data-category="recommended"]');
check(()=>assert($('#search-input')&&$('#sort-filter')&&$('#open-filter'),'Notice exploration retains all tools'));
check(()=>assert($('.filters').querySelectorAll('button').every(e=>Boolean(e.querySelector('.icon'))===(e.dataset.category==='recommended'))));
check(()=>assert.deepEqual(mainIds(),personalizedNotices));
check(()=>assert(!$('[data-item="n12"]')));
homeSelect('notice');click('[data-action="save"][data-id="n03"]');check(()=>assert.deepEqual(mainIds(),personalizedNotices));
check(()=>assert.equal($('[data-category="recommended"]').attrs['aria-pressed'],'true'));
homeSelect('notice');click('[data-action="save"][data-id="n03"]');
click('[data-category="all"]');check(()=>assert($('[data-item="n12"]')&&!$('#main').querySelector('.recommend-reason')));
navigate('recommend');const personalizedPrograms=homeProgramIds();navigate('programs');click('[data-category="recommended"]');
check(()=>assert.deepEqual(mainIds(),personalizedPrograms));
check(()=>assert(!$('[data-item="p11"]')&&!$('[data-item="p17"]'),'Program recommendations exclude ineligible grades'));
// Shared sorting controls honor explicit choices within eligible recommendations.
for(const [value,field,direction] of [['deadline','deadline',1],['latest','start',-1]]){
 const expected=personalizedPrograms.map(id=>ITEMS.find(i=>i.id===id)).sort((a,b)=>direction*a[field].localeCompare(b[field])).map(i=>i.id);
 change('#sort-filter',value);
 check(()=>assert.deepEqual(mainIds(),expected,`${value} sorting works in the recommended program tab`));
}
change('#sort-filter','recommended');
check(()=>assert.deepEqual(mainIds(),personalizedPrograms,'Default restores the same order as the home recommendations'));
$('#open-filter').checked=false;change('#open-filter');
check(()=>assert.deepEqual(new Set(mainIds()),new Set(ITEMS.filter(i=>i.type==='program'&&matchProfile(i,JSON.parse(storage.get('hsupick-v1')).profile).eligible).map(i=>i.id)),'Removing the status filter includes eligible closed/upcoming programs'));
$('#open-filter').checked=true;change('#open-filter');
check(()=>assert.equal($('#open-filter').checked,true));

// Search and filters remain available in each type's list.
navigate('programs');
$('#search-input').value='포트폴리오';document.dispatch('input',$('#search-input'));
check(()=>assert.equal(all('.card').length,1));
check(()=>assert.equal($('#type-filter'),null));
$('#search-input').value='no-results';document.dispatch('input',$('#search-input'));
check(()=>assert.equal($('[data-action="reset-filter"]'),null));$('#search-input').value='';document.dispatch('input',$('#search-input'));check(()=>assert(all('.card').length>1));
click('[data-category="other"]');check(()=>assert(all('.card').every(c=>c.querySelector('.category-badge').textContent==='기타')));
change('#sort-filter','deadline');check(()=>assert.equal(all('.card')[0].dataset.item,'p13','Recruiting default excludes closed items from deadline sorting'));
navigate('recommend');
// Saved recommendations intersect current recommendations with saved IDs.
// Include wrong-track, wrong-grade, upcoming and closed entries to exercise exclusions.
const savedNoticeFixture=['n01','n03','n12','n14'];
const savedProgramFixture=['p02','p08','p11','p15'];
navigate('notices');$('#open-filter').checked=false;change('#open-filter');
for(const id of savedNoticeFixture)click(`[data-action="save"][data-id="${id}"]`);
navigate('programs');$('#open-filter').checked=false;change('#open-filter');
for(const id of savedProgramFixture)click(`[data-action="save"][data-id="${id}"]`);
navigate('saved');click('[data-tab="notice"]');
check(()=>assert.equal($('.filters').querySelectorAll('button')[0].dataset.category,'recommended'));
check(()=>assert($('#search-input')&&$('#sort-filter')&&$('#open-filter'),'MY PICK retains all tools'));
check(()=>assert($('.filters').querySelectorAll('button').every(e=>Boolean(e.querySelector('.icon'))===(e.dataset.category==='recommended'))));
check(()=>assert.equal($('#main').querySelector('h1').textContent,'MY PICK'));
check(()=>assert.deepEqual($('.saved-tabs').querySelectorAll('button').map(e=>e.textContent.trim()),['공지사항','비교과 프로그램']));
check(()=>assert($('.saved-tabs').querySelectorAll('button').every(e=>e.querySelector('.icon'))));
check(()=>assert.equal($('#main').querySelector('.info-row'),null));
const savedFlow=$('.saved-filter-panel').children.filter(e=>e.tagName!=='#TEXT');
check(()=>assert(savedFlow[0].classList.contains('type-tabs')&&savedFlow[1].classList.contains('filters')&&savedFlow[2].classList.contains('search-tools')&&savedFlow[3].id==='results','MY PICK search controls sit between the categories and result count'));
check(()=>assert($('#open-filter').checked,'Saved views default to currently recruiting items'));
$('#open-filter').checked=false;change('#open-filter');
check(()=>assert.deepEqual(new Set(mainIds()),new Set(savedNoticeFixture)));
click('[data-category="recommended"]');
check(()=>assert.deepEqual(mainIds(),personalizedNotices.filter(id=>savedNoticeFixture.includes(id)),'Saved notice recommendations match the home order, excluding ineligible/upcoming/unsaved entries'));
check(()=>assert($('#sort-filter')&&$('#open-filter'),'Recommended items use the shared filter controls'));
click('[data-tab="program"]');
check(()=>assert.equal($('[data-category="recommended"]').attrs['aria-pressed'],'true','Changing types preserves the recommended filter'));
check(()=>assert.deepEqual(mainIds(),personalizedPrograms.filter(id=>savedProgramFixture.includes(id)),'Saved program recommendations exclude wrong-grade and closed entries'));
$('#search-input').value='no-results';document.dispatch('input',$('#search-input'));
check(()=>assert.equal(mainCards().length,0));
check(()=>assert.equal($('[data-action="reset-filter"]'),null));$('#search-input').value='';document.dispatch('input',$('#search-input'));
check(()=>assert.equal($('[data-category="recommended"]').attrs['aria-pressed'],'true'));
check(()=>assert.deepEqual(mainIds(),personalizedPrograms.filter(id=>savedProgramFixture.includes(id))));
homeSelect('program');click('[data-action="save"][data-id="p02"]');
check(()=>assert.deepEqual(mainIds(),['p08'],'Unsave immediately removes an entry from saved recommendations'));
homeSelect('program');click('[data-action="save"][data-id="p08"]');
check(()=>assert.equal(mainCards().length,0));
check(()=>assert(text().includes('저장한 PICK이 있어요')&&$('[data-action="show-unavailable"]')));
navigate('recommend');
check(()=>assert(location.hash==='#recommend'&&$('.hero-carousel')));
navigate('saved');click('[data-tab="program"]');
check(()=>assert($('#open-filter').checked,'Switching type restores the recruiting default'));
$('#open-filter').checked=false;change('#open-filter');
check(()=>assert.deepEqual(new Set(mainIds()),new Set(['p11','p15']),'Ordinary saved views still include saved entries outside recommendation eligibility'));
for(const id of ['p11','p15'])click(`[data-action="save"][data-id="${id}"]`);
click('[data-tab="notice"]');
$('#open-filter').checked=false;change('#open-filter');
for(const id of savedNoticeFixture)click(`[data-action="save"][data-id="${id}"]`);
check(()=>assert.equal(mainCards().length,0));
navigate('recommend');
// Save, remove, type-specific MY PICK, persisted reload.
homeSelect('program');click('[data-action="save"][data-id="p02"]');navigate('saved');
check(()=>assert.equal(mainCards().length,1));
check(()=>assert(text().includes('MY PICK')&&!text().includes('나의 MY PICK')&&!text().includes('MY LITTLE COLLECTION')&&!text().includes('더 찾아보기')));
check(()=>assert.equal($('.saved-tabs').querySelectorAll('button').length,2));
check(()=>assert.equal($('[data-tab="program"]').attrs['aria-pressed'],'true'));
check(()=>assert.equal($('#main').querySelectorAll('.recommend-reason').length,0));
click('[data-tab="notice"]');check(()=>assert(text().includes('저장한 공지사항이 없어요')));
click('[data-tab="program"]');check(()=>assert.deepEqual(mainIds(),['p02']));
homeSelect('program');click('[data-action="save"][data-id="p02"]');check(()=>assert(text().includes('저장한 비교과 프로그램이 없어요')));
click('[data-action="go-programs"]');check(()=>assert.equal($('#main').querySelector('h1').textContent,'비교과 프로그램'));
navigate('recommend');homeSelect('notice');click('[data-action="save"][data-id="n03"]');
setup();await import('../dist/app.js?reload');navigate('saved');
check(()=>assert.equal(all('.card').length,1));check(()=>assert($('[data-item="n03"]')));
navigate('recommend');check(()=>assert(text().includes('4학년')));
// Compare two/three picks; max cap; conditions, dates, benefits, preparations.
for(const id of ['p02','n03']){homeSelect(id.startsWith('p')?'program':'notice');const cb=$(`[data-compare="${id}"]`);cb.checked=true;change(`[data-compare="${id}"]`);}
click('[data-action="compare"]');
check(()=>assert($('#modal').textContent.includes('準備')===false&&$('#modal').textContent.includes('준비사항')));
check(()=>assert.equal($('#modal').querySelectorAll('table').length,0));
check(()=>assert.equal($('#modal').querySelectorAll('.comparison-group').length,2));
check(()=>assert.equal($('#modal').querySelectorAll('.comparison-card').length,2));
for(const group of $('#modal').querySelectorAll('.comparison-group'))check(()=>assert(group.querySelectorAll('.comparison-card').every(c=>c.dataset.item.startsWith(group.dataset.kind==='notice'?'n':'p'))));
check(()=>assert(!/샘플|시연|가상|미연동/.test($('#modal').textContent)));
check(()=>assert.equal($('#modal').querySelectorAll('.recommend-reason').length,0));
check(()=>assert($('#modal').querySelectorAll('.comparison-card').every(c=>c.querySelector('.card-facts').querySelectorAll('.fact-cell').length===3)));
check(()=>assert($('#modal').querySelectorAll('.comparison-details').every(e=>e.textContent.includes('신청 기간')&&e.textContent.includes('신청 대상')&&e.textContent.includes('준비사항'))));
check(()=>assert($('#modal').textContent.includes('자기소개서')&&$('#modal').textContent.includes('20pt')));
click($('#modal').querySelector('[data-action="save"][data-id="p02"]'));check(()=>assert.equal($('#modal').querySelector('[data-action="save"][data-id="p02"]').attrs['aria-pressed'],'true'));
click('[data-action="close"]');for(const id of ['p04','p05']){homeSelect('program');const cb=$(`[data-compare="${id}"]`);cb.checked=true;change(`[data-compare="${id}"]`);}
check(()=>assert($('#compare-tray').textContent.includes('3 / 3'),'The comparison limit includes items in the other type tab'));
check(()=>assert.equal($('[data-compare="p05"]').checked,false));
click('[data-action="compare"]');
check(()=>assert.equal($('#modal').querySelectorAll('.comparison-card').length,3));
click('[data-action="remove-compare"][data-id="p04"]');check(()=>assert($('#modal').open&&$('#modal').querySelectorAll('.comparison-card').length===2));
click('[data-action="remove-compare"][data-id="p02"]');homeSelect('notice');check(()=>assert(!$('#modal').open&&$('[data-compare="n03"]').checked&&$('#compare-tray').textContent.includes('1 / 3')));
click('[data-action="clear-compare"]');check(()=>assert.equal($('#compare-tray').textContent,''));
// Saved tabs isolate types and retain their type after clearing an empty search.
navigate('saved');click('[data-tab="notice"]');check(()=>assert.deepEqual(mainIds(),['n03']));
click('[data-tab="program"]');check(()=>assert.deepEqual(mainIds(),['p02']));
check(()=>assert.equal($('#type-filter'),null));
check(()=>assert.equal($('#main').querySelectorAll('.recommend-reason').length,0));
$('#search-input').value='no-results';document.dispatch('input',$('#search-input'));check(()=>assert.equal($('[data-action="reset-filter"]'),null));$('#search-input').value='';document.dispatch('input',$('#search-input'));
check(()=>assert.deepEqual(mainIds(),['p02']));
check(()=>assert.equal($('[data-tab="program"]').attrs['aria-pressed'],'true'));
navigate('recommend');
// Detail, official external links, missing-data states and application guidance.
homeSelect('program');click($('[data-item="p02"]').querySelector('.title-button'));
check(()=>assert(!/샘플|시연|가상|프로토타입/.test($('#modal').textContent)));
check(()=>assert(!$('#modal').querySelector('[data-action="source"]')&&!$('#modal').querySelector('.raw-document')));
check(()=>assert($('#modal').querySelector('.official-shortcut').attrs.href==='https://hsportal.hansung.ac.kr/'));
check(()=>assert($('#modal').querySelector('.program-facts')&&$('#modal').textContent.includes('신청 대상')));
check(()=>assert.equal($('#modal').querySelector('.step-label').textContent,'기타'));
click('[data-action="close"]');navigate('programs');click('[data-action="detail"][data-id="p16"]');
check(()=>assert($('#modal').querySelector('.program-facts').textContent.includes('원문 확인')));
check(()=>assert(!$('#modal').textContent.includes('미리 준비할 것')));
click('[data-action="close"]');const cb=$('#open-filter');cb.checked=false;change('#open-filter');
check(()=>assert($('[data-item="p15"]').textContent.includes('모집 마감')));
click('[data-action="detail"][data-id="p15"]');check(()=>assert($('#modal').textContent.includes('대상 조건 일치 · 모집 마감')));
click('[data-action="close"]');navigate('notices');$('#open-filter').checked=false;change('#open-filter');
check(()=>assert($('[data-item="n14"]').textContent.includes('모집 예정')));
navigate('profile');click('[data-action="profile"]');
check(()=>assert.equal($('#track1').value,'기업경영트랙'));
selectGrade(1);$('#track1').value='IT공과대학';$('#track2').value='';submit('#profile-form');
for(const input of all('input[name="interest"]'))input.checked=false;
interest('study');interest('wellbeing');submit('#interest-form');
check(()=>assert.equal(location.hash,'#profile','Editing profile returns to MY PAGE'));navigate('recommend');homeSelect('program');check(()=>assert($('[data-item="p11"]')));homeSelect('notice');check(()=>assert(!$('[data-item="n18"]')));
check(()=>assert(!$('[data-item="n03"]')));
const updatedNotices=homeNoticeIds();navigate('notices');click('[data-category="recommended"]');
check(()=>assert.deepEqual(mainIds(),updatedNotices));
check(()=>assert(!$('[data-item="n03"]')&&!$('[data-item="n18"]')));
// New selections must come from the catalog; arbitrary hidden input is rejected.
navigate('profile');click('[data-action="profile"]');$('#track1').value='<img src=x onerror=alert(1)>';submit('#profile-form');
check(()=>assert($('#form-error').textContent.includes('목록에서')));
check(()=>assert.equal($('#modal').querySelectorAll('img').length,0));
click('[data-action="close"]');
// Reset requires an explicit dialog action.
navigate('profile');
check(()=>assert($('#main').querySelector('h1').textContent==='MY PAGE'&&$('#main').querySelector('h1').querySelector('.icon')));
check(()=>assert(!text().includes('MADE FOR YOU')&&!text().includes('어떻게 추천하나요?')));
click('[data-action="reset-confirm"]');click('[data-action="close"]');
check(()=>assert(text().includes('내 정보')&&text().includes('로그인 관리')));
click('[data-action="reset-local-confirm"]');click('[data-action="reset-data"]');
check(()=>assert(text().includes('내 정보 입력하기')));check(()=>assert.equal(JSON.parse(storage.get('hsupick-v1')).saved.length,0));
// Deep link to sample original works after reload.
setup();location.hash='#source/n01';await import('../dist/app.js?deep');
check(()=>assert($('#modal').open&&$('#modal').textContent.includes('학업지원 장학금')));
click('[data-action="close"]');check(()=>assert(text().includes('공지사항')));
setup();location.hash='#source/p02';await import('../dist/app.js?program-deep');
check(()=>assert($('#modal').open&&$('#modal').textContent.includes('포트폴리오')));
click('[data-action="close"]');check(()=>assert.equal($('#main').querySelector('h1').textContent,'비교과 프로그램'));
// Mobile MY PICK uses the home panel, but every result must remain bookmarked.
const mobileProfile={grade:4,tracks:['기업경영트랙'],interests:['career','intern']};
const mobileSavedIds=[...savedNoticeFixture,...savedProgramFixture];
storage.set('hsupick-v1',JSON.stringify({profile:mobileProfile,saved:mobileSavedIds}));
setup(true);await import('../dist/app.js?mobile-saved');
check(()=>assert.deepEqual($('.quick-stats').querySelectorAll('button').map(e=>e.dataset.action),['quick-open','quick-urgent','go-saved'],'Mobile summary order follows the requested swap'));
const mobileHomeNotices=homeNoticeIds(),mobileHomePrograms=homeProgramIds();
navigate('saved');click('[data-tab="notice"]');
const mobilePanel=$('.saved-filter-panel');
check(()=>assert(mobilePanel&&mobilePanel.querySelector('.type-tabs')&&mobilePanel.querySelector('.filters')&&mobilePanel.querySelector('#results'),'Mobile tabs, categories and results share the home-style panel'));
check(()=>assert.equal($('[data-category="all"]').attrs['aria-pressed'],'true','Saved pages always open on all'));
check(()=>assert(!$('[data-category="recommended"]').querySelector('span')&&$('[data-category="recommended"]').querySelector('.icon')));
check(()=>assert(!$('#search-input')&&$('#sort-filter')&&$('#open-filter')&&$('[data-action="toggle-search"]').attrs['aria-expanded']==='false','Mobile search starts collapsed beside sorting and recruitment controls'));
check(()=>assert(!$('.result-line').textContent.includes('샘플 기준일')));
check(()=>assert($('#open-filter').checked,'Mobile MY PICK starts with recruitment checked'));
$('#open-filter').checked=false;change('#open-filter');
check(()=>assert($('#sort-filter').hidden&&$('#sort-options').hidden,'Mobile sorting uses the app menu instead of the native popup'));
click('[data-action="toggle-sort"]');
check(()=>assert(!$('#sort-options').hidden&&document.activeElement.dataset.id==='recommended'));
document.dispatch('keydown',document.activeElement,{key:'End'});
check(()=>assert.equal(document.activeElement.dataset.id,'latest'));
document.dispatch('keydown',document.activeElement,{key:'Enter'});
check(()=>assert($('#sort-options').hidden&&$('.sort-current').textContent==='최근 등록순'&&$('#sort-filter').value==='latest'));
check(()=>assert.deepEqual(mainIds(),ITEMS.filter(i=>savedNoticeFixture.includes(i.id)).sort((a,b)=>b.start.localeCompare(a.start)).map(i=>i.id),'Keyboard selection updates the actual saved-result order'));
click('[data-action="toggle-sort"]');click('[data-action="select-sort"][data-id="recommended"]');
click('[data-action="toggle-sort"]');document.dispatch('keydown',document.activeElement,{key:'Escape'});
check(()=>assert($('#sort-options').hidden&&document.activeElement===$('[data-action="toggle-sort"]')));
click('[data-action="toggle-sort"]');document.dispatch('click',$('#main'));
check(()=>assert($('#sort-options').hidden&&$('[data-action="toggle-sort"]').attrs['aria-expanded']==='false'));

check(()=>assert.deepEqual(new Set(mainIds()),new Set(savedNoticeFixture),'All includes saved ineligible and upcoming notices'));
click('[data-action="toggle-search"]');
check(()=>assert($('.mobile-search-tools').classList.contains('is-expanded')&&document.activeElement===$('#search-input'),'Opening search expands and focuses the input'));
$('#search-input').value=ITEMS.find(i=>i.id==='n03').title;document.dispatch('input',$('#search-input'));
check(()=>assert.deepEqual(mainIds(),['n03'],'Searching MY PICK remains limited to bookmarks'));
click('[data-action="toggle-search"]');
check(()=>assert(!$('#search-input')&&document.activeElement===$('[data-action="toggle-search"]')));
check(()=>assert.deepEqual(new Set(mainIds()),new Set(savedNoticeFixture),'Closing search clears the query and restores saved results'));
click('[data-action="toggle-search"]');
$('#search-input').value='no-results';document.dispatch('input',$('#search-input'));
document.dispatch('keydown',$('#search-input'),{key:'Escape'});
check(()=>assert(!$('#search-input')&&mainIds().length===savedNoticeFixture.length,'Escape closes search and clears its filter'));
change('#sort-filter','latest');
check(()=>assert.deepEqual(mainIds(),ITEMS.filter(i=>savedNoticeFixture.includes(i.id)).sort((a,b)=>b.start.localeCompare(a.start)).map(i=>i.id),'Mobile saved sorting uses the selected order'));
$('#open-filter').checked=true;change('#open-filter');
check(()=>assert(mainIds().every(id=>savedNoticeFixture.includes(id)&&statusOf(ITEMS.find(i=>i.id===id))==='open'),'Recruitment filtering never introduces unsaved items'));
$('#open-filter').checked=false;change('#open-filter');change('#sort-filter','recommended');
check(()=>assert.deepEqual(new Set(mainIds()),new Set(savedNoticeFixture)));
click('[data-category="recommended"]');
check(()=>assert.deepEqual(mainIds(),allEligibleSaved(savedNoticeFixture),'Mobile recommended notices are the current home recommendations intersected with bookmarks'));
click('[data-category="all"]');
check(()=>assert.deepEqual(new Set(mainIds()),new Set(savedNoticeFixture),'All restores bookmarked entries outside recommendation eligibility'));
click('[data-category="recommended"]');click('[data-tab="program"]');
check(()=>assert.equal($('[data-category="all"]').attrs['aria-pressed'],'true','A new saved type starts with all'));
check(()=>assert($('#open-filter').checked));
$('#open-filter').checked=false;change('#open-filter');
check(()=>assert.deepEqual(new Set(mainIds()),new Set(savedProgramFixture),'All includes saved wrong-grade and closed programs'));
click('[data-category="recommended"]');
check(()=>assert.deepEqual(mainIds(),allEligibleSaved(savedProgramFixture)));
click('[data-action="save"][data-id="p02"]');
check(()=>assert.deepEqual(mainIds(),['p15','p08'],'Removing a bookmark immediately removes it while retaining eligible closed picks'));
click('[data-category="all"]');
check(()=>assert.deepEqual(new Set(mainIds()),new Set(['p08','p11','p15'])));
click('[data-category="recommended"]');navigate('recommend');navigate('saved');
check(()=>assert.equal($('[data-category="all"]').attrs['aria-pressed'],'true','Reentering MY PICK resets to all'));
check(()=>assert($('#open-filter').checked&&mainIds().every(id=>statusOf(ITEMS.find(i=>i.id===id))==='open'),'Reentering restores the recruiting default'));
$('#open-filter').checked=false;change('#open-filter');
check(()=>assert.deepEqual(new Set(mainIds()),new Set(['p08','p11','p15'])));
// Existing desktop filters become visible mobile controls on resize.
setMobileViewport(false);
check(()=>assert($('.saved-filter-panel')&&$('#search-input')&&$('#sort-filter')&&$('#open-filter'),'Desktop shares the saved card while retaining its tools'));
$('#search-input').value='no-results';document.dispatch('input',$('#search-input'));
$('#open-filter').checked=true;change('#open-filter');
check(()=>assert.equal(mainIds().length,0));
setMobileViewport(true);
check(()=>assert.equal(mainIds().length,0,'Visible mobile filters preserve the desktop search'));
check(()=>assert($('#search-input').value==='no-results'&&$('.mobile-search-tools').classList.contains('is-expanded')&&$('#open-filter').checked,'A retained query is shown in the expanded mobile search'));
setMobileViewport(false);
check(()=>assert.equal($('#search-input').value,'no-results'));
check(()=>assert.equal(mainIds().length,0,'Desktop filter state is preserved when resizing back'));
setMobileViewport(true);navigate('recommend');
check(()=>assert(!$('#search-input')&&$('#sort-filter')&&$('#open-filter'),'Navigating to home resets search to the collapsed state'));
homeSelect('notice');click('[data-action="toggle-search"]');
$('#search-input').value=ITEMS.find(i=>i.id==='n03').title;document.dispatch('input',$('#search-input'));
check(()=>assert.deepEqual(mainIds(),['n03'],'Mobile home search filters its current recommendations'));
click('[data-action="toggle-search"]');
for(const page of ['notices','programs']){
 navigate(page);
 check(()=>assert(!$('#search-input')&&$('#sort-filter')&&$('#open-filter')));
 click('[data-action="toggle-search"]');
 $('#search-input').value='no-results';document.dispatch('input',$('#search-input'));
 check(()=>assert.equal(mainIds().length,0));
 check(()=>assert.equal($('[data-action="reset-filter"]'),null));$('#search-input').value='';document.dispatch('input',$('#search-input'));
 check(()=>assert($('#search-input').value===''&&mainIds().length>0));
}
navigate('notices');
for(const [id,label,url] of [['n03','공지사항 바로가기','https://www.hansung.ac.kr/hansung/6172/subview.do'],['p02','스마트자기관리시스템 바로가기','https://hsportal.hansung.ac.kr/']]){
 click(`[data-action="detail"][data-id="${id}"]`);
 const link=$('#modal').querySelector('.official-shortcut');
 check(()=>assert(link&&link.textContent.includes(label)&&link.attrs.href===url&&link.attrs.target==='_blank','Mobile blue button links directly to the relevant official site'));
 check(()=>assert(!$('#modal').querySelector('[data-action="source"]')&&!$('#modal').querySelector('.real-source'),'Mobile detail omits the duplicate lower link'));
 click('[data-action="close"]');
 if(id==='n03')navigate('programs');
}
navigate('recommend');
// Comparison completion closes the mobile dialog and clears all selected types.
for(const id of ['p02','n03']){homeSelect(id.startsWith('p')?'program':'notice');const input=$(`[data-compare="${id}"]`);input.checked=true;change(`[data-compare="${id}"]`);}
click('[data-action="compare"]');
check(()=>assert($('#modal').open&&$('#modal').querySelectorAll('.comparison-card').length===2));
click('[data-action="complete-compare"]');
check(()=>assert(!$('#modal').open&&$('#modal').textContent===''&&document.body.style.overflow==='','Completion closes and cleans up the modal'));
check(()=>assert.equal($('#compare-tray').textContent,''));
check(()=>assert(!document.body.classList.contains('has-tray')));
check(()=>assert.equal($('[data-compare="n03"]').checked,false));
homeSelect('program');check(()=>assert.equal($('[data-compare="p02"]').checked,false,'Selections in the other type tab are also cleared'));
check(()=>assert.deepEqual(new Set(JSON.parse(storage.get('hsupick-v1')).saved),new Set(mobileSavedIds.filter(id=>id!=='p02')),'Completing comparison leaves bookmarks intact'));
const nextInput=$('[data-compare="p02"]');nextInput.checked=true;change('[data-compare="p02"]');
check(()=>assert($('#compare-tray').textContent.includes('1 / 3'),'A new comparison starts with an empty selection'));
click('[data-action="clear-compare"]');
setMobileViewport(false);
check(()=>assert.deepEqual($('.quick-stats').querySelectorAll('button').map(e=>e.dataset.action),['quick-open','quick-urgent','go-saved'],'Desktop summary order is unchanged'));

// The picker preserves drafts, filters all PDF entries and persists three tracks.
storage.clear();setup(true);await import('../dist/app.js?track-picker');
navigate('notices');
check(()=>assert.deepEqual(all('.notice-category-row').map(row=>row.querySelectorAll('[data-category]').map(b=>b.dataset.category)),[['recommended','all','academic','activity','scholarship'],['career','intern','international','startup']]));
navigate('profile');click('[data-action="profile"]');
check(()=>assert.deepEqual(all('input[name="grade"]').map(r=>r.value),['1','2','3','4','other']));
check(()=>assert.equal(all('.track-picker-trigger').length,3));
check(()=>assert([1,2,3].every(n=>$('#track'+n).attrs.type==='hidden')));
check(()=>assert(all('.track-field').slice(0,2).every(f=>f.querySelector('label').textContent.includes('필수'))&&all('.track-field')[2].querySelector('label').textContent.includes('선택')));
selectGrade('other');submit('#profile-form');
check(()=>assert($('#form-error').textContent.includes('1트랙')));
const pick=name=>click(`[data-action="select-track"][data-id="${TRACK_OPTIONS.find(t=>t.name===name).id}"]`);
const searchTrack=query=>{const input=$('#track-search');input.value=query;input.focus();document.dispatch('input',input);};
const filterTrack=(kind,id)=>{click(`[data-action="track-filter-menu"][data-kind="${kind}"]`);click(`[data-action="track-filter-value"][data-kind="${kind}"][data-id="${id}"]`);};
click('#track-picker-1');
check(()=>assert($('#modal').classList.contains('track-picker-dialog')&&$('#modal-title').textContent==='1트랙 선택'));
check(()=>assert.equal($('#track-results').textContent,''));
check(()=>assert.equal(all('.track-option').length,0,'First entry has no catalog before a search or selection'));
searchTrack('   ');check(()=>assert.equal($('#track-results').textContent,''));
filterTrack('college','all');
check(()=>assert.equal(all('.track-college-group').length,0));
check(()=>assert.equal(all('.track-option').length,0));
check(()=>assert.equal(all('.track-filter-button').length,1,'Department selection follows college selection'));
searchTrack('기업경영');
check(()=>assert.equal(all('.track-option').length,1));
check(()=>assert.equal(document.activeElement,$('#track-search')));
pick('기업경영트랙');
check(()=>assert($('#track1').value==='기업경영트랙'&&$('[name="grade"][value="other"]').checked&&document.activeElement===$('#track-picker-1')));
click('#track-picker-2');
check(()=>assert.equal($('#track-results').textContent,'','Each slot starts blank independently'));
searchTrack('기업경영');
const duplicate=$(`[data-action="select-track"][data-id="${TRACK_OPTIONS.find(t=>t.name==='기업경영트랙').id}"]`);
check(()=>assert(duplicate.disabled));
document.dispatch('click',duplicate);
check(()=>assert($('#track-search'),'Duplicate action cannot exit or overwrite the draft'));
searchTrack('');check(()=>assert.equal($('#track-results').textContent,'','Clearing the initial search restores white space'));
click('[data-action="track-filter-menu"][data-kind="college"]');
check(()=>assert.equal($('#track-menu-college').querySelectorAll('button').length,9));
click('[data-action="track-filter-value"][data-kind="college"][data-id="social"]');
check(()=>assert.equal(all('.track-option').length,0,'Track options follow department selection'));
check(()=>assert.equal(all('.track-filter-button').length,2));
filterTrack('group','social-0');
pick('글로벌비즈니스트랙');
click('#track-picker-3');check(()=>assert.equal($('#track-results').textContent,''));filterTrack('college','engineering');
check(()=>assert.equal(all('.track-option').length,0));
filterTrack('group','engineering-0');
check(()=>assert.equal(all('.track-option').length,5));
searchTrack('지능형실감미디어');
check(()=>assert.equal(all('.track-option').length,1));
check(()=>assert(all('.track-option')[0].textContent.includes('2027')));
searchTrack('없음-검색');
check(()=>assert($('.track-empty')));
check(()=>assert.equal($('[data-action="reset-track-filter"]'),null));searchTrack('');filterTrack('college','all');
check(()=>assert($('#track-search').value===''&&$('#track-results').textContent==='','Clearing search and choosing all colleges returns to the blank catalog'));
filterTrack('college','social');filterTrack('group','social-0');filterTrack('college','engineering');
check(()=>assert.equal(all('.track-option').length,0,'Changing college clears the previous department'));
searchTrack('웹공학');pick('웹공학트랙');
check(()=>assert.deepEqual([1,2,3].map(n=>$('#track'+n).value),['기업경영트랙','글로벌비즈니스트랙','웹공학트랙']));
submit('#profile-form');interest('study');submit('#interest-form');
check(()=>assert.deepEqual(JSON.parse(storage.get('hsupick-v1')).profile,{name:'테스트',grade:'other',tracks:['기업경영트랙','글로벌비즈니스트랙','웹공학트랙'],interests:['study']}));
check(()=>assert($('.hero-slide').textContent.includes('고민 많은 4학년,한성 PICK과 함께해요!')&&!text().includes('other학년')));
setup(true);await import('../dist/app.js?track-picker-reload');navigate('profile');
check(()=>assert(text().includes('기타')&&text().includes('웹공학트랙')));
click('[data-action="profile"]');click('[data-action="clear-track"][data-slot="2"]');
check(()=>assert($('#track2').value===''&&$('#track3').value==='웹공학트랙'));
click('#track-picker-2');click('[data-action="track-filter-menu"][data-kind="college"]');
check(()=>assert($('#modal').dispatch('cancel').defaultPrevented&&!$('#track-menu-college')&&$('#track-search')));
check(()=>assert($('#modal').dispatch('cancel').defaultPrevented&&$('#profile-form')));
check(()=>assert($('#track3').value==='웹공학트랙'&&$('[name="grade"][value="other"]').checked));
$('#profile-form').dispatch('submit');check(()=>assert($('#form-error').textContent.includes('2트랙')));$('#track2').value='글로벌비즈니스트랙';submit('#profile-form');click('[data-action="profile-back"]');
check(()=>assert($('#track2').value==='글로벌비즈니스트랙'&&$('#track3').value==='웹공학트랙','Going back retains required and optional fields'));
click('[data-action="clear-track"][data-slot="3"]');submit('#profile-form');submit('#interest-form');
check(()=>assert.deepEqual(JSON.parse(storage.get('hsupick-v1')).profile.tracks,['기업경영트랙','글로벌비즈니스트랙'],'Only 3-track may be empty'));

// Both catalogs stay in two explicit mobile rows; notice filters use their new taxonomy.
storage.clear();setup(true);await import('../dist/app.js?notice-taxonomy');
navigate('notices');
check(()=>assert.equal(all('.category-row').length,2));
check(()=>assert.deepEqual(all('[data-category]').map(b=>b.dataset.category),['recommended','all','academic','activity','scholarship','career','intern','international','startup']));
click('[data-category="academic"]');
check(()=>assert.deepEqual(mainIds(),['n10']));
check(()=>assert($('[data-item="n10"]').querySelector('.category-badge').textContent==='학사'));
click('[data-action="save"][data-id="n10"]');navigate('saved');click('[data-category="academic"]');
check(()=>assert.deepEqual(mainIds(),['n10']));
click('[data-category="international"]');check(()=>assert.equal(mainCards().length,0));
navigate('programs');check(()=>assert.equal(all('.category-row').length,2));
check(()=>assert.equal($('#main').querySelector('h1').textContent,'비교과 프로그램'));
navigate('saved');click('[data-tab="program"]');
check(()=>assert($('[data-action="go-programs"]').querySelector('.icon')));
click('[data-action="go-programs"]');check(()=>assert($('#main').classList.contains('browse-page')));

// First-year affiliations are selectable and cannot bypass the required first field.
storage.clear();setup(true);await import('../dist/app.js?first-year-affiliations');
navigate('profile');click('[data-action="profile"]');selectGrade(1);
click('#track-picker-1');
check(()=>assert.equal($('#track-results').textContent,'','First-year picker also starts blank'));
filterTrack('college','all');
check(()=>assert(!all('.track-option').some(b=>b.textContent.includes('미정'))));
check(()=>assert(all('.track-option').every(b=>trackOptionsForSlot({slot:1,grade:1}).some(t=>t.id===b.dataset.id))));
searchTrack('IT공과대학');
const collegeOption=trackOptionsForSlot({slot:1,grade:1}).find(t=>t.name==='IT공과대학');
click(`[data-action="select-track"][data-id="${collegeOption.id}"]`);
check(()=>assert.equal($('#track1').value,'IT공과대학'));
check(()=>assert(!$('#track-picker-2')&&!$('#track-picker-3'),'First years only see the required 1-track field'));
submit('#profile-form');interest('study');submit('#interest-form');
check(()=>assert.deepEqual(JSON.parse(storage.get('hsupick-v1')).profile.tracks,['IT공과대학']));
setup(true);await import('../dist/app.js?affiliation-reload');navigate('profile');click('[data-action="profile"]');
check(()=>assert.equal($('#track1').value,'IT공과대학'));
$('#track1').value='미정';submit('#profile-form');
check(()=>assert($('#form-error').textContent.includes('목록에서')));
$('#track1').value='웹공학트랙';submit('#profile-form');
check(()=>assert($('#form-error').textContent.includes('1학년')));
selectGrade(2);$('#track1').value='웹공학트랙';
selectGrade(1);$('#profile-form').dispatch('change',$('[name="grade"][value="1"]'));
check(()=>assert.equal($('#track1').value,''));
submit('#profile-form');check(()=>assert($('#form-error').textContent.includes('1트랙')));
click('[data-action="close"]');

// Every status, summary and open dialog uses today's Korean calendar date.
runtimeNow='2026-10-11T08:05:00Z';storage.clear();setup(true);await import('../dist/app.js?live-date');
check(()=>assert.equal($('[data-item="n01"]').querySelector('.status-badge').textContent,'D-5'));
homeSelect('program');
check(()=>assert(!$('[data-item="p13"]')&&$('[data-item="p05"]').querySelector('.status-badge').textContent.includes('오늘 마감')));
check(()=>assert.equal($('[data-item="p02"]').querySelector('.status-badge').textContent,'D-2'));
check(()=>assert.equal(all('.stat-value')[0].textContent.trim(),`${ITEMS.filter(i=>statusOf(i)==='open').length}개`));
for(const [id,date,badgeText] of [['n01','2026.10.11','D-5'],['p05','2026.10.11','오늘 마감']]){
 homeSelect(id.startsWith('n')?'notice':'program');click(`[data-action="detail"][data-id="${id}"]`);
 check(()=>assert(!$('#modal').textContent.includes('상태와 D-day는 오늘 날짜')&&$('#modal').querySelector('.status-badge').textContent.includes(badgeText)));
 check(()=>assert.equal($('.application-notice').textContent,'⚠️실제 신청은 한성대학교 홈페이지에서 진행해야 합니다.아래 버튼을 통해 사이트로 이동해주세요.'));
 check(()=>assert(!/샘플|시연|가상|프로토타입|휴학생·학점|실제 원문은 존재/.test($('#modal').textContent)));
 click('[data-action="close"]');
}
click('[data-action="detail"][data-id="p05"]');
runtimeNow='2026-10-11T15:00:00Z';window.dispatch('focus');
check(()=>assert($('#modal').open&&$('#modal').querySelector('.status-badge').textContent==='모집 마감','Returning after midnight refreshes the open detail'));
check(()=>assert(!$('[data-item="p05"]'),'Expired programs are removed from open recommendations'));
click('[data-action="close"]');homeSelect('notice');
check(()=>assert.equal($('[data-item="n01"]').querySelector('.status-badge').textContent,'D-4'));
click('[data-action="about"]');check(()=>assert(!/샘플|시연|가상|프로토타입/.test($('#modal').textContent)));click('[data-action="close"]');
runtimeNow='2026-10-14T15:00:00Z';document.dispatch('visibilitychange');navigate('notices');
check(()=>assert.equal($('[data-item="n14"]').querySelector('.status-badge').textContent,'모집 중','An upcoming opportunity becomes open on its start date'));
check(()=>assert(!/샘플|시연|가상|프로토타입/.test(document.textContent)));
// Scheduled midnight refresh also works without a focus or navigation event.
runtimeNow='2026-10-15T14:59:59Z';storage.clear();setup(true);await import('../dist/app.js?midnight-date');
const midnightTicks=[...timerCallbacks.values()];
runtimeNow='2026-10-15T15:00:00Z';midnightTicks.forEach(tick=>tick());
check(()=>assert($('[data-item="n01"]').querySelector('.status-badge').textContent.includes('오늘 마감')));
runtimeNow='2026-10-09T03:00:00Z';

// Corrupt storage recovers without crashing.
storage.set('hsupick-v1','{bad');setup();await import('../dist/app.js?corrupt');
check(()=>assert(text().includes('내 정보 입력하기')));
// Storage denied remains interactive and reports ephemeral persistence.
globalThis.localStorage.setItem=()=>{throw Error('storage denied');};
homeSelect('program');click('[data-action="save"][data-id="p02"]');navigate('saved');
check(()=>assert($('#toast').textContent.includes('이번 방문 동안만')));
check(()=>assert.equal($('#main').querySelector('.info-row'),null));
// Mobile history, progressive profile entry, account controls and remote notice media.
storage.clear();setup(true);await import('../dist/app.js?mobile-revision');
check(()=>assert($('.mobile-nav').textContent.includes('MY PAGE')));
navigate('notices');click('[data-category="scholarship"]');window.scrollY=312;
const beforeDetail=mainIds();click('[data-action="detail"][data-id="n01"]');
check(()=>assert.deepEqual($('#modal').querySelector('.modal-footer').querySelectorAll('button').map(b=>b.textContent.trim()),['MY PICK','뒤로가기']));
check(()=>assert(!$('#modal').querySelector('[data-action="toggle-detail-compare"]')));
history.back();
check(()=>assert(!$('#modal').open&&$('[data-category="scholarship"]').attrs['aria-pressed']==='true'));
check(()=>assert.deepEqual(mainIds(),beforeDetail));
check(()=>assert.equal(window.scrollY,312));
history.forward();check(()=>assert($('#modal').open&&$('#modal-title').textContent.includes('장학금')));
click('[data-action="detail-back"]');check(()=>assert(!$('#modal').open));
// App Back and browser Back both recover the previous logical overlay.
navigate('recommend');click('[data-action="quick-open"]');click('[data-action="detail"][data-id="n01"]');
click('[data-action="detail-back"]');check(()=>assert($('#modal-title').textContent.includes('모집 중인 기회')));
history.back();check(()=>assert(!$('#modal').open));
navigate('profile');click('[data-action="profile"]');
check(()=>assert($('#profile-track-fields').hidden&&$('#profile-form').querySelector('[type="submit"]').disabled));
check(()=>assert(!$('#modal').querySelector('.privacy-note')||$('#modal').querySelector('.privacy-note').classList.contains('mobile-hidden-note')));
$('#profile-name').value='이지원';selectGrade(2);$('#profile-form').dispatch('change',$('[name="grade"][value="2"]'));
check(()=>assert(!$('#profile-track-fields').hidden&&$('#profile-form').querySelector('[type="submit"]').disabled));
click('#track-picker-1');check(()=>assert.equal(all('.track-filter-button').length,1));
filterTrack('college','social');check(()=>assert.equal(all('.track-filter-button').length,2));
check(()=>assert.equal(all('.track-option').length,0));
filterTrack('group','social-0');check(()=>assert(all('.track-option').length>0));
pick('기업경영트랙');
check(()=>assert.equal($('#profile-name').value,'이지원'));
check(()=>assert($('#profile-form').querySelector('[type="submit"]').disabled));
click('#track-picker-2');searchTrack('글로벌비즈니스');pick('글로벌비즈니스트랙');
check(()=>assert(!$('#profile-form').querySelector('[type="submit"]').disabled));
submit('#profile-form');interest('study');history.back();
check(()=>assert($('#profile-form')&&$('#track1').value==='기업경영트랙'&&$('#profile-name').value==='이지원'));
submit('#profile-form');check(()=>assert($('[name="interest"][value="study"]').checked));submit('#interest-form');
check(()=>assert.equal(JSON.parse(storage.get('hsupick-v1')).profile.name,'이지원'));
check(()=>assert.equal($('.avatar').textContent,'지원'));
click('.avatar');check(()=>assert(!$('#mini-my-menu').hidden&&$('#mini-my-menu').textContent.includes('정보 수정')));
document.dispatch('click',$('#main'));check(()=>assert($('#mini-my-menu').hidden));
navigate('profile');check(()=>assert(text().includes('로그인 관리')&&text().includes('추천정보 다시 설정')&&text().includes('회원 탈퇴')));
click('[data-action="account-password"]');
$('#account-password-form').querySelector('[name="currentPassword"]').value='Oldpass1!';
$('#account-password-form').querySelector('[name="newPassword"]').value='Newpass1!';
$('#account-password-form').querySelector('[name="confirmPassword"]').value='Newpass1!';
submit('#account-password-form');check(()=>assert($('#account-feedback').textContent.includes('변경할 수 없어요')));
check(()=>assert.equal($('#account-password-form').querySelector('[name="newPassword"]').value,''));
history.back();check(()=>assert.equal($('.login-settings-card').querySelectorAll('.account-row').length,2));click('[data-action="account-social"]');
check(()=>assert($('#modal').textContent.includes('계정 서버가 연결되지 않아')));check(()=>assert.deepEqual(all('.social-connection').map(b=>b.dataset.id),['kakao','google']));click('[data-action="connect-social"][data-id="kakao"]');check(()=>assert($('#social-connect-feedback').textContent.includes('카카오')));click('[data-action="connect-social"][data-id="google"]');check(()=>assert($('#social-connect-feedback').textContent.includes('구글')));history.back();
click('[data-action="account-delete"]');check(()=>assert($('#modal').textContent.includes('탈퇴를 진행할 수 없어요')));history.back();
const imageItem=(await import('../dist/data.js?v=1.16.73')).ITEMS.find(i=>i.id==='n01');imageItem.images=[{url:'https://example.com/notice.png',alt:'공지 포스터'}];
navigate('notices');click('[data-action="detail"][data-id="n01"]');
check(()=>assert.equal($('.notice-images').querySelector('img').attrs.src,'https://example.com/notice.png'));
click('[data-action="image-open"]');check(()=>assert($('.image-viewer')&&$('.image-viewer').querySelector('img').attrs.alt==='공지 포스터'));
history.back();check(()=>assert($('.notice-images')&&$('#modal-title').textContent===imageItem.title));
const poster=$('.notice-images').querySelector('img');document.dispatch('error',poster);
check(()=>assert(poster.hidden&&!$('.image-fallback').hidden&&$('.notice-image-button').disabled));
history.back();delete imageItem.images;
// Resetting recommendations leaves saved bookmarks intact.
click('[data-action="save"][data-id="n01"]');navigate('profile');const savedBefore=JSON.parse(storage.get('hsupick-v1')).saved;
click('[data-action="reset-confirm"]');check(()=>assert(!$('#modal').textContent.includes('브라우저')));
click('[data-action="restart-profile"]');check(()=>assert($('#profile-form')&&$('#profile-track-fields').hidden));
check(()=>assert.deepEqual(JSON.parse(storage.get('hsupick-v1')).saved,savedBefore));
// Backend preflight regressions: real failures found in the audit.
runtimeNow='2026-10-09T03:00:00Z';
for(const mobile of [false,true]){
 storage.clear();setup(mobile);await import(`../dist/app.js?preflight-parity-${mobile}`);
 if(mobile)click('[data-action="toggle-search"]');
 check(()=>assert($('#search-input')&&$('#sort-filter')&&$('#open-filter'),'Search/sort/recruitment are available on both layouts'));
 navigate('profile');
 for(const action of ['account-social','account-password','account-delete','reset-confirm'])check(()=>assert($(`[data-action="${action}"]`),`${action} exists on both layouts`));
 click('[data-action="profile"]');check(()=>assert($('#profile-name'),'Both layouts collect a name'));
 selectGrade(3);$('#profile-form').dispatch('change',$('[name="grade"][value="3"]'));
 $('#track1').value='기업경영트랙';$('#track2').value='글로벌비즈니스트랙';$('#track3').value='웹공학트랙';
 submit('#profile-form');interest('study');submit('#interest-form');
 check(()=>assert.deepEqual(JSON.parse(storage.get('hsupick-v1')).profile.tracks,['기업경영트랙','글로벌비즈니스트랙','웹공학트랙'],'Saving keeps the required track positions'));
 navigate('profile');click('[data-action="profile"]');
 check(()=>assert.deepEqual([1,2,3].map(n=>$('#track'+n).value),['기업경영트랙','글로벌비즈니스트랙','웹공학트랙']));
 click('[data-action="close"]');navigate('notices');
 click('[data-action="detail"][data-id="n01"]');
 const content=$('#modal').querySelector('.modal-content');content.scrollTop=240;$('#modal').scrollTop=90;
 click($('#modal').querySelector('[data-action="save"]'));
 check(()=>assert.equal($('#modal').querySelector('.modal-content').scrollTop,240,'Saving retains the detail reading position'));
 check(()=>assert.equal($('#modal').scrollTop,90));
 check(()=>assert($('#modal').querySelector('[data-action="detail-back"]'),'Both layouts offer Back from detail'));
 click('[data-action="detail-back"]');
 navigate('notices');
 for(const id of ['n01','n03']){const input=$(`[data-compare="${id}"]`);input.checked=true;document.dispatch('change',input);}
 click('[data-action="compare"]');click('[data-action="complete-compare"]');
 check(()=>assert(!$('#modal').open&&!$('#compare-tray').textContent,'Comparison completion closes and empties the tray on both layouts'));
 check(()=>assert(all('[data-compare]').every(e=>!e.checked)));
}
storage.clear();setup(true);await import('../dist/app.js?preflight-scroll');
navigate('notices');window.scrollY=350;
click($('.mobile-nav').querySelectorAll('a').find(a=>a.getAttribute('href')==='#programs'));
check(()=>assert.equal(window.scrollY,0));history.back();check(()=>assert.equal(window.scrollY,350));history.forward();check(()=>assert.equal(window.scrollY,0,'Forward restores the destination, not the previous page scroll'));
storage.clear();setup(true);runtimeNow='2026-10-15T03:00:00Z';await import('../dist/app.js?preflight-reason');
check(()=>assert(!$('[data-item="n14"]').querySelector('.recommend-reason').textContent.includes('마감이 가까운'),'A notice 15 days away is not called urgent'));
// Real API strings must render literally rather than creating elements.
const apiFixture=(await import('../dist/data.js?v=1.16.73')).ITEMS.find(i=>i.id==='n01');
const originalFixture=structuredClone(apiFixture);
apiFixture.title='<img src=x onerror=alert(1)>';apiFixture.subtitle='<script>bad()</script>';apiFixture.department='<img src=x>';apiFixture.benefit='<svg onload=alert(1)>';apiFixture.preparations=['<iframe src=x>'];
navigate('notices');
check(()=>assert.equal($('[data-item="n01"]').querySelector('.title-button').textContent,apiFixture.title));
check(()=>assert.equal($('[data-item="n01"]').querySelectorAll('img').length,0));
click('[data-action="detail"][data-id="n01"]');
check(()=>assert.equal($('#modal-title').textContent,apiFixture.title));
check(()=>assert.equal($('#modal').querySelectorAll('img').length,0));
check(()=>assert.equal($('#modal').querySelectorAll('script').length,0));
check(()=>assert.equal($('#modal').querySelectorAll('iframe').length,0));
Object.assign(apiFixture,originalFixture);
// Image display and responsive reflow also work on PC.
apiFixture.images=[{url:'https://example.com/notice.png',alt:'공지 포스터'}];
storage.clear();setup();await import('../dist/app.js?preflight-desktop-image');navigate('notices');click('[data-action="detail"][data-id="n01"]');
check(()=>assert($('.notice-images')&&$('.notice-images').querySelector('img')));
$('.modal-content').scrollTop=180;click('[data-action="image-open"]');check(()=>assert($('.image-viewer')));click('[data-action="detail-back"]');check(()=>assert($('.notice-images')&&!$('.image-viewer')));check(()=>assert.equal($('.modal-content').scrollTop,180));
navigate('profile');click('[data-action="profile"]');$('#profile-name').value='이지원';selectGrade(2);$('#track1').value='기업경영트랙';
setMobileViewport(true);check(()=>assert.equal($('#profile-name').value,'이지원','Resizing retains an unfinished form'));check(()=>assert.equal($('#track1').value,'기업경영트랙'));
setMobileViewport(false);check(()=>assert.equal($('#profile-name').value,'이지원'));
delete apiFixture.images;
// Deep links cannot put a dialog over the first-entry login screen.
storage.clear();setup(true);window.dispatchEvent=event=>window.dispatch(event.type);location.hash='#source/n01';
await import('../dist/app.js?preflight-login-overlay');await import('../dist/login.js?preflight-login-overlay');
check(()=>assert(!$('#login-screen').hidden&&!$('#modal').open&&$('#modal').inert));
click('[data-login-action="signup"]');click('[data-login-action="back"]');
check(()=>assert.equal(location.hash,'#login'));history.back();check(()=>assert.notEqual(location.hash,'#signup','Returning from signup does not create a new login history entry'));
click('[data-login-action="guest"]');check(()=>assert.equal(location.hash,'#source/n01'));check(()=>assert($('#modal').open&&!$('#modal').inert,'Browsing resumes the original deep link'));
// Changing to first year removes optional values on mobile and PC, including old saved data.
for(const mobile of [false,true]){
 storage.set('hsupick-v1',JSON.stringify({profile:{name:'이지원',grade:3,tracks:['기업경영트랙','글로벌비즈니스트랙','웹공학트랙'],interests:['study']},saved:['n01']}));
 setup(mobile);await import(`../dist/app.js?first-year-single-${mobile}`);navigate('profile');click('[data-action="profile"]');
 check(()=>assert($('#track-picker-2')&&$('#track-picker-3')));
 selectGrade(1);$('#profile-form').dispatch('change',$('[name="grade"][value="1"]'));
 check(()=>assert(!$('#track2')&&!$('#track3')&&!$('#track-picker-2')&&!$('#track-picker-3')));
 $('#track1').value='IT공과대학';submit('#profile-form');submit('#interest-form');
 check(()=>assert.deepEqual(JSON.parse(storage.get('hsupick-v1')).profile.tracks,['IT공과대학']));
 check(()=>assert.deepEqual(JSON.parse(storage.get('hsupick-v1')).saved,['n01']));
 storage.set('hsupick-v1',JSON.stringify({profile:{name:'이지원',grade:1,tracks:['IT공과대학','컴퓨터공학부','웹공학트랙'],interests:['study']},saved:[]}));
 setup(mobile);await import(`../dist/app.js?first-year-legacy-${mobile}`);navigate('profile');
 check(()=>assert(!text().includes('웹공학트랙')&&!text().includes('컴퓨터공학부')));
 click('[data-action="profile"]');check(()=>assert(!$('#track-picker-2')&&!$('#track-picker-3')));
 selectGrade(2);$('#profile-form').dispatch('change',$('[name="grade"][value="2"]'));
 check(()=>assert($('#track-picker-2')&&$('#track-picker-3')));
 check(()=>assert.equal($('#track2').value,''));check(()=>assert.equal($('#track3').value,''));
}
// Student journey fixes: saved visibility, honest personalization and meaningful recruitment filtering.
runtimeNow='2026-10-15T17:00:00Z';
for(const mobile of [false,true]){
 storage.set('hsupick-v1',JSON.stringify({profile:{name:'이지원',grade:4,tracks:['기업경영트랙'],interests:['career']},saved:['p15']}));
 setup(mobile);await import(`../dist/app.js?student-saved-${mobile}`);navigate('saved');
 check(()=>assert($('#open-filter').checked&&mainIds().length===0));
 check(()=>assert($('.saved-availability').textContent.includes('1개')&&text().includes('저장한 PICK이 있어요')));
 click('[data-action="show-unavailable"]');check(()=>assert(!$('#open-filter').checked));check(()=>assert.deepEqual(mainIds(),['p15']));
 click('[data-category="recommended"]');$('#open-filter').checked=false;change('#open-filter');check(()=>assert.deepEqual(mainIds(),['p15'],'Eligible expired saved picks remain accessible in recommendations'));
 navigate('profile');click('[data-action="profile"]');$('#profile-name').value='수정중';
 click('[data-action="close"]');check(()=>assert.equal($('#modal-title').textContent,'수정 내용을 취소할까요?'));
 click('[data-action="keep-profile"]');check(()=>assert.equal($('#profile-name').value,'수정중'));
 click('[data-action="close"]');click('[data-action="close"]');check(()=>assert.equal($('#profile-name').value,'수정중','Closing confirmation continues editing'));
 history.back();check(()=>assert.equal($('#modal-title').textContent,'수정 내용을 취소할까요?','Browser Back also asks before discarding changes'));
 click('[data-action="discard-profile"]');check(()=>assert(!$('#modal').open));check(()=>assert.equal(JSON.parse(storage.get('hsupick-v1')).profile.name,'이지원'));
 history.forward();check(()=>assert(!$('#modal').open,'Forward cannot revive an explicitly discarded draft'));history.back();
 click('[data-action="profile"]');$('#profile-name').value='이지원수정';$('#track2').value='글로벌비즈니스트랙';submit('#profile-form');submit('#interest-form');
 check(()=>assert.equal(location.hash,'#profile','Existing profile edits return to their origin'));
 check(()=>assert(text().includes('이지원수정')));
 click('[data-action="profile"]');$('#profile-name').value='버릴초안';
 click($('.desktop-nav').querySelectorAll('a').find(a=>a.getAttribute('href')==='#notices'));
 check(()=>assert.equal($('#modal-title').textContent,'수정 내용을 취소할까요?'));
 click('[data-action="keep-profile"]');check(()=>assert.equal(location.hash,'#profile'));
 click($('.desktop-nav').querySelectorAll('a').find(a=>a.getAttribute('href')==='#notices'));click('[data-action="discard-profile"]');
 check(()=>assert.equal(location.hash,'#notices'));
}
storage.clear();setup(true);await import('../dist/app.js?student-honest-label');check(()=>assert.equal($('.quick-stats').querySelector('.stat-label').textContent,'모집중인 기회'));
// Program details use only available public-list metadata, without invented long content.
const publicProgram=(await import('../dist/data.js?v=1.16.73')).ITEMS.find(i=>i.id==='p06');
publicProgram.publicInfo={summary:'공개 목록의 짧은 프로그램 소개',points:20,department:'학습지원팀'};
publicProgram.originalUrl='https://hsportal.hansung.ac.kr/program/detail?id=123';
for(const mobile of [false,true]){
 storage.clear();setup(mobile);await import(`../dist/app.js?public-program-${mobile}`);navigate('programs');click('[data-action="detail"][data-id="p06"]');
 check(()=>assert.equal($('.program-overview').querySelector('p').textContent,'공개 목록의 짧은 프로그램 소개'));
 check(()=>assert($('.program-facts').textContent.includes('20pt')));
 check(()=>assert($('.program-facts').textContent.includes('원문 확인')));
 check(()=>assert(!$('#modal').textContent.includes('스프레드시트 사용 가능 환경')&&!$('#modal').textContent.includes('활동 / 결과 안내')));
 check(()=>assert(!$('#modal').textContent.includes('참여 후 경험을 돌아보고')));
 check(()=>assert(!$('#modal').querySelector('.raw-document')&&!$('#modal').querySelector('[data-action="source"]')));
 check(()=>assert.equal($('.official-shortcut').getAttribute('href'),'https://hsportal.hansung.ac.kr/program/detail?id=123'));
}
publicProgram.publicInfo={};publicProgram.originalUrl='javascript:alert(1)';
click('[data-action="close"]');click('[data-action="detail"][data-id="p06"]');
check(()=>assert(!$('.program-overview'),'No summary is invented if the public list provides none'));
check(()=>assert.equal($('.official-shortcut').getAttribute('href'),'https://hsportal.hansung.ac.kr/'));
delete publicProgram.publicInfo;delete publicProgram.originalUrl;
// Explicitly unknown public metadata cannot leak richer fixture assumptions.
publicProgram.publicInfo=null;click('[data-action="close"]');click('[data-action="detail"][data-id="p06"]');
check(()=>assert(!$('.program-overview')&&$('.program-facts').textContent.includes('원문 확인')));
check(()=>assert(!$('.program-facts').textContent.includes('학습지원팀')));
delete publicProgram.publicInfo;
// 2/3/4/other grades require 1- and 2-track; only 3-track is optional.
for(const mobile of [false,true])for(const grade of [2,3,4,'other']){
 storage.clear();setup(mobile);await import(`../dist/app.js?two-required-${mobile}-${grade}`);navigate('profile');click('[data-action="profile"]');
 selectGrade(grade);$('#profile-form').dispatch('change',$(`[name="grade"][value="${grade}"]`));
 $('#track1').value='기업경영트랙';$('#track2').value='';$('#track3').value='';
 $('#profile-form').dispatch('submit');
 check(()=>assert($('#profile-form')&&$('#form-error').textContent.includes('2트랙')));
 check(()=>assert.equal(document.activeElement,$('#track-picker-2')));
 check(()=>assert(all('.track-field')[1].querySelector('label').textContent.includes('필수')&&all('.track-field')[2].querySelector('label').textContent.includes('선택')));
 $('#track2').value='글로벌비즈니스트랙';submit('#profile-form');check(()=>assert($('#interest-form')));
 interest('study');submit('#interest-form');
 check(()=>assert.deepEqual(JSON.parse(storage.get('hsupick-v1')).profile.tracks,['기업경영트랙','글로벌비즈니스트랙'],'3-track can remain empty'));
}
navigate('notices');click('[data-action="detail"][data-id="n01"]');
check(()=>assert.equal($('#modal').querySelector('.modal-footer').querySelector('[data-action="save"]').textContent.trim(),'MY PICK'));
click($('#modal').querySelector('.modal-footer').querySelector('[data-action="save"]'));
check(()=>assert.equal($('#modal').querySelector('.modal-footer').querySelector('[data-action="save"]').textContent.trim(),'MY PICK'));
const replayGuide=()=>{click('[data-action="about"]');click('[data-action="onboarding-open"]');};
// Optional first-use guide: app entry only, previous/skip/replay, history and setup handoff.
for(const mobile of [true,false]){
 storage.clear();setup(mobile,{firstVisit:true});await import(`../dist/app.js?guide-${mobile}`);
 check(()=>assert(!$('#modal').open,'Guide must not open over the login screen'));
 window.dispatch('hsu-app-enter');
 check(()=>assert($('#modal').open&&$('#modal').classList.contains('onboarding-dialog')));
 check(()=>assert.equal(document.activeElement,$('#modal-title')));
 click('[data-action="onboarding-next"]');check(()=>assert($('#modal-title').textContent.includes('PICK!')));
 click('[data-action="onboarding-previous"]');check(()=>assert($('#modal-title').textContent.includes('나를 알려주면')));
 click('[data-action="onboarding-next"]');click('[data-action="onboarding-next"]');
 check(()=>assert($('#modal-title').textContent.includes('MY PICK')));
 click('[data-action="onboarding-next"]');check(()=>assert($('#modal-title').textContent.includes('AI 비교하기')));
 click('[data-action="onboarding-finish"]');
 check(()=>assert($('#profile-form')&&!$('#modal').classList.contains('onboarding-dialog')));
 check(()=>assert.equal($('#modal-title').textContent,'나에 대해 알려주세요!'));
 check(()=>assert($('#modal').textContent.includes('학년·트랙·관심 분야로 나에게 맞는 추천을 시작해요.')));
 $('#profile-name').value='이지원';selectGrade(1);$('#track1').value='크리에이티브인문학부';submit('#profile-form');
 check(()=>assert.equal($('#modal-title').textContent,'지원님의 관심 분야를 알려주세요.'));
 check(()=>assert(!$('.form-summary')));
 check(()=>assert.equal($('#interest-form').querySelector('[type="submit"]').textContent.trim(),'PICK 보기'));
 interest('study');submit('#interest-form');
 window.dispatch('hsu-app-enter');check(()=>assert(!$('#modal').open,'Completed tour is not repeated'));
 navigate('profile');check(()=>assert.equal(all('.management-menu-row').length,4));
 check(()=>assert.equal($('.login-settings-card').querySelectorAll('.management-menu-description').length,0));
 check(()=>assert($('.profile-edit-actions').querySelector('[data-action="profile"]')));
 replayGuide();click('[data-action="onboarding-skip"]');
 check(()=>assert(!$('#modal').open));window.dispatch('hsu-app-enter');check(()=>assert(!$('#modal').open));
 replayGuide();history.back();check(()=>assert($('#modal-title').textContent.includes('이용 안내')));click('[data-action="close"]');
 replayGuide();click('[data-action="onboarding-next"]');click('[data-action="onboarding-next"]');
 click('[data-action="onboarding-next"]');check(()=>assert.equal($('[data-action="onboarding-finish"]').textContent,'PICK 둘러보기'));
 click('[data-action="onboarding-finish"]');check(()=>assert(!$('#modal').open&&location.hash==='#profile'));
}
// Account state comes from the verified-session adapter, never the recommendation name.
const account=await import('../dist/account-session.js?v=1.16.73');
check(()=>assert($('#mini-my-menu').querySelector('.is-login')));
account.setAccountSession({user:{id:'verified-ui-user',name:'이지원'},logout:async()=>{}});
check(()=>assert($('#mini-my-menu').querySelector('.is-logout')));
check(()=>assert.equal($('.avatar').textContent,'지원'));
account.setAccountSession(null);
check(()=>assert($('#mini-my-menu').querySelector('.is-login')&&!$('#mini-my-menu').querySelector('.is-logout')));
// First visit: welcome before login, four steps, every exit returns to the login gate.
for(const mobile of [true,false])for(const exit of ['finish','skip','escape','back']){
 storage.clear();setup(mobile,{firstVisit:true});window.dispatchEvent=event=>window.dispatch(event.type);
 await import(`../dist/app.js?welcome-${mobile}-${exit}`);
 await import(`../dist/login.js?welcome-${mobile}-${exit}`);
 check(()=>assert($('#login-screen').hidden&&$('#modal').open&&$('#modal').classList.contains('welcome-dialog')));
 check(()=>assert($('.workspace').inert&&$('.mobile-nav').inert&&!$('#modal').inert));
 check(()=>assert.equal($('#modal').querySelector('.onboarding-step').textContent,'1 / 4'));
 if(exit==='finish'){
  for(let i=0;i<3;i++)click('[data-action="onboarding-next"]');
  check(()=>assert($('#modal-title').textContent.includes('AI 비교하기')&&$('#modal').textContent.includes('2~3개')));
  check(()=>assert.equal($('[data-action="onboarding-finish"]').textContent,'시작하기'));
  click('[data-action="onboarding-finish"]');
 }else if(exit==='skip')click('[data-action="onboarding-skip"]');
 else if(exit==='escape')$('#modal').dispatch('cancel');
 else history.back();
 check(()=>assert(!$('#modal').open&&!$('#login-screen').hidden&&location.hash==='#login'));
 check(()=>assert($('.workspace').inert&&$('.mobile-nav').inert));
 check(()=>assert.equal(storage.get('hsupick-onboarding-v2'),'1'));
 click('[data-login-action="guest"]');check(()=>assert($('#login-screen').hidden&&!$('#modal').open,'Guide does not repeat after browsing starts'));
 click('[data-action="about"]');
 check(()=>assert.equal($('#modal').querySelectorAll('.usage-steps').length,1));
 check(()=>assert.equal($('#modal').querySelectorAll('.usage-icon').length,4));
 check(()=>assert(!$('#modal').textContent.includes('브라우저')&&$('#modal').textContent.includes('학교 사이트')));
 check(()=>assert(!$('.footer').querySelector('[data-login-action="open"]')));
}
// Once the welcome is seen, returning visitors see login directly.
setup(true);window.dispatchEvent=event=>window.dispatch(event.type);
await import('../dist/app.js?welcome-returning');await import('../dist/login.js?welcome-returning');
check(()=>assert(!$('#login-screen').hidden&&!$('#modal').open));
// Audit: date refresh must keep the reader's position.
storage.clear();setup(true);runtimeNow='2026-10-16T14:59:00Z';
await import('../dist/app.js?audit-midnight');navigate('notices');click('[data-action="detail"][data-id="n01"]');
$('#modal').scrollTop=133;$('#modal').querySelector('.modal-content').scrollTop=77;
runtimeNow='2026-10-16T15:01:00Z';window.dispatch('focus');
check(()=>assert.equal($('#modal').scrollTop,133,'Midnight refresh must preserve dialog reading position'));
check(()=>assert.equal($('#modal').querySelector('.modal-content').scrollTop,77));
click('[data-action="close"]');click('[data-action="mini-my"]');
document.dispatch('keydown',document.activeElement,{key:'Escape'});
check(()=>assert($('#mini-my-menu').hidden&&document.activeElement===$('.avatar'),'Escape closes the account menu and restores focus'));
// Another tab's completed write must become visible without a reload.
const otherTabState={profile:{name:'다른탭수정',grade:4,tracks:['기업경영트랙','글로벌비즈니스트랙'],interests:['career']},saved:['n01']};
const otherValue=JSON.stringify(otherTabState);storage.set('hsupick-v1',otherValue);
window.dispatch('storage',window,{key:'hsupick-v1',newValue:otherValue});navigate('profile');
check(()=>assert(text().includes('다른탭수정')));
// Online/offline are advisory: keep local controls usable and preserve typed data.
const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
for(const mobile of [true,false]){
 Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
 storage.clear();storage.set('hsupick-v1',JSON.stringify({profile:{name:'이지원',grade:4,tracks:['기업경영트랙','글로벌비즈니스트랙'],interests:['career']},saved:[]}));
 setup(mobile);window.dispatchEvent=event=>window.dispatch(event.type);
 await import(`../dist/app.js?audit-network-${mobile}`);await import(`../dist/login.js?audit-network-${mobile}`);
 check(()=>assert($('#connection-status').hidden&&!$('#login-screen').hidden));
 $('#login-id').value='typed-user';$('#login-password').value='NotStored1!';navigator.onLine=false;window.dispatch('offline');
 check(()=>assert(!$('#connection-status').hidden&&$('#connection-status').textContent.includes('오프라인')));
 navigator.onLine=true;window.dispatch('online');
 check(()=>assert($('#connection-status').hidden&&$('#login-password').value==='NotStored1!'&&$('#login-id').value==='typed-user'));
 click('[data-login-action="guest"]');navigate('profile');
 check(()=>assert.equal(all('.track-profile-tag').length,2));
 check(()=>assert($('#mini-my-menu').querySelector('.is-login').querySelector('.icon')));
 click('[data-action="account-password"]');const currentPassword=$('[name="currentPassword"]');currentPassword.value='typing-password';
 const synced={profile:{name:'새이름',grade:4,tracks:['기업경영트랙','글로벌비즈니스트랙'],interests:['career']},saved:['p07']};
 storage.set('hsupick-v1',JSON.stringify(synced));window.dispatch('storage',window,{key:'hsupick-v1',newValue:JSON.stringify(synced)});
 check(()=>assert.equal($('[name="currentPassword"]').value,'typing-password','Other-tab changes must not erase a password being typed'));
 click('[data-action="close"]');navigate('notices');navigator.onLine=false;window.dispatch('offline');
 click('[data-action="detail"][data-id="n03"]');
 check(()=>assert(!$('#modal').querySelector('.connection-notice').hidden&&$('#connection-status').hidden));
 const sourceLink=$('#modal').querySelector('.official-shortcut');check(()=>assert(sourceLink&&!sourceLink.disabled&&sourceLink.getAttribute('href').startsWith('https:')));
 click($('#modal').querySelector('[data-action="save"]'));
 check(()=>assert(JSON.parse(storage.get('hsupick-v1')).saved.includes('n03'),'Loaded app can still save locally offline'));
 navigator.onLine=true;window.dispatch('online');check(()=>assert($('#modal').querySelector('.connection-notice').hidden));
 click('[data-action="close"]');navigate('profile');click('[data-action="account-delete"]');
 check(()=>assert(!$('#modal').textContent.includes('탈퇴 시 삭제되는 정보를 확인')));
 click('[data-action="close"]');click('[data-action="reset-confirm"]');
 check(()=>assert($('#modal').querySelector('.management-explanation').querySelector('li').textContent.includes('학년·트랙·관심 분야')));
}
if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;
// API date fields must remain literal text in cards, attributes and details.
const dateFixture=(await import('../dist/data.js?v=1.16.73')).ITEMS.find(i=>i.id==='n01');
const originalDates={start:dateFixture.start,deadline:dateFixture.deadline};
dateFixture.start='2026-10-01<img src=x onerror=alert(1)>';
dateFixture.deadline='2026-10-31"><img src=x onerror=alert(1)>';
storage.clear();setup(true);await import('../dist/app.js?audit-date-escaping');navigate('notices');
check(()=>assert.equal($('[data-item="n01"]').querySelectorAll('img').length,0));
click('[data-action="detail"][data-id="n01"]');check(()=>assert.equal($('#modal').querySelectorAll('img').length,0));
check(()=>assert($('#modal').textContent.includes('<img src=x onerror=alert(1)>')));
Object.assign(dateFixture,originalDates);
check(()=>assert.equal(all('.nav-count').length,0));
// Backend-shaped snapshots: numeric/UUID IDs, missing optional fields, empty lists and removals.
const contract=await import('../dist/content-contract.js?v=1.16.75');
const completeContent=structuredClone((await import('../dist/data.js?v=1.16.73')).ITEMS);
for(const mobile of [true,false]){
 storage.clear();setup(mobile);window.dispatchEvent=event=>window.dispatch(event.type);
 await import(`../dist/app.js?backend-snapshot-${mobile}`);
 const uuid={...completeContent.find(i=>i.id==='n03'),id:'notice-uuid-123',publishedAt:'2026-09-01',images:[{url:'https://example.com/poster.png',alt:'포스터'}]};
 const numeric={...uuid,id:89,publishedAt:'2026-10-15',images:[]};
 check(()=>assert(contract.replaceContentRecords([uuid,numeric]).ok));navigate('notices');
 check(()=>assert.deepEqual(new Set(mainIds()),new Set(['notice-uuid-123','89'])));
 change('#sort-filter','latest');check(()=>assert.equal(mainIds()[0],'89','Latest sorts by publication, not application start'));
 click('[data-action="detail"][data-id="89"]');check(()=>assert.equal($('#modal-title').textContent,numeric.title));click('[data-action="close"]');
 click('[data-action="detail"][data-id="notice-uuid-123"]');click('[data-action="image-open"]');
 check(()=>assert($('.image-viewer')));click('[data-action="detail-back"]');history.forward();
 check(()=>assert($('.image-viewer'),'Hyphenated server IDs must restore the image viewer with Forward'));
 click('[data-action="close"]');change('[data-compare="89"]');change('[data-compare="notice-uuid-123"]');click('[data-action="compare"]');
 check(()=>assert($('#modal').open));contract.replaceContentRecords([uuid]);
 check(()=>assert(!$('#modal').open,'Removing a compared item must not leave a stale two-item comparison'));
 click('[data-action="clear-compare"]');
 const sparse={id:'program-unknown',type:'program',title:'정보가 적은 공개 프로그램',start:'2026-10-01',deadline:'2026-11-01'};
 check(()=>assert(contract.replaceContentRecords([sparse]).ok));navigate('programs');
 check(()=>assert.equal(mainCards().length,1));check(()=>assert(mainCards()[0].textContent.includes('미분류')&&mainCards()[0].textContent.includes('원문 확인')));
 click('[data-action="detail"][data-id="program-unknown"]');
 check(()=>assert($('.program-facts').textContent.includes('원문 확인')&&!$('.eligibility-match')));
 const before=mainIds();check(()=>assert(!contract.replaceContentRecords([{...sparse,deadline:null}]).ok));check(()=>assert.deepEqual(mainIds(),before));
 contract.replaceContentRecords([]);check(()=>assert(!$('#modal').open));
 for(const page of ['recommend','notices','programs','saved','profile']){navigate(page);check(()=>assert($('#main').textContent.length>0));}
}
contract.replaceContentRecords(completeContent);
// Reset must invalidate all historical profile form snapshots.
storage.set('hsupick-v1',JSON.stringify({profile:{name:'이전이름',grade:4,tracks:['기업경영트랙','글로벌비즈니스트랙'],interests:['career']},saved:['n03']}));
setup(false);await import('../dist/app.js?reset-history-privacy');navigate('profile');click('[data-action="profile"]');
navigate('notices');navigate('profile');click('[data-action="reset-local-confirm"]');click('[data-action="reset-data"]');
for(let i=0;i<5;i++){history.back();check(()=>assert(!$('#profile-form'),'Reset data must not return inside an old profile input form'));}
check(()=>assert.equal(JSON.parse(storage.get('hsupick-v1')).profile,null));
// Changing/expiring a server identity clears the previous screen and old drafts.
storage.set('hsupick-v1',JSON.stringify({profile:{name:'브라우저이름',grade:4,tracks:['기업경영트랙','글로벌비즈니스트랙'],interests:['career']},saved:['n03']}));
setup(true);window.dispatchEvent=event=>window.dispatch(event.type);await import('../dist/app.js?session-identity-boundary');navigate('profile');
account.setAccountSession({user:{id:'server-A',name:'사용자A'},logout:async()=>{}});
check(()=>assert(!text().includes('브라우저이름'),'Account entry must not show guest profile as the account profile'));
click('[data-action="profile"]');$('#profile-name').value='입력중A';
account.setAccountSession(null);
check(()=>assert(!$('#modal').open&&!text().includes('입력중A')));
history.back();history.forward();check(()=>assert(!$('#profile-form'),'Expired identity must not revive a previous account form'));
check(()=>assert($('#mini-my-menu').querySelector('.is-login')));
// Measured-category regression: a wider second row must not spill after first-row fitting.
storage.clear();setup(true);await import('../dist/app.js?category-width-boundary');navigate('recommend');
const categoryRows=all('.category-row');
check(()=>assert.deepEqual(categoryRows.map(row=>row.querySelectorAll('.chip').map(b=>b.dataset.category)),[['all','academic','activity','scholarship'],['career','intern','international','startup']]));
const filters=$('.filters');filters._clientWidth=300;
const naturalWidths=[[48,48,48,64],[64,64,64,48]];
categoryRows.forEach((row,n)=>row.querySelectorAll('.chip').forEach((button,i)=>button._rect={width:naturalWidths[n][i]}));
globalThis.getComputedStyle=()=>({columnGap:'8px'});
window.dispatch('resize');
const fitted=categoryRows.map(row=>row.querySelectorAll('.chip').map(button=>parseFloat(button.style.width)));
check(()=>assert(Math.abs(fitted[0].reduce((a,b)=>a+b,0)+24-300)<1,'The first row reaches both edges'));
check(()=>assert(fitted[1].reduce((a,b)=>a+b,0)+24<=300,'A wider second row remains inside the card'));
check(()=>assert(fitted.every((widths,n)=>widths.every((width,i)=>width>=naturalWidths[n][i])),'Text is never squeezed below its natural width'));
check(()=>assert(categoryRows.every(row=>row.style.flexWrap==='nowrap')));
filters._clientWidth=180;window.dispatch('resize');
check(()=>assert(categoryRows.every(row=>row.style.flexWrap==='wrap'),'At enlarged text/narrow widths, allow wrapping instead of clipping'));
delete globalThis.getComputedStyle;
// PC and mobile keep the same grouped surfaces and usable onboarding controls.
for(const mobile of [true,false]){
 storage.clear();setup(mobile);await import(`../dist/app.js?shared-shell-${mobile}`);
 navigate('saved');check(()=>assert($('.saved-filter-panel')?.querySelector('#results')));
 for(const page of ['notices','programs']){
  navigate(page);check(()=>assert($('.browse-filter-panel')?.querySelector('.filters')));
  check(()=>assert(!$('.browse-filter-panel').querySelector('#results')&&$('#results')));
 }
 navigate('profile');click('[data-action="profile"]');
 check(()=>assert(!$('#modal').querySelector('.privacy-note'),'The removed profile note is absent on both sizes'));
 click('[data-action="close"]');replayGuide();
 check(()=>assert($('#modal').classList.contains('onboarding-dialog')));
 check(()=>assert($('.onboarding-footer').querySelector('[data-action="onboarding-next"]')));
 click('[data-action="onboarding-next"]');
 check(()=>assert($('.onboarding-footer').querySelector('[data-action="onboarding-previous"]')));
 click('[data-action="onboarding-skip"]');
}
// Live content updates must not retain old eligibility wording, source text or images.
const finalSnapshot=structuredClone((await import('../dist/data.js?v=1.16.73')).ITEMS);
const boundaryFailures=[];
const boundaryCheck=fn=>{try{check(fn);}catch(error){boundaryFailures.push(error.message);}};
for(const mobile of [true,false]){
 storage.clear();setup(mobile);window.dispatchEvent=event=>window.dispatch(event.type);
 await import(`../dist/app.js?final-content-refresh-${mobile}`);
 const record={id:'backend-change',type:'notice',title:'갱신 전 제목',start:'2026-10-01',deadline:'2026-12-01',grades:[1,2,3,4],tracks:null,images:[{url:'https://example.com/old.png',alt:'이전 이미지'}]};
 contract.replaceContentRecords([record]);navigate('notices');
 boundaryCheck(()=>assert(mainCards()[0].querySelector('.fact-target').attrs.title.includes('트랙 조건 원문 확인'),'Unknown tracks must not be described as unrestricted'));
 navigate('source/backend-change');$('#modal').scrollTop=45;
 boundaryCheck(()=>assert.equal($('.notice-images')?.querySelector('img')?.attrs.src,'https://example.com/old.png','The notice content screen must display URL-backed images'));
 const revised={...record,title:'서버에서 바뀐 제목',tracks:[]};contract.replaceContentRecords([revised]);
 boundaryCheck(()=>assert($('.raw-document').textContent.includes('서버에서 바뀐 제목'),'An open source popup must refresh after a same-ID update'));
 boundaryCheck(()=>assert.equal($('#modal').scrollTop,45));
 click('[data-action="close"]');navigate('notices');click('[data-action="detail"][data-id="backend-change"]');click('[data-action="image-open"]');
 const newImage={...revised,images:[{url:'https://example.com/new.png',alt:'새 이미지'}]};contract.replaceContentRecords([newImage]);
 boundaryCheck(()=>assert.equal($('.image-viewer').querySelector('img').attrs.src,'https://example.com/new.png','An open image viewer must use the updated URL'));
 contract.replaceContentRecords([{...revised,images:[]}]);
 boundaryCheck(()=>assert(!$('.image-viewer')&&$('#modal-title').textContent==='서버에서 바뀐 제목','Removing the viewed image must return to its detail'));
 for(const fields of [{imageUrl:'https://example.com/db-single.png'},{imageUrls:['https://example.com/db-first.png','https://example.com/db-second.png']}]){
  const mapped={...revised,...fields};delete mapped.images;
  contract.replaceContentRecords([mapped]);
  boundaryCheck(()=>assert.equal($('.notice-images')?.querySelector('img')?.attrs.src,fields.imageUrl||fields.imageUrls[0],'Server URL fields must render in the open mobile/desktop detail'));
 }
 contract.replaceContentRecords(finalSnapshot);
}
check(()=>assert.deepEqual(boundaryFailures,[],'Live-update regressions: '+boundaryFailures.join('; ')));
// Notification center behavior on both responsive layouts.
for(const mobile of [true,false]){
 storage.clear();setup(mobile);window.dispatchEvent=event=>window.dispatch(event.type);
 storage.set('hsupick-notifications-v1:guest',JSON.stringify({settings:{deadline:true,recommendation:true},entries:[
  {id:'deadline:n01',type:'deadline',itemId:'n01',title:'저장한 PICK이 내일 마감돼요!',body:'마감 알림 본문',createdAt:'2026-10-08T00:00:00Z',read:false},
  {id:'recommendation:2026-10-08',type:'recommendation',title:'새로운 맞춤 PICK',body:'새로운 추천 2개',createdAt:'2026-10-08T00:00:00Z',read:false}
 ]}));
 await import(`../dist/app.js?notifications-${mobile}`);
 check(()=>assert.equal(all('.notification-dot').length,1));
 click('[data-action="notifications"]');
 check(()=>assert.equal(all('.notification-item').length,2));
 click('[data-action="notification-open"][data-id="deadline:n01"]');await Promise.resolve();await Promise.resolve();
 check(()=>assert($('#modal').open&&$('#modal-title').textContent===ITEMS.find(i=>i.id==='n01').title));
 check(()=>assert(JSON.parse(storage.get('hsupick-notifications-v1:guest')).entries[0].read));
 click('[data-action="close"]');
 check(()=>assert.equal(location.hash,'#notifications'));
 click('[data-action="notification-open"][data-id="recommendation:2026-10-08"]');await Promise.resolve();await Promise.resolve();
 check(()=>assert.equal(location.hash,'#recommend'));
 check(()=>assert.equal(all('.notification-dot').length,0));
 navigate('profile');
 check(()=>assert.equal(all('[data-notification-setting]').length,2));
 const deadline=$('[data-notification-setting="deadline"]');deadline.checked=false;document.dispatch('change',deadline);await Promise.resolve();await Promise.resolve();
 check(()=>assert.equal(JSON.parse(storage.get('hsupick-notifications-v1:guest')).settings.deadline,false));
 check(()=>assert(JSON.parse(storage.get('hsupick-notifications-v1:guest')).settings.recommendation));
 navigate('notice/n01');
 check(()=>assert($('#modal').open&&$('#modal-title').textContent===ITEMS.find(i=>i.id==='n01').title));
 click('[data-action="close"]');
}
console.log(`PASS: ${count} DOM flow assertions; first-use guide, recommendations, search/filter/sort, compare limits, original links, save/reload, edit, missing data, reset, and storage recovery.`);
