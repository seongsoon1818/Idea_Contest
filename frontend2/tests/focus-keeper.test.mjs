import assert from 'node:assert/strict';
import { focusKey, restoreFocus } from '../dist/focus-keeper.js';

// Small element stand-in: attributes, a parent chain for closest(), and focus().
function el(attrs = {}, parentSelector = '#main', tag = 'button') {
  const node = {
    id: attrs.id || '', isConnected: true, attrs,
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    closest: (sel) => (sel === parentSelector ? {} : null),
    matches: (sel) => sel === 'a.nav-item' && tag === 'a' && attrs.class === 'nav-item',
    focus() { doc.activeElement = node; },
  };
  return node;
}
const doc = { body: {}, activeElement: null, regions: {}, querySelector: (root) => doc.regions[root] || null };

// Keys: id, nav link, action+id, category/compare/tab, bare action; outside redrawn regions → null.
assert.deepEqual(focusKey(el({ id: 'search-input' })), { root: '#main', selector: '#search-input' });
assert.deepEqual(focusKey(el({ class: 'nav-item', href: '#notices' }, '.desktop-nav', 'a')), { root: '.desktop-nav', selector: 'a.nav-item[href="#notices"]' });
assert.deepEqual(focusKey(el({ 'data-action': 'save', 'data-id': 'p"1' })), { root: '#main', selector: '[data-action="save"][data-id="p\\"1"]' });
assert.deepEqual(focusKey(el({ 'data-category': 'scholarship' })), { root: '#main', selector: '[data-category="scholarship"]' });
assert.deepEqual(focusKey(el({ 'data-compare': 'n1' })), { root: '#main', selector: '[data-compare="n1"]' });
assert.deepEqual(focusKey(el({ 'data-action': 'compare' }, '#compare-tray')), { root: '#compare-tray', selector: '[data-action="compare"]' });
assert.equal(focusKey(el({ id: 'x' }, '#modal')), null);
assert.equal(focusKey(null), null);

// Restore only when focus fell back to <body>; never override a deliberate focus move.
const redrawn = el({ class: 'nav-item', href: '#notices' }, '.desktop-nav', 'a');
doc.regions['.desktop-nav'] = { querySelector: (sel) => (sel === 'a.nav-item[href="#notices"]' ? redrawn : null) };
const key = { root: '.desktop-nav', selector: 'a.nav-item[href="#notices"]' };
doc.activeElement = doc.body;
assert.equal(restoreFocus(doc, key), true);
assert.equal(doc.activeElement, redrawn);
const elsewhere = el({ id: 'modal-title' }, '#modal');
doc.activeElement = elsewhere;
assert.equal(restoreFocus(doc, key), false);
assert.equal(doc.activeElement, elsewhere);
doc.activeElement = doc.body;
assert.equal(restoreFocus(doc, { root: '.desktop-nav', selector: '#missing' }), false);
assert.equal(restoreFocus(doc, null), false);

console.log('Focus keeper: redrawn menu, filter, save, compare and search controls keep focus; deliberate moves are kept');
