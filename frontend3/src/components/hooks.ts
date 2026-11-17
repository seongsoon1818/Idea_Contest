import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { live } from '../lib/live';

const mobileQuery = typeof matchMedia === 'function' ? matchMedia('(max-width:800px)') : null;
/** Same breakpoint as the design build (max-width: 800px). */
export function useMobile() {
  return useSyncExternalStore(
    (cb) => { mobileQuery?.addEventListener('change', cb); return () => mobileQuery?.removeEventListener('change', cb); },
    () => !!mobileQuery?.matches,
  );
}
/** Re-render whenever cached API data changes. */
export function useLive() { return useSyncExternalStore(live.subscribe, live.getVersion); }

export function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return debounced;
}

/** Horizontal swipe = one step (port of setupStepGestures). Vertical scrolling stays normal. */
export function useStepGestures(ref: RefObject<HTMLElement>, onStep: (direction: number) => void) {
  useEffect(() => {
    const surface = ref.current;
    if (!surface) return;
    let start: { x: number; y: number; id: number; horizontal: boolean } | null = null, suppressClick = false;
    const down = (e: PointerEvent) => {
      const target = e.target as Element;
      if (e.isPrimary === false || target.closest('input') || (e.pointerType === 'mouse' && (e.button !== 0 || target.closest('button') || target.closest('a')))) return;
      suppressClick = false;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: false };
    };
    const move = (e: PointerEvent) => {
      if (!start || start.id !== e.pointerId) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) { start.horizontal = true; surface.setPointerCapture?.(e.pointerId); }
      if (start.horizontal) e.preventDefault();
    };
    const up = (e: PointerEvent) => {
      if (!start || start.id !== e.pointerId) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y, horizontal = start.horizontal || (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2);
      start = null;
      suppressClick = horizontal;
      if (horizontal && Math.abs(dx) >= 40) onStep(dx < 0 ? 1 : -1);
    };
    const cancel = () => { start = null; };
    const click = (e: MouseEvent) => { if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; } };
    surface.addEventListener('pointerdown', down);
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', cancel);
    surface.addEventListener('click', click, true);
    return () => {
      surface.removeEventListener('pointerdown', down);
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerup', up);
      surface.removeEventListener('pointercancel', cancel);
      surface.removeEventListener('click', click, true);
    };
  }, [ref, onStep]);
}
