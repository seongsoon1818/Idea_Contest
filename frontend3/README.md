# 한성픽 프론트엔드 3 (frontend3)

`frontend2` 화면을 **React 18 + TypeScript + Vite**로 새로 작성한 버전입니다. 화면·동작은 frontend2와 같고, `frontend`·`frontend2`·백엔드는 수정하지 않았습니다.

## 실행

```bash
cd frontend3
npm install
npm run dev        # http://localhost:5173, /api 요청은 http://localhost:3000 으로 전달
npm run build      # 타입 검사 후 dist/ 생성
npm run preview    # 빌드 결과 확인
```

백엔드 주소를 바꾸려면 `VITE_API_PROXY=http://주소 npm run dev` 로 실행합니다.

## 배포

`dist/`를 저장소에 함께 올렸습니다. 지금 배포는 `deploy/compose.yaml`의 `web.build.context: ../frontend/dist`를 사용합니다. frontend3로 바꾸려면 이 값을 `../frontend3/dist`로 바꾸면 됩니다. `deploy/web.Dockerfile`은 그대로 써도 됩니다. 소스를 고친 뒤에는 `npm run build`로 `dist/`를 다시 만들어 함께 올려 주세요.

## 구조

- `src/lib/` API 클라이언트(`accountApi.ts`), 세션(`session.ts`), 응답 변환·캐시(`live.ts`), 트랙·관심사 데이터
- `src/app/` 화면 상태(`store.ts`), 동작(`actions.ts`), 알림(`notifications.ts`)
- `src/pages/` 홈·맞춤추천·공지·프로그램·MY PICK·MY PAGE
- `src/components/` 카드, 필터, 목록·페이지 이동, 사이드바·상단바, 로그인 화면
- `src/modals/` 상세, 공지 원문, AI 비교, 내 정보 입력 2단계, 트랙 선택, 계정, 소개, 온보딩
- `src/styles.css` frontend2와 같은 스타일

## 참고

- 알림 기능은 frontend2와 같게 두었습니다(백엔드·프론트 계약 협의 전).
- 상세·모달은 브라우저 뒤로가기로 닫힙니다(frontend2와 같음).
- 모의 API 서버로 frontend2와 화면을 같은 크기로 캡처해 비교했습니다. 운영 서버(hsupick.cloud)는 접근 제한이 있어 실제 데이터로는 확인하지 못했습니다.
