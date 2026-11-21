// CAMPUS TOWN 사이트 주소 (별도 배포 사이트).
// 주소가 정해지면 frontend3/.env 에 VITE_CAMPUS_TOWN_URL=https://... 를 넣고 다시 빌드하거나,
// 아래 FALLBACK_URL 에 직접 입력한 뒤 다시 빌드한다.
const FALLBACK_URL = '';

function toSafeUrl(value: string | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

// https 주소일 때만 값이 들어가고, 비어 있거나 잘못된 주소면 '' (버튼 비활성화).
export const CAMPUS_TOWN_URL = toSafeUrl(import.meta.env.VITE_CAMPUS_TOWN_URL || FALLBACK_URL);
