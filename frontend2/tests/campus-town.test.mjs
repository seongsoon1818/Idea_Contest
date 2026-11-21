import assert from 'node:assert/strict';
import { toSafeUrl, readCampusTownUrl, activateCampusTown, CONFIG_PATH } from '../dist/campus-town.js';

// Minimal DOM stand-in: one card with the disabled button from index.html.
function makeRoot() {
  const button = { tagName: 'BUTTON', replaced: null, replaceWith(node) { this.replaced = node; } };
  return {
    button,
    querySelector: (sel) => (sel === '.campus-town-note .campus-town-btn' ? button : null),
    createElement: (tag) => ({ tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }),
  };
}
const respond = (body, ok = true) => async (path, options) => {
  assert.equal(path, CONFIG_PATH);
  assert.equal(options.cache, 'no-store');
  return { ok, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) };
};

// Only https addresses are accepted.
for (const bad of ['', '   ', 'http://campus.example.com', 'javascript:alert(1)', 'campus.example.com', '//campus.example.com', null, 42]) {
  assert.equal(toSafeUrl(bad), '', String(bad));
  const root = makeRoot();
  assert.equal(activateCampusTown(root, bad), false, String(bad));
  assert.equal(root.button.replaced, null, String(bad));
}

// Config file: empty, missing, broken or non-https values keep the button disabled.
assert.equal(await readCampusTownUrl(respond({ url: '' })), '');
assert.equal(await readCampusTownUrl(respond({}, false)), '');
assert.equal(await readCampusTownUrl(respond('{broken')), '');
assert.equal(await readCampusTownUrl(respond({ url: 'http://campus.example.com' })), '');
assert.equal(await readCampusTownUrl(async () => { throw new Error('offline'); }), '');
assert.equal(await readCampusTownUrl(respond({ url: ' https://campus.example.com/town ' })), 'https://campus.example.com/town');

const root = makeRoot();
assert.equal(activateCampusTown(root, 'https://campus.example.com/town'), true);
const link = root.button.replaced;
assert.equal(link.tag, 'a');
assert.equal(link.href, 'https://campus.example.com/town');
assert.equal(link.target, '_blank');
assert.equal(link.rel, 'noopener noreferrer');
assert.equal(link.className, 'campus-town-btn');

console.log('CAMPUS TOWN card: campus-town.json url read without cache; empty/invalid/missing stays disabled, https opens a new tab');
