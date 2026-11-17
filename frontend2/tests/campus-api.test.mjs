import assert from 'node:assert/strict';
import {createAccountApi} from '../dist/account-api.js';
import {listPath,cardHtml,documentHtml,schoolLink} from '../dist/campus-content.js';
import {CampusStore} from '../dist/campus-store.js';

const calls=[];
const ok=data=>new Response(JSON.stringify({success:true,data}));
const expired=code=>new Response(JSON.stringify({success:false,error:{code,message:'로그인 확인'}}),{status:401});
let refreshes=0, nextOwner='42', lost=0;
const client=createAccountApi(async(path,options)=>{
 const bearer=options.headers.Authorization;
 calls.push([path,bearer]);
 if(path.endsWith('/login'))return ok({user:{id:'42'},accessToken:'old'});
 if(path.endsWith('/refresh')){refreshes++;return ok({accessToken:'fresh'});}
 if(path.endsWith('/users/me'))return ok({id:nextOwner});
 if(bearer==='Bearer old')return expired('ACCESS_TOKEN_EXPIRED');
 return ok({items:[]});
},{request:async(_key,run)=>run()},()=>lost++);
await client.authenticate('login',{});
await Promise.all([client.call('/home'),client.call('/programs')]);
assert.equal(refreshes,1);
assert(calls.some(([p,t])=>p.endsWith('programs')&&t==='Bearer fresh'));
await client.authenticate('login',{});
nextOwner='another-user';
await assert.rejects(client.call('/users/me/bookmarks/notice'),e=>e.code==='ACCOUNT_CHANGED');
assert.equal(lost,1);
assert.equal(client.getAccessToken(),null);
assert(!calls.some(([p,t])=>p.endsWith('/bookmarks/notice')&&t==='Bearer fresh'));

const pending=[];
const store=new CampusStore(()=>new Promise(resolve=>pending.push(resolve)));
let paints=0;
store.read('/home',()=>paints++);
store.invalidate();
store.read('/home',()=>paints++);
pending[1]({owner:'new'});pending[0]({owner:'previous'});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(paints,1);
assert.equal(store.entries.get('/home').data.owner,'new');

const path=listPath('recommend','program',{query:'취업 & 학습',category:'major',page:2});
const params=new URL(path,'https://example.test').searchParams;
assert.equal(params.get('type'),'program');
assert.equal(params.get('programCategory'),'major');
assert.equal(params.get('q'),'취업 & 학습');
assert.equal(params.get('page'),'2');
assert.match(listPath('saved','notice'),/^\/users\/me\/bookmarks\/notice\?/);
const card=cardHtml({type:'notice',id:'42',title:'<script>x</script>',recruitmentStatus:'unknown'});
assert(card.includes('일정 미확인') && card.includes('&lt;script&gt;') && !card.includes('D-0'));
assert.equal(schoolLink('javascript:alert(1)'),null);
assert.match(documentHtml({sections:[{label:'공지 내용',lines:['실제 <본문>']}]}),/실제 &lt;본문&gt;/);
console.log('PASS: shared refresh, session ownership, stale requests, list queries and public content rendering');

