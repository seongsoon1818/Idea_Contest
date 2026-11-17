// Selection catalog transcribed from the user's 대학전체.pdf (four pages).
// Current names are retained; future reorganizations are searchable annotations.
const group=(name,entries,note='')=>({name,note,entries:entries.map(e=>typeof e==='string'?{name:e}:e)});
export const TRACK_COLLEGES=[
 {id:'humanities',name:'크리에이티브인문예술대학',groups:[
  group('크리에이티브인문학부',['영미문화콘텐츠트랙','영미언어정보트랙','한국어교육트랙','역사문화큐레이션트랙','역사콘텐츠트랙','지식정보문화트랙','디지털인문정보학트랙']),
  group('예술학부',['동양화전공','서양화전공','한국무용전공','현대무용전공','발레전공'])]},
 {id:'social',name:'미래융합사회과학대학',groups:[
  group('사회과학부',['국제무역트랙','글로벌비즈니스트랙','기업ㆍ경제분석트랙','경제금융투자트랙','공공행정트랙','법&정책트랙','부동산트랙','스마트도시ㆍ교통계획트랙','기업경영트랙','비즈니스애널리틱스트랙','회계ㆍ재무경영트랙'])]},
 {id:'design',name:'디자인대학',note:'2027학년도부터 AI디자인대학으로 개편',groups:[
  group('글로벌패션산업학부',['패션마케팅트랙','패션디자인트랙','패션크리에이티브디렉션트랙'],'2027학년도부터 AI패션학부로 개편'),
  group('ICT디자인학부',['미디어디자인트랙','시각디자인트랙','영상ㆍ애니메이션디자인트랙','UX/UI디자인트랙','인테리어디자인트랙','VMDㆍ전시디자인트랙','게임그래픽디자인트랙'],'2027학년도부터 AI융합디자인학부로 개편'),
  group('뷰티디자인매니지먼트학과',['뷰티디자인매니지먼트학과'],'2027학년도부터 AI뷰티디자인학과로 개편')]},
 {id:'engineering',name:'IT공과대학',groups:[
  group('컴퓨터공학부',['모바일소프트웨어트랙','빅데이터트랙',{name:'디지털콘텐츠ㆍ가상현실트랙',note:'2027학년도 11월 트랙 선택부터 지능형실감미디어공학트랙으로 개편'},'웹공학트랙']),
  group('기계전자공학부',['전자트랙','시스템반도체트랙','기계시스템디자인트랙','AI로봇융합트랙'],'2027학년도부터 전기전자공학부로 개편'),
  group('산업시스템공학부',['산업공학트랙','응용산업데이터공학트랙'])]},
 {id:'convergence',name:'창의융합대학',note:'2027학년도부터 AI융합대학으로 개편',groups:[
  group('창의융합대학',['상상력인재학부',{name:'문학문화콘텐츠학과',note:'2027학년도부터 AI융합학부 소속'},{name:'AI응용학과',note:'2027학년도부터 AI학부 소속'},{name:'융합보안학과',note:'2027학년도부터 AI학부 소속'},{name:'미래모빌리티학과',note:'2027학년도부터 AI융합학부 소속'},'창업트랙',{name:'AI기계로봇공학과',note:'2027학년도 신설 및 신입생 선발 · AI융합학부 소속'}],'2027학년도부터 AI학부·AI융합학부 체제로 개편')]},
 {id:'global',name:'글로벌인재대학',groups:[
  group('글로벌인재대학',['한국언어문화교육학과','글로벌K비즈니스학과',{name:'영상엔터테인먼트학과',note:'2027학년도부터 K-영상콘텐츠학과로 개편'},'패션뷰티크리에이션학과','SW융합학과','글로벌벤처창업학과',{name:'글로벌정책학과',note:'2027학년도 신설 및 신입생 선발'}])]},
 {id:'future',name:'미래플러스대학',note:'계약학과 · 2027학년도부터 AI디지털융합인재학부 체제로 개편',groups:[
  group('미래플러스대학',['융합행정학과','호텔외식경영학과','뷰티디자인학과','비즈니스컨설팅학과','ICT융합디자인학과','AIㆍ소프트웨어학과',{name:'뷰티매니지먼트학과',note:'계약학과'},{name:'디지털콘텐츠디자인학과',note:'계약학과'},{name:'인테리어디자인학과',note:'계약학과'},{name:'스마트제조혁신컨설팅학과',note:'계약학과'}])]},
 {id:'liberal',name:'상상력교양대학',groups:[
  group('기초교양학부',['기초교양학부','사고와표현과정','교양영어과정']),
  group('소양핵심교양학부',['소양핵심교양학부']),
  group('자율교양학부',['자율교양학부'])]}
];
export const TRACK_OPTIONS=TRACK_COLLEGES.flatMap(c=>c.groups.flatMap((g,gi)=>g.entries.map((e,ei)=>({
 ...e,id:`${c.id}-${gi}-${ei}`,collegeId:c.id,college:c.name,groupId:`${c.id}-${gi}`,group:g.name,
 searchText:[e.name,e.note,c.name,c.note,g.name,g.note].filter(Boolean).join(' ')
}))));
export const normalizeTrackSearch=value=>String(value).toLowerCase().replace(/[\s·ㆍ&/]/g,'');
// College and department selections use the same uploaded catalog, not invented names.
const affiliationOptions=TRACK_COLLEGES.flatMap(c=>[
 {id:`college-${c.id}`,name:c.name,kind:'college',collegeId:c.id,college:c.name,groupId:null,searchText:[c.name,c.note].filter(Boolean).join(' '),note:'소속 대학 선택'},
 ...c.groups.filter(g=>!TRACK_OPTIONS.some(t=>t.name===g.name)&&!g.name.endsWith('대학')).map(g=>({
  id:`department-${c.id}-${c.groups.indexOf(g)}`,name:g.name,kind:'department',collegeId:c.id,college:c.name,
  groupId:`${c.id}-${c.groups.indexOf(g)}`,searchText:[c.name,g.name,g.note].filter(Boolean).join(' '),note:'소속 학부·학과 선택'
 }))
]);
export const TRACK_SELECTION_OPTIONS=[...TRACK_OPTIONS.map(t=>({...t,kind:/(?:학과|학부)$/.test(t.name)?'department':'track'})),...affiliationOptions];
export function trackOptionsForSlot({slot=1,grade=null}={}){
 return TRACK_SELECTION_OPTIONS.filter(t=>t.kind==='college'?slot===1:!(slot===1&&Number(grade)===1&&t.kind==='track'));
}
export const isSelectableTrack=(name,context={})=>trackOptionsForSlot(context).some(t=>t.name===name);
