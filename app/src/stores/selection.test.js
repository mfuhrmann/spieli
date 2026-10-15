// History handling of the selection store (#997): opening a panel pushes one
// entry so the phone's back gesture closes it. Runs against a fake history
// whose back() delivers popstate asynchronously, as browsers do.
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

const listeners = [];
const entries = [{ state: null, url: '/' }];
let index = 0;
const loc = { pathname: '/', search: '', hash: '' };

function setUrl(url) {
  const [path, hash = ''] = url.split('#');
  if (url.startsWith('#')) { loc.hash = url; return; }
  loc.pathname = path;
  loc.hash = hash ? `#${hash}` : '';
}
function href() { return loc.pathname + loc.search + loc.hash; }

globalThis.history = {
  get state() { return entries[index].state; },
  get length() { return entries.length; },
  pushState(state, _t, url) {
    entries.splice(index + 1);
    setUrl(url);
    entries.push({ state, url: href() });
    index++;
  },
  replaceState(state, _t, url) {
    setUrl(url);
    entries[index] = { state, url: href() };
  },
  back() {
    setTimeout(() => {
      if (index === 0) return;
      index--;
      setUrl(entries[index].url);
      listeners.forEach(fn => fn());
    }, 0);
  },
};
globalThis.window = {
  location: loc,
  addEventListener(type, fn) { if (type === 'popstate') listeners.push(fn); },
};

const { selection } = await import('./selection.js');

const tick = () => new Promise(r => setTimeout(r, 5));
const feature = (id) => ({ get: k => (k === 'osm_id' ? id : null) });

function reset() {
  entries.splice(0, entries.length, { state: null, url: '/' });
  index = 0;
  setUrl('/');
}

const tests = {
  'opening pushes one entry; back closes the panel'() {
    reset();
    selection.select(feature(1), '');
    assert.equal(entries.length, 2);
    assert.equal(loc.hash, '#W1');
    history.back();
    return tick().then(() => {
      assert.equal(get(selection).feature, null);
      assert.equal(loc.hash, '');
    });
  },

  'switching selection while open replaces the entry'() {
    reset();
    selection.select(feature(1), '');
    selection.select(feature(2), '');
    assert.equal(entries.length, 2);
    assert.equal(loc.hash, '#W2');
    selection.clear();
    return tick().then(() => assert.equal(index, 0));
  },

  'in-app close pops the entry'() {
    reset();
    selection.select(feature(1), '');
    selection.clear();
    assert.equal(get(selection).feature, null);
    return tick().then(() => {
      assert.equal(index, 0);
      assert.equal(loc.hash, '');
    });
  },

  'clear then select in one turn keeps the new panel open'() {
    reset();
    selection.select(feature(1), '');
    selection.clear();
    selection.select(feature(2), '');
    return tick().then(() => {
      assert.equal(get(selection).feature.get('osm_id'), 2);
      assert.equal(index, 1);
      assert.equal(loc.hash, '#W2');
      assert.equal(history.state?.spieliPanel, true);
    });
  },

  'a deeplink load gets a hash-free map entry underneath'() {
    reset();
    setUrl('/#W7');
    entries[0] = { state: null, url: '/#W7' };
    selection.select(feature(7), '');
    assert.equal(entries[0].url, '/');
    assert.equal(entries[1].url, '/#W7');
  },

  'back runs the registered handler'() {
    reset();
    let ran = 0;
    const detach = selection.setBackHandler(() => { ran++; selection.clear(); });
    selection.select(feature(1), '');
    history.back();
    return tick().then(() => {
      detach();
      assert.equal(ran, 1);
      assert.equal(get(selection).feature, null);
    });
  },
};

for (const [name, fn] of Object.entries(tests)) {
  await fn();
  console.log(`ok - ${name}`);
}
