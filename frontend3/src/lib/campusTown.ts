// CAMPUS TOWN 사이트 주소는 dist/campus-town.json 의 "url" 에 입력한다 (빌드 불필요).
// 원본은 public/campus-town.json 이며 빌드할 때 dist/ 로 그대로 복사된다.
// 주소가 비어 있거나 https 가 아니거나 파일을 읽지 못하면 '' (버튼 비활성화).
export const CONFIG_PATH = 'campus-town.json';

export function toSafeUrl(value: unknown): string {
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
export async function readCampusTownUrl(): Promise<string> {
  try {
    const response = await fetch(CONFIG_PATH, { cache: 'no-store' });
    if (!response.ok) return '';
    const data: unknown = await response.json();
    return toSafeUrl((data as { url?: unknown } | null)?.url);
  } catch {
    return '';
  }
}
