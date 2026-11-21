// Keeps keyboard focus when a screen is redrawn (frontend3 behaves the same way).
// The app rebuilds the menu, page and compare tray with innerHTML, which removes the control that had focus.
// If that happens and focus falls back to <body>, focus the redrawn control with the same identity.
const ROOTS = ['.desktop-nav', '.mobile-nav', '#main', '#compare-tray', '.topbar'];
const ATTRS = ['data-category', 'data-compare', 'data-tab'];

const quote = (value) => '"' + String(value).replace(/["\\]/g, '\\$&') + '"';

// Returns {root, selector} describing el inside one of the redrawn regions, or null.
export function focusKey(el) {
  if (!el || typeof el.closest !== 'function') return null;
  const root = ROOTS.find((r) => el.closest(r));
  if (!root) return null;
  const get = (name) => el.getAttribute?.(name);
  let selector = null;
  if (el.id) selector = '#' + el.id;
  else if (el.matches?.('a.nav-item') && get('href')) selector = `a.nav-item[href=${quote(get('href'))}]`;
  else if (get('data-action') && get('data-id')) selector = `[data-action=${quote(get('data-action'))}][data-id=${quote(get('data-id'))}]`;
  else {
    const attr = ATTRS.find((name) => get(name) != null);
    if (attr) selector = `[${attr}=${quote(get(attr))}]`;
    else if (get('data-action')) selector = `[data-action=${quote(get('data-action'))}]`;
  }
  return selector ? { root, selector } : null;
}

export function restoreFocus(doc, key) {
  if (!key) return false;
  const active = doc.activeElement;
  if (active && active !== doc.body && active.isConnected !== false) return false; // focus was moved on purpose
  const target = doc.querySelector(key.root)?.querySelector(key.selector);
  if (!target) return false;
  target.focus({ preventScroll: true });
  return doc.activeElement === target;
}

export function keepFocus(doc = document) {
  if (typeof MutationObserver !== 'function') return null;
  let last = null, key = null;
  doc.addEventListener('focusin', (e) => { last = e.target; key = focusKey(e.target); }, true);
  // A blur that leaves the control in the page (clicking empty space, switching windows) is the user's choice:
  // forget it so a later redraw does not pull focus back.
  doc.addEventListener('focusout', (e) => {
    const target = e.target;
    queueMicrotask(() => { if (target === last && target.isConnected) key = null; });
  }, true);
  const observer = new MutationObserver(() => {
    if (last && !last.isConnected && key && restoreFocus(doc, key)) { last = doc.activeElement; }
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  return observer;
}

if (typeof document !== 'undefined' && document.body) keepFocus(document);
