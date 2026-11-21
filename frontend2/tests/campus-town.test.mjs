import assert from 'node:assert/strict';

// Minimal DOM stand-in: one card with the disabled button from index.html.
function makeRoot() {
  const button = { replaced: null, replaceWith(node) { this.replaced = node; } };
  return {
    button,
    querySelector: (sel) => (sel === '.campus-town-note .campus-town-btn' ? button : null),
    createElement: (tag) => ({ tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }),
  };
}

globalThis.document = makeRoot();
const { toSafeUrl, activateCampusTown, CAMPUS_TOWN_URL_SETTING } = await import('../dist/campus-town.js');

// Default setting is empty: the disabled button stays.
assert.equal(CAMPUS_TOWN_URL_SETTING, '');
assert.equal(globalThis.document.button.replaced, null);

for (const bad of ['', '   ', 'http://campus.example.com', 'javascript:alert(1)', 'campus.example.com', '//campus.example.com']) {
  assert.equal(toSafeUrl(bad), '', bad);
  const root = makeRoot();
  assert.equal(activateCampusTown(root, bad), false, bad);
  assert.equal(root.button.replaced, null, bad);
}

const root = makeRoot();
assert.equal(activateCampusTown(root, ' https://campus.example.com/town '), true);
const link = root.button.replaced;
assert.equal(link.tag, 'a');
assert.equal(link.href, 'https://campus.example.com/town');
assert.equal(link.target, '_blank');
assert.equal(link.rel, 'noopener noreferrer');
assert.equal(link.className, 'campus-town-btn');

console.log('CAMPUS TOWN card: empty/invalid URLs stay disabled, https opens in a new tab with noopener');
