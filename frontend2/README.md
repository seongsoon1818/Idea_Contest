# 한성픽 프론트엔드 2 (frontend2)

`frontend`를 복사해 **백엔드 연결 모드의 화면을 디자인 완성본(1번)과 같게** 맞춘 버전입니다. 원본 `frontend`는 수정하지 않았습니다.

## 2026-11-17 변경 내용

- 연결 모드에서도 `app.js`의 1번 화면 코드(히어로, 통계, 카드, 칩, 상세, 공지 내용, AI 비교, MY PICK, MY PAGE, 2단계 내 정보 입력)로 그립니다. 데이터만 API에서 받습니다.
- 새 파일 `dist/live.js`: API 응답을 1번 항목 형식으로 변환합니다. 카드 "대상" 칸은 상세 응답의 대상 규칙(학년·소속)으로 1번처럼 짧게 표시합니다.
- 🚩1순위 배지를 삭제했습니다.
- 비로그인: 맞춤 추천과 MY PICK 대신 로그인 안내를 보여주고, 저장·내 정보 입력은 로그인 화면으로 보냅니다.
- 목록은 1페이지 20개, 하단 페이지 이동이 있습니다.
- 상세: 프로그램 회차는 표시하지 않고, 첨부파일은 원문 버튼 줄에, 확인 사항은 별도 섹션으로 표시합니다.
- 이름은 백엔드 규칙(글자만)으로 입력 단계에서 미리 확인합니다.
- 알림 기능은 수정하지 않았습니다. `campus-ui.js`·`campus-content.js`·`campus-fields.js`는 더 이상 화면에서 쓰지 않지만 테스트 호환을 위해 남겨 두었습니다.
- 백엔드는 수정하지 않았습니다.

---

# 한성픽 프론트엔드

현재 배포 화면의 **HTML/CSS/JavaScript ES modules 원본**입니다. React/TSX가 아닙니다. 버전 **1.17.0**이며 화면 소스·이미지·자체 호스팅 폰트·회귀 검사 코드를 포함합니다.

## 2026-11-13 계정 연동·세션 복원 보완

**이번 변경부터 확인하려면 [계정 프론트 인계](docs/account-api-delivery.md), [정정 인계서](docs/backend-handoff-2026-11-13.md), [로컬 실행 안내](docs/local-auth-integration.md)를 먼저 읽어 주세요.**

실행 코드·테스트 기준은 팀 GitHub 커밋 `b9c511d8f045751b0b0286dc4028a7c099a79772`이며, 이후 문서 정리는 실행 코드를 바꾸지 않습니다. PR 브랜치 `frontend/fix/account-session-handoff-20261113`에서 받습니다. 이전 `HSU-PICK-auth.zip`은 세션 보완 전 버전이므로 추가 적용하지 않습니다.

- 회원가입·일반 로그인·쿠키 기반 복원·로그아웃 API를 연결했습니다. 운영에서는 API 라우팅 확인 후 활성화해야 합니다.
- 두 탭의 갱신 충돌을 처리하고, 연결 장애 때 현재 화면에서 다시 연결하기를 제공합니다.
- 공지·비교과·추천·MY PICK·비교·알림 화면의 실제 API 연동과 소셜 로그인은 별도 작업입니다.

## 2026-10-28 알림 기능 추가

**이번에 추가한 내용부터 보려면 [알림 변경 내역](docs/notification-changes-2026-10-28.md)을 확인하세요.**

- [버전별 변경 기록](CHANGELOG.md) — 선행 필터 수정과 알림 추가를 구분
- [알림 서버 연동 문서](docs/notification-integration.md) — API 어댑터·발송 규칙·남은 백엔드 작업
- 알림함·독립 설정·정책·서비스 워커는 포함되어 있습니다. 실제 예약 푸시 발송은 서버 연결이 필요합니다.

## CAMPUS TOWN 카드 주소

사이드바 하단 CAMPUS TOWN 카드의 이동 주소는 `dist/campus-town.json`의 `url`에 넣습니다. 빌드는 필요 없습니다.

```json
{ "url": "https://캠퍼스타운-주소" }
```

- 비어 있거나 `https://`가 아니거나 파일을 읽지 못하면 버튼은 `오픈 예정`(비활성)으로 보입니다.
- `https://` 주소가 있으면 `체험하기 ↗` 버튼이 새 탭에서 열립니다(`rel="noopener noreferrer"`).
- 브라우저 캐시 없이 읽으므로 파일을 바꿔 배포하면 다음 방문부터 반영됩니다.

## 실행

Python 3 기준, `frontend/dist`에서 다음 명령으로 정적 서버를 실행한 뒤 브라우저에서 표시된 주소를 엽니다. ES modules를 사용하므로 index.html을 file://로 직접 열지 않습니다.

```bash
cd frontend/dist
python3 -m http.server 8080
```

다른 정적 서버로 `frontend/dist/`를 호스팅해도 됩니다. 별도의 프론트 빌드나 npm 의존성 설치는 필요하지 않습니다.

## 검사

Node.js가 설치된 환경에서 실행합니다. 이번 전달본은 Node.js 24에서 검사했습니다.

```bash
cd frontend
npm run check
```

2026-11-13 재검사에서 인메모리 DOM 동작 단언 988개와 데이터·세션·입력 규칙·이미지·추천·알림 검사를 통과했습니다. 실제 브라우저 렌더링/터치/키보드/네트워크/API 검사를 대신하지 않습니다.

## 처음 읽는 순서

1. 이 README에서 실행 방법과 현재 구현 범위를 확인합니다.
2. [프론트 구조와 화면별 기능 안내](docs/frontend-guide.md)에서 파일·화면·수정 위치를 확인합니다.
3. [백엔드 연동 전달서](docs/backend-handoff-2026-10-16.md)에서 데이터·계정·추천 규칙을 확인합니다.

설명 문서도 전부 `frontend/docs/`에 넣었습니다. `dist/`는 빌드 산출물처럼 보이지만 이 프로젝트에서는 직접 수정하는 원본 소스입니다.

## 폴더

- `dist/index.html`: 로그인·앱 진입 화면
- `dist/styles.css`: 공통/반응형 디자인
- `dist/app.js`: 추천·상세·MY PICK·MY PAGE·화면 이동
- `dist/login.js`, `dist/auth-rules.js`, `dist/account-session.js`: 계정 UI·입력 규칙·세션 상태 어댑터
- `dist/data.js`, `dist/content-contract.js`: 정적 데이터·실제 응답 매핑 후 검증 도구
- `dist/tracks.js`: 대학·학부학과·트랙 선택 카탈로그
- `dist/notice-images.js`, `dist/assets/`: 이미지 처리·로고·폰트
- `tests/`: 위 `npm run check` 검사

## 백엔드 연결 전 확인

일반 계정 API 연동 코드가 포함되며 로컬에서는 활성화됩니다. 공개 데모는 운영 API 연결 전까지 계정 API를 비활성화합니다. 소셜·서버 프로필 저장·학교 데이터 조회·AI API는 아직 연결되지 않았습니다. 프로필과 MY PICK은 브라우저 저장입니다. `setAccountSession`만 호출하거나 API URL만 바꿔서는 연동이 완료되지 않습니다.

**계정 연동은 [계정 프론트 인계](docs/account-api-delivery.md)를 먼저 확인하고, 나머지 데이터 연결은 [백엔드 연동 전달서](docs/backend-handoff-2026-10-16.md)를 참고해 주세요.** 사용자 입력 규칙·분류 ID·미확인 정보·기간 없는 공지·본문/이미지·계정 데이터 주입·페이지네이션·통합 검사 순서가 있습니다. 계정 기능은 2026-11-13 인계 문서를 우선합니다.

- [인증 및 계정 저장 연결](docs/auth-integration.md)
- [비교과 공개 정보](docs/program-public-content.md)
- [PC/모바일 일관성 점검](docs/request-consistency-review-2026-10-16.md)

현재 데모: https://hsupick-campus-idea-contest.ijiwon587.chatgpt.site/

이 GitHub 저장소의 변경이 기존 ChatGPT Sites 배포에 자동 반영되는 CI는 설정하지 않았습니다. 로컬 개발·일반 정적 호스팅에 필요한 파일만 전달했으며 Sites 전용 프로젝트 설정은 포함하지 않았습니다.

## 이미지 URL 표시

DB에 저장한 이미지 URL을 응답의 `images` 배열(권장), `imageUrls` 배열 또는 단일 `imageUrl`로 받으면 상세/공지 내용에서 표시합니다. 클릭 확대·원본 열기·실패 안내를 포함합니다. 실제 API 연결은 아직 필요합니다. [필드 예시와 연결 위치](docs/image-url-integration.md)를 확인하세요.

