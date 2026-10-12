import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createMappingDetailStore, parseDetailParam, withDetailParam } from './mappingDetail.js';
import { effectiveFilters, defaultFilters } from './filters.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

const throwingStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
};

function fakeLocation(href) {
  const loc = { href, search: new URL(href).search };
  const history = {
    state: null,
    replaceState(_s, _t, url) { loc.href = url; loc.search = new URL(url).search; },
  };
  return { location: loc, history };
}

// --- parseDetailParam ---
assert.equal(parseDetailParam('?detail=1'), true);
assert.equal(parseDetailParam('?detail=0'), false);
assert.equal(parseDetailParam('?detail=yes'), null);
assert.equal(parseDetailParam(''), null);
assert.equal(parseDetailParam('?other=1&detail=1'), true);

// --- withDetailParam keeps path, other params and hash ---
assert.equal(
  withDetailParam('https://x.test/fulda?a=b&detail=1#W123', false),
  'https://x.test/fulda?a=b&detail=0#W123',
);

// 1. Default off with no storage, no parameter
{
  const s = createMappingDetailStore({ storage: memoryStorage() });
  assert.equal(get(s), false);
}

// 2. Persistence round-trip
{
  const storage = memoryStorage();
  createMappingDetailStore({ storage }).set(true);
  assert.equal(get(createMappingDetailStore({ storage })), true);
}

// 3. Throwing storage: off, toggle still works for the session
{
  const s = createMappingDetailStore({ storage: throwingStorage });
  assert.equal(get(s), false);
  s.toggle();
  assert.equal(get(s), true);
}

// 4. Parameter overrides the stored preference without writing it
{
  const storage = memoryStorage({ 'spieli.mappingDetail': '1' });
  const { location, history } = fakeLocation('https://x.test/?detail=0');
  const s = createMappingDetailStore({ storage, location, history });
  assert.equal(get(s), false);
  assert.equal(storage.data['spieli.mappingDetail'], '1');
}

// 5. Invalid parameter is ignored → stored preference applies
{
  const storage = memoryStorage({ 'spieli.mappingDetail': '1' });
  const { location, history } = fakeLocation('https://x.test/?detail=maybe');
  assert.equal(get(createMappingDetailStore({ storage, location, history })), true);
}

// 6. Toggle with a parameter present rewrites it and persists
{
  const storage = memoryStorage();
  const { location, history } = fakeLocation('https://x.test/fulda?detail=1#W123');
  const s = createMappingDetailStore({ storage, location, history });
  assert.equal(get(s), true);
  s.toggle();
  assert.equal(get(s), false);
  assert.equal(location.href, 'https://x.test/fulda?detail=0#W123');
  assert.equal(storage.data['spieli.mappingDetail'], '0');
}

// 7. Toggle without a parameter leaves the URL clean
{
  const { location, history } = fakeLocation('https://x.test/fulda#W123');
  const s = createMappingDetailStore({ storage: memoryStorage(), location, history });
  s.set(true);
  assert.equal(location.href, 'https://x.test/fulda#W123');
}

// --- effectiveFilters ---
{
  const hidden = { ...defaultFilters, showMissing: false, water: true };
  const off = effectiveFilters(hidden, false);
  assert.equal(off.showMissing, true);
  assert.equal(off.water, true, 'non-completeness filters still apply while off');
  assert.equal(hidden.showMissing, false, 'stored value untouched');
  assert.equal(effectiveFilters(hidden, true).showMissing, false, 'restored when on');
}

console.log('mappingDetail tests passed.');
