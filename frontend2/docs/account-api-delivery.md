# 계정 API 프론트 코드 인계 — 2026-11-13 (KST)

실행 코드·테스트 기준은 팀 저장소의 **[`b9c511d8f045751b0b0286dc4028a7c099a79772`](https://github.com/seongsoon1818/Idea_Contest/commit/b9c511d8f045751b0b0286dc4028a7c099a79772)**입니다. 이후 인계 정리 커밋은 문서만 바꿉니다. 최종 브랜치 HEAD와 병합 여부는 PR에서 확인하며, 병합·운영 배포 완료를 가정하지 않습니다.

- 저장소: `seongsoon1818/Idea_Contest`
- 브랜치: `frontend/fix/account-session-handoff-20261113`
- 비교 기준 main: `a6e3c7e59158626f5adac9a41d6e82f2aa3cbe49`
- 상세 결과·백엔드 확인 사항: [정정 인계서](backend-handoff-2026-11-13.md)
- 실행 방법: [로컬 계정 연동](local-auth-integration.md)

## 버전이 달랐던 이유

| 식별자 | 위치와 범위 |
|---|---|
| `bd32615` | 로컬 초기 계정 연동. 이후 세션·재연결 보완 전 버전 |
| `a07ce30` | Sites 배포 저장소. 실행 파일 4개와 DOM 테스트가 이번 전달과 동일. 팀 저장소 커밋은 아님 |
| `979a74a` | 팀 GitHub: 계정·세션 보완 실행 파일 4개 |
| `c93aaec` | 팀 GitHub: 계정 인계·로컬 실행 문서 |
| `577ac82` | 팀 GitHub: 세션 보완 DOM 테스트 |
| `b9c511d` | 팀 GitHub: 로컬 프록시 추가. 위 변경 전체를 포함하는 실행 코드 기준 |

이전 `HSU-PICK-auth.zip`은 바깥 프로젝트 136개 파일 모두 `bd32615`와 같고, 동일한 136개 파일이 내부에 한 번 더 중첩돼 있었습니다. 최신 프론트 위에 풀면 세션 보완이 빠질 수 있습니다. 이번 PR에서 받고 이전 ZIP/패치를 추가 적용하지 않습니다. 로컬·Sites SHA를 팀 GitHub에서 받을 커밋 번호로 사용하지 않습니다.

## 변경 파일

| 파일 | 역할 |
|---|---|
| `dist/account-api.js` | 회원가입·로그인·쿠키 기반 복원·로그아웃, 두 탭 갱신 순서 조정 및 제한 재시도 |
| `dist/login.js` | 폼 요청, 서버 오류, 복원 상태 분기와 재연결 |
| `dist/index.html`, `dist/styles.css` | 재연결 UI, 숨김 상태, 캐시 버전 |
| `scripts/local-auth-preview.mjs` | 같은 출처 `/api/v1/`을 `127.0.0.1:3000`으로 전달 |
| `tests/dom-flow.test.mjs` | 계정·복원·로그아웃·오프라인·서버 장애·시간 초과·재시도 검사 |
| `docs/local-auth-integration.md` | 로컬 실행과 운영 API 활성화 |
| `README.md`, `CHANGELOG.md`, 이 문서, `docs/backend-handoff-2026-11-13.md` | 버전과 검증 범위 정리 |

## 코드 받기와 검사

```sh
git fetch origin
git switch --track origin/frontend/fix/account-session-handoff-20261113
git rev-parse HEAD
cd frontend
npm run check
node --check dist/account-api.js
node --check scripts/local-auth-preview.mjs
```

이미 브랜치가 있으면 `git switch frontend/fix/account-session-handoff-20261113` 후 최신 상태를 확인합니다. 작업 중인 변경을 자동으로 덮어쓰지 않습니다. 고정 실행 코드만 확인하려면 별도 디렉터리에서 `git switch --detach b9c511d8f045751b0b0286dc4028a7c099a79772`를 사용하고, 최신 문서는 PR 브랜치에서 읽습니다.

## 운영 설정

- 계정 API는 `localhost`, `127.0.0.1`, `[::1]`에서 활성화됩니다. 공개 데모는 비활성 상태를 유지합니다.
- 운영에서는 같은 출처 `/api/v1` 라우팅·허용 출처·HTTPS 쿠키 확인 후 `<meta name="hsupick-account-api" content="enabled">`로 활성화합니다.
- 쓰기 요청에 `X-CSRF-Guard: 1`을 보냅니다. 액세스 토큰은 메모리, 갱신 토큰은 서버 HttpOnly 쿠키로 관리합니다.
- Web Locks로 계정 쿠키 변경 요청의 순서를 맞춥니다. 잠금을 못 쓰면 `401 INVALID_REFRESH_TOKEN`에만 최대 세 번 재시도합니다.
- 일시적 연결 장애는 현재 주소의 다시 연결하기, 알려진 만료·해제는 로그인, 계정 비활성은 서버 안내로 분기합니다.

## 검사 결과와 남은 작업

- 2026-11-13 실행 코드와 동일한 로컬 파일로 `npm run check` 재검사: DOM 동작 단언 **988개**와 데이터·세션·입력·이미지·추천·알림 검사 통과. 계정 화면은 모의 API이며 운영 검증이 아닙니다.
- `node --check dist/account-api.js`, `node --check scripts/local-auth-preview.mjs` 통과.
- 과거 실제 MySQL 결과는 [정정 인계서](backend-handoff-2026-11-13.md)에 구분했습니다. 이번에 DB 테스트를 새로 실행하지 않았습니다.
- 실제 브라우저 가입 → 로그아웃 → 로그인 → 새로고침 → 두 탭 동시 새로고침 → 연결 장애 → 재연결 검증은 남아 있습니다.
- 공지·비교과·추천·MY PICK·AI 비교·알림·소셜 인증의 서버 연결은 별도입니다. 검색 수정·푸시 형식 통일·이름 문자 제한·다른 탭의 즉시 로그아웃 반영도 이번 범위에 없습니다.
- 이번 PR은 `frontend/`만 변경합니다. 백엔드 소스·운영 DB·main 병합·운영 서버 배포는 변경하지 않습니다.
