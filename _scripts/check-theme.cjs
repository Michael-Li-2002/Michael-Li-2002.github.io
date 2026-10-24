// Run after a production Jekyll build: node _scripts/check-theme.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const output = process.argv[2] || '_site';
const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
// Check the generated HTML, where compression previously broke the inline script.
for (const [, attributes, body] of scripts) {
  const type = attributes.match(/\btype=["']([^"']+)["']/i);
  const javascript = !type || ['text/javascript', 'application/javascript', 'module'].includes(type[1]);
  if (!attributes.includes('src=') && javascript) {
    new vm.Script(body);
  }
}
const tag = scripts.find(([, attributes]) => attributes.includes('/assets/js/theme.js?'));
assert(tag, 'The built page must reference the versioned theme script.');
assert(html.indexOf(tag[0]) < html.indexOf('/assets/css/main.css'), 'Apply theme before CSS.');
assert.match(html, /\/assets\/css\/main\.css\?v=\d+/);
const source = fs.readFileSync(path.join(output, 'assets/js/theme.js'), 'utf8');
new vm.Script(source);

function load(saved, dark, blocked = false) {
  const attrs = {}, buttonAttrs = {}, events = {}, mediaEvents = {}, windowEvents = {};
  const system = {matches: dark, addEventListener: (event, handler) => mediaEvents[event] = handler};
  let stored = saved;
  let ready = false;
  const button = {
    setAttribute: (name, value) => buttonAttrs[name] = value,
    addEventListener: (event, handler) => events[event] = handler
  };
  const document = {
    documentElement: {setAttribute: (name, value) => attrs[name] = value, getAttribute: name => attrs[name]},
    querySelector: selector => ready && selector === '.theme-toggle' ? button : null,
    addEventListener: (event, handler) => events[event] = handler
  };
  vm.runInNewContext(source, {
    document,
    window: {matchMedia: () => system, addEventListener: (event, handler) => windowEvents[event] = handler},
    localStorage: {
      getItem() {if (blocked) throw Error('Storage blocked'); return stored;},
      setItem(key, value) {if (blocked) throw Error('Storage blocked'); stored = value;}
    }
  });
  assert(attrs['data-theme'], 'Theme must be set before the body is available.');
  ready = true;
  events.DOMContentLoaded();
  return {attrs, buttonAttrs, events, system, mediaEvents, windowEvents, stored: () => stored};
}

for (const dark of [false, true]) {
  const page = load(null, dark);
  assert.equal(page.attrs['data-theme'], dark ? 'dark' : 'light');
  page.system.matches = !dark;
  page.mediaEvents.change();
  assert.equal(page.attrs['data-theme'], dark ? 'light' : 'dark');
}
for (const theme of ['light', 'dark']) {
  const page = load(theme, theme !== 'dark');
  assert.equal(page.attrs['data-theme'], theme);
  page.mediaEvents.change();
  assert.equal(page.attrs['data-theme'], theme, 'Manual choice overrides system changes.');
  page.events.click();
  assert.notEqual(page.attrs['data-theme'], theme);
  assert.equal(page.buttonAttrs['aria-pressed'], String(page.attrs['data-theme'] === 'dark'));
  assert.equal(load(page.stored(), false).attrs['data-theme'], page.stored(), 'Choice survives navigation.');
}
const blocked = load(null, false, true);
blocked.events.click();
assert.equal(blocked.attrs['data-theme'], 'dark');
const synced = load('invalid', true);
assert.equal(synced.attrs['data-theme'], 'dark');
synced.windowEvents.storage({key: 'jia-li-color-theme', newValue: 'light'});
assert.equal(synced.attrs['data-theme'], 'light');
console.log('PASS: built scripts, cache versions, early theme, system preference, toggle, persistence, blocked storage, and tab sync.');
