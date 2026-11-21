// CAMPUS TOWN 진입 카드. 사이트 주소는 이 폴더의 campus-town.json 의 "url" 에 입력한다 (빌드 불필요).
// 주소가 비어 있거나 https 가 아니거나 파일을 읽지 못하면 '오픈 예정' 비활성 버튼을 그대로 둔다.
export const CONFIG_PATH = 'campus-town.json';

export function toSafeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

// Reads the config without the browser cache so an edited address shows on the next visit.
export async function readCampusTownUrl(fetchFn = globalThis.fetch) {
  try {
    const response = await fetchFn(CONFIG_PATH, { cache: 'no-store' });
    if (!response.ok) return '';
    const data = await response.json();
    return toSafeUrl(data?.url);
  } catch {
    return '';
  }
}

// Replaces the disabled button with a new-tab link when the address is a valid https URL.
export function activateCampusTown(root, value) {
  const url = toSafeUrl(value);
  const button = root.querySelector('.campus-town-note .campus-town-btn');
  if (!url || !button || button.tagName === 'A') return false;
  const link = root.createElement('a');
  link.className = 'campus-town-btn';
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', '캠퍼스타운 체험하기 (새 탭에서 열림)');
  link.innerHTML = '체험하기 <span aria-hidden="true">↗</span>';
  button.replaceWith(link);
  return true;
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  readCampusTownUrl().then((url) => activateCampusTown(document, url));
}
