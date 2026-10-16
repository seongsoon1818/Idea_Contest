# 한성픽 프론트엔드

현재 배포 화면의 **HTML/CSS/JavaScript ES modules 원본**입니다. React/TSX가 아닙니다. 버전 **1.16.76**이며 화면 소스·이미지·자체 호스팅 폰트·회귀 검사 코드를 포함합니다.

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

926개 인메모리 DOM 흐름 및 데이터·세션·입력 규칙·이미지·추천 검사를 통과했습니다. 실제 브라우저 렌더링/터치/키보드/네트워크/API 검사를 대신하지 않습니다.

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

현재 로그인·소셜·서버 저장·학교 데이터·AI API는 연결되지 않았습니다. 프로필과 MY PICK은 브라우저 저장입니다. `setAccountSession`만 호출하거나 API URL만 바꿔서는 연동이 완료되지 않습니다.

**[백엔드 연동 전달서](docs/backend-handoff-2026-10-16.md)**부터 확인해 주세요. 사용자 입력 규칙·분류 ID·미확인 정보·기간 없는 공지·본문/이미지·계정 데이터 주입·페이지네이션·통합 검사 순서가 있습니다. 기존 문서보다 이 전달서가 최신 기준입니다.

- [인증 및 계정 저장 연결](docs/auth-integration.md)
- [비교과 공개 정보](docs/program-public-content.md)
- [PC/모바일 일관성 점검](docs/request-consistency-review-2026-10-16.md)

현재 데모: https://hsupick-campus-idea-contest.luckycrown8.chatgpt.site/

이 GitHub 저장소의 변경이 기존 ChatGPT Sites 배포에 자동 반영되는 CI는 설정하지 않았습니다. 로컬 개발·일반 정적 호스팅에 필요한 파일만 전달했으며 Sites 전용 프로젝트 설정은 포함하지 않았습니다.

## 이미지 URL 표시

DB에 저장한 이미지 URL을 응답의 `images` 배열(권장), `imageUrls` 배열 또는 단일 `imageUrl`로 받으면 상세/공지 내용에서 표시합니다. 클릭 확대·원본 열기·실패 안내를 포함합니다. 실제 API 연결은 아직 필요합니다. [필드 예시와 연결 위치](docs/image-url-integration.md)를 확인하세요.
