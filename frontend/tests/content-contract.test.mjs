import assert from 'node:assert/strict';
import {ITEMS,matchProfile} from '../dist/data.js?v=1.16.73';
import {normalizeContentRecords,replaceContentRecords} from '../dist/content-contract.js';
const seed=structuredClone(ITEMS),fixture=seed.find(i=>i.id==='n03');
const normal=normalizeContentRecords([{...fixture,id:123,tracks:['기업경영트랙','글로벌비즈니스 트랙']}]);
assert(normal.ok);assert.equal(normal.items[0].id,'123');assert.deepEqual(normal.items[0].tracks,['기업경영','글로벌비즈니스']);
assert(matchProfile(normal.items[0],{grade:4,tracks:['기업경영트랙','글로벌비즈니스트랙'],interests:['intern']}).eligible);
const sparse=normalizeContentRecords([{id:'uuid-123',type:'program',title:'공개 목록 프로그램',start:'2026-10-01',deadline:'2026-11-01',grades:null,tracks:null}]);
assert(sparse.ok);assert.deepEqual(sparse.items[0].publicInfo,{});assert.deepEqual(sparse.items[0].preparations,[]);assert.equal(sparse.items[0].programCategory,'unclassified');
assert(!matchProfile(sparse.items[0],{grade:4,tracks:['기업경영트랙'],interests:['career']}).eligible);
for(const update of [null,{},[null],[{...fixture,id:'bad\"id'}],[{...fixture,deadline:null}],[{...fixture,deadline:'2026-02-30'}],[{...fixture,start:'2026-12-01'}],[{...fixture,tracks:[null]}],[{...fixture,tracks:['트랙']}],[fixture,fixture]]){
 const before=JSON.stringify(ITEMS),result=replaceContentRecords(update);assert(!result.ok);assert(result.issues.length);assert.equal(JSON.stringify(ITEMS),before,'Invalid data must leave the current list intact');
}
assert(replaceContentRecords([]).ok);assert.equal(ITEMS.length,0);
ITEMS.splice(0,ITEMS.length,...seed);
console.log('PASS: content boundary, numeric IDs, track names, unknown metadata, invalid dates, duplicates and atomic updates');
