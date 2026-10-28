// Notification policy and account-scoped frontend store. Background delivery is server-owned.
export const DEFAULT_SETTINGS={deadline:true,recommendation:true};
export const NOTIFICATION_HOUR=9;
export function seoulDay(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 return `${p.year}-${p.month}-${p.day}`;
}
const hour=now=>Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',hour:'numeric',hourCycle:'h23'}).format(now));
export function validDay(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
export function cleanNotification(n){
 if(!n||!['deadline','recommendation'].includes(n.type)||typeof n.id!=='string'||!n.id||n.id.length>250||typeof n.title!=='string'||!Number.isFinite(Date.parse(n.createdAt)))return null;
 if(n.type==='deadline'&&(typeof n.itemId!=='string'||!n.itemId||n.itemId.length>150))return null;
 return {id:n.id,type:n.type,title:n.title.slice(0,200),body:typeof n.body==='string'?n.body.slice(0,500):'',itemId:n.type==='deadline'?n.itemId:null,createdAt:n.createdAt,read:!!n.read};
}
export function initialNotificationState(){return {settings:{...DEFAULT_SETTINGS},entries:[],sent:[],seen:[],pending:[],initialized:false,lastDigest:null};}
export function normalizeState(raw){
 const s=initialNotificationState();if(!raw||typeof raw!=='object')return s;
 for(const k of Object.keys(DEFAULT_SETTINGS))if(typeof raw.settings?.[k]==='boolean')s.settings[k]=raw.settings[k];
 const strings=a=>Array.isArray(a)?[...new Set(a.filter(x=>typeof x==='string').map(x=>x.slice(0,250)))]:[];
 const ids=new Set();s.entries=(Array.isArray(raw.entries)?raw.entries:[]).map(cleanNotification).filter(n=>n&&!ids.has(n.id)&&ids.add(n.id)).slice(0,200);
 s.sent=strings(raw.sent);s.seen=strings(raw.seen);s.pending=strings(raw.pending);s.initialized=raw.initialized===true;s.lastDigest=validDay(raw.lastDigest)?raw.lastDigest:null;return s;
}
export function evaluateNotifications(raw,{items,saved,eligible,now=new Date()}){
 const s=normalizeState(raw),today=seoulDay(now),newEntries=[],all=new Map(items.map(i=>[i.id,i]));
 const tomorrow=new Date(Date.parse(today+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const open=i=>validDay(i.deadline)&&i.deadline>=today&&(!i.start||i.start<=today);
 const known=new Set(s.seen),sent=new Set(s.sent);
 if(!s.initialized&&items.length){s.seen=[...all.keys()];s.initialized=true;}
 else{for(const i of items)if(!known.has(i.id)){s.seen.push(i.id);if(s.settings.recommendation&&eligible(i))s.pending.push(i.id);}}
 s.pending=[...new Set(s.pending)].filter(id=>all.has(id)&&open(all.get(id))&&eligible(all.get(id)));
 const add=n=>{if(sent.has(n.id))return;sent.add(n.id);s.sent.push(n.id);newEntries.push(n);};
 if(hour(now)>=NOTIFICATION_HOUR){
  if(s.settings.deadline)for(const i of items)if(saved.has(i.id)&&open(i)&&i.deadline===tomorrow){
   add({id:`deadline:${i.id}`,type:'deadline',itemId:i.id,title:'저장한 PICK이 내일 마감돼요!',body:i.title,createdAt:now.toISOString(),read:false});
  }
  if(s.settings.recommendation&&s.pending.length&&s.lastDigest!==today){
   add({id:`recommendation:${today}`,type:'recommendation',itemId:null,title:'새로운 맞춤 PICK이 도착했어요!',body:`나에게 맞는 새로운 소식 ${s.pending.length}개를 확인해보세요.`,createdAt:now.toISOString(),read:false});
   s.lastDigest=today;s.pending=[];
  }
 }
 s.entries=[...newEntries.reverse(),...s.entries].slice(0,200);return {state:s,added:newEntries};
}
export function createNotificationCenter({storage,context,onChange=()=>{},onError=()=>{}}){
 let owner='guest',key='',state=initialNotificationState(),adapter=null,epoch=0;
 const persist=()=>{try{storage.setItem(key,JSON.stringify(state));}catch{onError('알림 변경사항을 저장하지 못했어요.');}onChange();};
 function setOwner(id){owner=id?String(id):'guest';key='hsupick-notifications-v1:'+encodeURIComponent(owner);epoch++;try{state=normalizeState(JSON.parse(storage.getItem(key)||'null'));}catch{state=initialNotificationState();}onChange();}
 function evaluate(now){if(adapter)return;const next=evaluateNotifications(state,{...context(),now});state=next.state;persist();}
 async function refresh(){if(!adapter)return;const version=epoch;const data=await adapter.load();if(version!==epoch)return;if(!Array.isArray(data?.notifications)||typeof data.settings?.deadline!=='boolean'||typeof data.settings?.recommendation!=='boolean')throw new TypeError('Invalid notification response');
  state=normalizeState({...state,settings:data.settings,entries:data.notifications});persist();}
 async function settings(patch){
  const next={...state.settings};for(const k of Object.keys(DEFAULT_SETTINGS))if(typeof patch[k]==='boolean')next[k]=patch[k];
  if(adapter){const version=epoch;await adapter.updateSettings(next);if(version!==epoch)return;}
  state.settings=next;if(!next.recommendation)state.pending=[];persist();
 }
 async function markRead(ids){const list=ids.filter(id=>state.entries.some(n=>n.id===id&&!n.read));if(!list.length)return;
  if(adapter){const version=epoch;await adapter.markRead(list);if(version!==epoch)return;}
  state.entries=state.entries.map(n=>list.includes(n.id)?{...n,read:true}:n);persist();
 }
 async function connect(next){if(owner==='guest')throw new Error('로그인한 계정에서 알림을 연결해 주세요.');
  if(!next||!['load','updateSettings','markRead'].every(k=>typeof next[k]==='function'))throw new TypeError('알림 서버 연결 정보가 올바르지 않아요.');
  adapter=next;epoch++;try{await refresh();}catch(e){adapter=null;throw e;}}
 function disconnect(){adapter=null;epoch++;}
 function reload(){try{state=normalizeState(JSON.parse(storage.getItem(key)||'null'));onChange();}catch{}}
 return {setOwner,evaluate,refresh,settings,markRead,connect,disconnect,reload,get key(){return key;},get adapter(){return adapter;},get state(){return structuredClone(state);}};
}
