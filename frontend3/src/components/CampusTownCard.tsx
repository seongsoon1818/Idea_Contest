import { useEffect, useState } from 'react';
import { readCampusTownUrl } from '../lib/campusTown';

export function CampusTownCard({ variant = 'sidebar' }: { variant?: 'sidebar' | 'profile' }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    void readCampusTownUrl().then((value) => { if (alive) setUrl(value); });
    return () => { alive = false; };
  }, []);
  return (
    <div className={`sidebar-note campus-town-note${variant === 'profile' ? ' campus-town-profile' : ''}`}>
      <span className="note-icon" aria-hidden="true">✦</span>
      <span className="campus-town-eyebrow">CAMPUS TOWN</span>
      <p>나만의 캠퍼스타운 만들기</p>
      {url
        ? <a className="campus-town-btn" href={url} target="_blank" rel="noopener noreferrer" aria-label="캠퍼스타운 체험하기 (새 탭에서 열림)">체험하기 <span aria-hidden="true">↗</span></a>
        : <button type="button" className="campus-town-btn" disabled>오픈 예정</button>}
    </div>
  );
}
