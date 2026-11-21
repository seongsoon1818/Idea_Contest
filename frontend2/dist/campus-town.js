// CAMPUS TOWN 사이트 주소 (별도 배포 사이트). 주소가 정해지면 아래 따옴표 안에 https 주소를 입력한다.
export const CAMPUS_TOWN_URL_SETTING = '';

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

// https 주소일 때만 비활성 버튼을 새 탭 링크로 바꾼다. 그 외에는 '오픈 예정' 버튼을 그대로 둔다.
export function activateCampusTown(root = document, value = CAMPUS_TOWN_URL_SETTING) {
  const url = toSafeUrl(value);
  const button = root.querySelector('.campus-town-note .campus-town-btn');
  if (!url || !button) return false;
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

activateCampusTown();
