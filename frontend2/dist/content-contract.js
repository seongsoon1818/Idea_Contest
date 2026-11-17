// Read-model boundary only. The API caller maps its response to this schema.
// No endpoints, credentials, requests or success simulation live in this module.
import {ITEMS,CATEGORIES,NOTICE_CATEGORIES,PROGRAM_CATEGORIES,normalizeTrack} from './data.js?v=1.16.73';
import {noticeImages} from './notice-images.js?v=1.16.76';
const text=value=>typeof value==='string'?value.trim():'';
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const publishedDate=value=>validDate(value)?value+'T00:00:00.000Z':typeof value==='string'&&validDate(value.slice(0,10))&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():'';
const stringList=value=>Array.isArray(value)?value.filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()):[];
export function normalizeContentRecords(payload){
 if(!Array.isArray(payload))return {ok:false,items:[],issues:[{index:null,field:'items',message:'목록은 배열이어야 합니다.'}]};
 const issues=[],items=[],ids=new Set();
 payload.forEach((raw,index)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){issues.push({index,field:'item',message:'게시글 객체가 필요합니다.'});return;}
  const id=typeof raw.id==='number'&&Number.isSafeInteger(raw.id)&&raw.id>=0?String(raw.id):text(raw.id);
  const invalid=[];
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)||ids.has(id))invalid.push('id');
  if(!['notice','program'].includes(raw.type))invalid.push('type');
  if(!text(raw.title))invalid.push('title');
  if(!validDate(raw.start))invalid.push('start');
  if(!validDate(raw.deadline)||raw.start>raw.deadline)invalid.push('deadline');
  if(raw.grades!=null&&(!Array.isArray(raw.grades)||raw.grades.some(g=>!['number','string'].includes(typeof g)||!['1','2','3','4'].includes(String(g)))))invalid.push('grades');
  if(raw.tracks!=null&&(!Array.isArray(raw.tracks)||raw.tracks.some(t=>typeof t!=='string'||!normalizeTrack(t))))invalid.push('tracks');
  if(invalid.length){invalid.forEach(field=>issues.push({index,field,message:'필수 값·형식 또는 중복을 확인해 주세요.'}));return;}
  ids.add(id);
  const category=CATEGORIES.some(c=>c.id===raw.category)?raw.category:null;
  const typeCategories=raw.type==='notice'?NOTICE_CATEGORIES:PROGRAM_CATEGORIES;
  const typeKey=raw.type==='notice'?'noticeCategory':'programCategory';
  const item={id,type:raw.type,title:text(raw.title),subtitle:text(raw.subtitle),category,
   noticeCategory:null,programCategory:null,[typeKey]:typeCategories.some(c=>c.id===raw[typeKey])?raw[typeKey]:'unclassified',
   grades:[...new Set((raw.grades||[]).map(Number))],tracks:[...new Set(stringList(raw.tracks).map(normalizeTrack))],
   trackEligibilityKnown:Array.isArray(raw.tracks),start:raw.start,deadline:raw.deadline,publishedAt:publishedDate(raw.publishedAt),eventAt:validDate(raw.eventAt)?raw.eventAt:'',
   benefit:text(raw.benefit),preparations:stringList(raw.preparations),department:text(raw.department),tags:stringList(raw.tags),originalUrl:text(raw.originalUrl)};
  item.images=noticeImages({...raw,title:item.title});
  if(raw.type==='program'){
   // Unknown public metadata stays unknown; do not fill it with richer seed text.
   const source=raw.publicInfo&&typeof raw.publicInfo==='object'&&!Array.isArray(raw.publicInfo)?raw.publicInfo:{};
   item.publicInfo=Object.fromEntries(['summary','audience','applicationPeriod','points','department','location','format'].flatMap(key=>typeof source[key]==='string'?[[key,source[key].trim()]]:key==='points'&&Number.isFinite(source[key])?[[key,source[key]]]:[]));
  }
  items.push(item);
 });
 return {ok:issues.length===0,items:issues.length?[]:items,issues};
}
export function replaceContentRecords(payload){
 const result=normalizeContentRecords(payload);
 if(!result.ok)return result; // Atomic: a malformed response never replaces the current list.
 ITEMS.splice(0,ITEMS.length,...result.items);
 if(typeof window!=='undefined'&&typeof window.dispatchEvent==='function')window.dispatchEvent(new Event('hsu-content-updated'));
 return result;
}
