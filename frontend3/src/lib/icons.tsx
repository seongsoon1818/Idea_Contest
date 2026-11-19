import { Fragment } from 'react';
// Same SVG icon set as the design build.
export const ICON_PATHS: Record<string, string> = {
  clip: 'M21 11l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  exclamation: 'M10 3h4v12h-4zM12 18a2 2 0 1 0 0 4a2 2 0 0 0 0-4z',
  pencil: 'M16 3l5 5-12 12-6 1 1-6L16 3zM13 6l5 5M4 15l5 5',
  spark: 'M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3z',
  search: 'M21 21l-5-5M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  bookmark: 'M6 4h12v17l-6-4-6 4V4z',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  chevron: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6 6 18',
  clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  calendar: 'M4 5h16v16H4V5zM8 3v4m8-4v4M4 10h16',
  wallet: 'M3 6h17v14H3V6zM3 6V4h14M16 11h5v5h-5v-5z',
  briefcase: 'M3 7h18v14H3V7zM8 7V3h8v4M3 12h18M10 12v3h4v-3',
  building: 'M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 7h1m6 0h1M8 11h1m6 0h1',
  trophy: 'M7 3h10v6a5 5 0 0 1-10 0V3zM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 14v6m-4 1h8',
  book: 'M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15',
  rocket: 'M9 15 5 19l-1-5 5-3m4 4 3 5 3-5-4-2M9 15c-4-5 2-11 11-12 0 9-6 15-11 12zM14 8h.01M5 21l2-2',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM3 12h18M12 3c4 5 4 13 0 18-4-5-4-13 0-18z',
  compare: 'M4 4h6v16H4V4zM14 4h6v16h-6V4z',
  info: 'M12 10v6m0-9h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  external: 'M14 3h7v7M10 14 21 3M10 3H3v18h18v-7',
  check: 'M5 12l4 4L19 6',
  lock: 'M5 10h14v11H5V10zM8 10V7a4 4 0 0 1 8 0v3',
};

export function Icon({ name }: { name: string }) {
  return (
    <svg className={`icon${name === 'exclamation' ? ' icon-exclamation' : ''}`} aria-hidden="true" viewBox="0 0 24 24">
      <path d={ICON_PATHS[name] || ICON_PATHS.info} />
    </svg>
  );
}

/** Text with <br> line breaks written as "\n". */
export function Lines({ text }: { text: string }) {
  const parts = text.split('\n');
  return <>{parts.map((part, i) => (<Fragment key={i}>{i > 0 && <br />}{part}</Fragment>))}</>;
}

/** Kakao and Google symbols (same SVG as the login buttons). */
export function ProviderSymbol({ id }: { id: 'kakao' | 'google' }) {
  if (id === 'kakao') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4C6.5 4 2 7.4 2 11.6c0 2.7 1.9 5.1 4.7 6.4l-1.1 4 4.7-2.9 1.7.1c5.5 0 10-3.4 10-7.6S17.5 4 12 4z" /></svg>;
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.36z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.23-2.51c-.9.6-2.04.96-3.39.96-2.6 0-4.8-1.76-5.59-4.13H3.07v2.59A10 10 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.41 13.91a6 6 0 0 1 0-3.82V7.5H3.07a10 10 0 0 0 0 9l3.34-2.59z" />
      <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.52l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.93 5.5l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96z" />
    </svg>
  );
}
