// Calendar deadlines follow the university's time zone, regardless of device zone.
const seoulDateFormat=new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
export function todayDate(now=new Date()){
 const parts=Object.fromEntries(seoulDateFormat.formatToParts(now).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export const CATEGORIES = [
 {id:'scholarship',name:'장학·지원',short:'장학',icon:'wallet',color:'orange',hint:'장학금과 학생 지원'},
 {id:'career',name:'진로·취업',short:'취업',icon:'briefcase',color:'blue',hint:'직무 탐색과 취업 준비'},
 {id:'intern',name:'현장실습',short:'실습',icon:'building',color:'teal',hint:'현장에서 쌓는 경험'},
 {id:'contest',name:'공모전·대외활동',short:'공모전',icon:'trophy',color:'purple',hint:'도전하고 만드는 활동'},
 {id:'study',name:'학습·전공',short:'학습',icon:'book',color:'teal',hint:'학습 역량과 전공 성장'},
 {id:'startup',name:'창업',short:'창업',icon:'rocket',color:'orange',hint:'아이디어를 현실로'},
 {id:'wellbeing',name:'상담·마음건강',short:'마음건강',icon:'heart',color:'pink',hint:'마음 돌봄과 대학 생활'},
 {id:'culture',name:'문화·교류',short:'교류',icon:'globe',color:'purple',hint:'문화 체험과 글로벌 교류'}
];
// Notice browsing follows university classifications; profile interests stay separate.
export const NOTICE_CATEGORIES = [
 {id:'academic',name:'학사',short:'학사',icon:'book',color:'blue'},
 {id:'scholarship',name:'장학·지원',short:'장학',icon:'wallet',color:'orange'},
 {id:'career',name:'진로·취업',short:'취업',icon:'briefcase',color:'blue'},
 {id:'intern',name:'현장실습',short:'실습',icon:'building',color:'teal'},
 {id:'activity',name:'비교과',short:'비교과',icon:'pencil',color:'teal'},
 {id:'startup',name:'창업',short:'창업',icon:'rocket',color:'orange'},
 {id:'international',name:'국제·교류',short:'교류',icon:'globe',color:'purple'}
];
// Explicit classifications for the existing notice cards; no source labels are inferred.
const noticeCategories={n01:'scholarship',n03:'intern',n10:'academic',n12:'intern',n14:'scholarship',n18:'career'};
export const PROGRAM_CATEGORIES = [
 {id:'learning',name:'학습역량강화',short:'학습',icon:'book',color:'teal'},
 {id:'counseling',name:'상담·심리지원',short:'상담',icon:'heart',color:'pink'},
 {id:'startup',name:'창업지원',short:'창업',icon:'rocket',color:'orange'},
 {id:'major',name:'전공역량강화',short:'전공',icon:'building',color:'blue'},
 {id:'other',name:'기타',short:'기타',icon:'globe',color:'purple'}
];
// Prototype classifications. Real program classifications must come from source data.
const programCategories={p02:'other',p04:'other',p05:'other',p06:'major',p07:'startup',p08:'counseling',p09:'other',p11:'learning',p13:'other',p15:'other',p16:'other',p17:'learning'};
const seed = [
 ['n01','notice','scholarship','2026 가을 학업지원 장학금','학업에 집중할 수 있도록, 나의 한 학기를 지원받아요.',[1,2,3,4],[],'2026-10-01','2026-10-16','2026-11-02','장학금 50만 원 · 선발 20명',['재학증명서','직전 학기 성적증명서','지원 사유서'],'학생장학팀',['장학금','생활지원']],
 ['p02','program','career','나를 보여주는 포트폴리오 워크숍','경험 정리부터 포트폴리오 피드백까지 한 번에.',[3,4],[],'2026-10-02','2026-10-13','2026-10-20','비교과 20pt · 현직자 피드백',['노트북','기존 포트폴리오 또는 경험 정리 파일'],'진로취업지원팀',['포트폴리오','직무탐색']],
 ['n03','notice','intern','겨울방학 기업 현장실습 참여자 모집','전공에서 배운 내용을 실제 기업에서 경험해 보세요.',[3,4],['기업경영','글로벌비즈니스'],'2026-10-05','2026-10-23','2026-12-21','실습지원비 지급 · 전공 실무 경험',['이력서','자기소개서','성적증명서'],'현장실습지원팀',['경영','겨울방학']],
 ['p04','program','contest','AI로 바꾸는 캠퍼스 아이디어톤','일상 속 작은 불편을, 새로운 서비스 아이디어로.',[1,2,3,4],[],'2026-10-01','2026-10-18','2026-10-30','비교과 30pt · 우수팀 시상',['2~4인 팀 구성','아이디어 제안서 1쪽'],'학생성장지원팀',['AI','서비스기획']],
 ['p05','program','career','현직자와 함께하는 직무 탐색 라운지','마케팅·기획·개발 직무의 하루를 가까이서 만나세요.',[1,2,3,4],[],'2026-10-01','2026-10-11','2026-10-15','비교과 10pt · 직무별 Q&A',['관심 직무 선택','현직자에게 물어볼 질문 1개'],'진로취업지원팀',['직무탐색','멘토링']],
 ['p06','program','study','데이터로 읽는 비즈니스 기초','엑셀과 데이터를 활용해 비즈니스 문제를 풀어봐요.',[1,2,3,4],['기업경영','글로벌비즈니스'],'2026-10-03','2026-10-21','2026-10-28','비교과 20pt · 실습 자료 제공',['노트북','스프레드시트 사용 가능 환경'],'학습지원팀',['데이터','경영']],
 ['p07','program','startup','내 아이디어의 첫 고객 찾기','고객 인터뷰와 시장 검증으로 아이디어를 구체화해요.',[1,2,3,4],[],'2026-10-02','2026-10-19','2026-10-27','비교과 15pt · 창업 멘토링',['아이디어 소개 3문장','노트북 또는 태블릿'],'창업지원팀',['고객인터뷰','창업']],
 ['p08','program','wellbeing','마음 쉼표: 시험기간 스트레스 관리','시험을 준비하는 마음에도 짧은 쉬는 시간이 필요해요.',[1,2,3,4],[],'2026-10-01','2026-10-14','2026-10-16','비교과 10pt · 소그룹 마음 돌봄',['사전 스트레스 설문'],'학생상담팀',['스트레스','대학생활']],
 ['p09','program','culture','글로벌 버디: 함께하는 캠퍼스 투어','다양한 친구와 만나고, 익숙한 캠퍼스를 새롭게 발견해요.',[1,2,3,4],[],'2026-10-02','2026-10-22','2026-10-29','비교과 15pt · 교류 활동 인증',['간단한 자기소개','활동 가능 시간'],'국제교류팀',['글로벌','친구']],
 ['n10','notice','contest','지역을 연결하는 콘텐츠 공모전','우리 동네의 매력을 짧은 영상과 콘텐츠로 알려주세요.',[1,2,3,4],[],'2026-09-28','2026-10-27','2026-11-06','최우수팀 상금 100만 원',['콘텐츠 파일','작품 설명서','팀원 명단'],'지역협력팀',['콘텐츠','로컬']],
 ['p11','program','study','새내기를 위한 대학 공부법','첫 대학 생활, 나에게 맞는 공부 방법을 찾아봐요.',[1,2],[],'2026-10-01','2026-10-17','2026-10-23','비교과 10pt · 학습 계획 코칭',['현재 시간표','학습 고민 한 가지'],'학습지원팀',['학습전략','새내기']],
 ['n12','notice','intern','웹 서비스 개발 현장실습','웹 개발 프로젝트에서 팀과 협업하며 성장해요.',[3,4],['웹공학','빅데이터'],'2026-10-05','2026-10-24','2026-12-21','실습지원비 지급 · 개발 실무 경험',['GitHub 또는 프로젝트 링크','이력서','성적증명서'],'현장실습지원팀',['개발','웹']],
 ['p13','program','career','실전 면접, 1:1 모의 인터뷰','지원 직무에 맞춘 연습으로 면접 자신감을 키워요.',[3,4],[],'2026-10-06','2026-10-09','2026-10-19','비교과 10pt · 개별 피드백',['지원 직무','자기소개서','면접 질문 3개'],'진로취업지원팀',['면접','취업']],
 ['n14','notice','scholarship','전공 도서 구입비 지원','전공 공부에 필요한 도서 구입 부담을 줄여요.',[1,2,3,4],[],'2026-10-15','2026-10-30','2026-11-05','도서 구입비 최대 10만 원',['지원 신청서','도서 목록'],'학생지원팀',['도서','학습지원']],
 ['p15','program','contest','여름 콘텐츠 크리에이터 챌린지','콘텐츠 기획부터 제작까지 직접 경험하는 프로젝트.',[1,2,3,4],[],'2026-09-01','2026-10-05','2026-10-08','비교과 20pt',['활동 계획서','콘텐츠 예시'],'학생성장지원팀',['콘텐츠','챌린지']],
 ['p16','program','culture','캠퍼스 문화 산책','일상에서 발견하는 문화와 함께 잠시 쉬어가요.',[1,2,3,4],[],'2026-10-07','2026-10-26','2026-11-04',null,[],'문화지원팀',['문화','산책']],
 ['p17','program','study','코딩 첫걸음: 나만의 웹페이지','처음 코딩하는 학생도 작은 웹페이지를 완성할 수 있어요.',[1,2],[],'2026-10-02','2026-10-20','2026-10-27','비교과 20pt · 기초 실습',['노트북'],'학습지원팀',['코딩','기초']],
 ['n18','notice','career','졸업예정자를 위한 취업 준비 지원','지원서부터 면접까지, 졸업 전 취업 준비를 도와드려요.',[4],[],'2026-10-01','2026-10-25','2026-11-03','취업 준비비 최대 20만 원',['졸업예정증명서','구직활동 계획서'],'진로취업지원팀',['졸업','취업지원']]
];
export const ITEMS=seed.map(([id,type,category,title,subtitle,grades,tracks,start,deadline,eventAt,benefit,preparations,department,tags])=>({id,type,category,noticeCategory:type==='notice'?noticeCategories[id]:null,programCategory:type==='program'?programCategories[id]:null,title,subtitle,grades,tracks,start,deadline,eventAt,benefit,preparations,department,tags,publishedAt:start}));
export const sourceUrl = type => type==='notice'?'https://www.hansung.ac.kr/hansung/6172/subview.do':'https://hsportal.hansung.ac.kr/';
export const normalizeTrack = t => t.replace(/트랙/g,'').replace(/\s/g,'').trim();
export const statusOf = (item,today=todayDate()) => item.start>today?'upcoming':item.deadline<today?'closed':'open';
export const daysLeft = (item,today=todayDate()) => Math.round((Date.parse(item.deadline+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
export const gradeMatches=(item,grade)=>grade==='other'?item.grades.length===4:item.grades.includes(Number(grade));
export function matchProfile(item,profile) {
 if(!profile)return {eligible:false,reasons:[],score:0};
 const gradeOK=gradeMatches(item,profile.grade);
 const trackOK=item.trackEligibilityKnown!==false&&(!item.tracks.length || profile.tracks.some(t=>item.tracks.some(required=>normalizeTrack(required)===normalizeTrack(t))));
 const interested=profile.interests.includes(item.category);
 const reasons=[];
 if(gradeOK)reasons.push(item.grades.length===4?'전 학년 참여 가능':`${profile.grade}학년 신청 대상`);
 if(trackOK && item.tracks.length)reasons.push('내 트랙 대상');
 if(interested)reasons.push(`${(CATEGORIES.find(c=>c.id===item.category)?.short||'선택한')} 관심 분야`);
 return {eligible:gradeOK&&trackOK,reasons,score:(interested?100:0)+(item.tracks.length&&trackOK?20:0)+(item.grades.length<4?10:0)};
}
