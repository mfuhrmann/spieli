// Macro-tier filter aggregation in the hub orchestrator (#690).
//
// `macroAggregate.test.js` covers the pure per-backend sum and ring
// derivation. This covers what lives in the async, fanOut-coupled
// `orchestrateMacroFilter`: accumulation across backends, the per-backend
// bbox the cluster RPC is asked for, the can't-filter / 404 fallback, the
// abort guard — and P12, that leaving the polygon tier for macro after the
// filters were cleared cannot paint the previous filter's rings.
//
// Drives the real `attachHubOrchestrator` against a fake map and a stubbed
// `fetch`; no OL map, DOM or canvas.

import assert from 'node:assert/strict';
import { get, writable } from 'svelte/store';
import { attachHubOrchestrator } from './hubOrchestrator.js';
import { activeTierStore } from '../stores/tier.js';
import { macroFilteredStore } from '../stores/macroFiltered.js';
import { macroCoverageStore } from '../stores/macroCoverage.js';
import { macroMaxZoom } from '../lib/config.js';

const NO_FILTER = { showComplete: true, showPartial: true, showMissing: true, water: false };
const WATER     = { ...NO_FILTER, water: true };

const A = { url: 'https://a.example/api', bbox: [9.0, 50.0, 10.0, 51.0] };
const B = { url: 'https://b.example/api', bbox: [11.0, 48.0, 12.0, 49.0] };

// ── harness ─────────────────────────────────────────────────────────────────

// `fetch` stub: every call is recorded; the reply comes from `respond(url)`,
// which returns `{ status, body }` or a promise of one. Like the real fetch it
// rejects as soon as its signal aborts, so superseded runs and per-backend
// timeouts reach the orchestrator as failed entries, not as late successes.
let calls = [];
let respond = () => ({ status: 200, body: [] });
globalThis.fetch = async (url, { signal } = {}) => {
  calls.push(new URL(url));
  const aborted = new Promise((_, reject) => {
    const fail = () => reject(new DOMException('aborted', 'AbortError'));
    if (signal?.aborted) fail();
    else signal?.addEventListener('abort', fail, { once: true });
  });
  const { status, body } = await Promise.race([respond(url), aborted]);
  return { ok: status >= 200 && status < 300, status, json: async () => body };
};

function attach({ backends, filters, zoom = macroMaxZoom }) {
  const state = { zoom, filters };
  const view = {
    getZoom: () => state.zoom,
    getResolution: () => 1000,
    // A viewport far from every backend: the cluster/polygon tiers select
    // nothing and fetch nothing, so only the macro path talks to `fetch`.
    calculateExtent: () => [-20e6, -20e6, -19e6, -19e6],
  };
  const map = { getView: () => view, getSize: () => [800, 600], on() {}, un() {} };
  const source = { clear() {}, addFeatures() {}, removeFeatures() {} };
  const orch = attachHubOrchestrator({
    map,
    backendsStore: writable(backends),
    clusterSource: source,
    polygonSource: source,
    getFilters: () => state.filters,
  });
  return { state, orch };
}

// Let every pending fetch/fanOut continuation run. Several macrotask turns,
// so a reply chain that gains a timer hop still settles before asserting.
const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0));
};

// Warnings are captured, not silenced: each test asserts the ones it expects,
// and reset() fails on any left over.
const warnings = [];
const warn = console.warn;
console.warn = (...args) => warnings.push(args.join(' '));

function reset() {
  assert.deepEqual(warnings.splice(0), [], 'unexpected console.warn');
  calls = [];
  respond = () => ({ status: 200, body: [] });
  macroFilteredStore.set(null);
  macroCoverageStore.set(null);
  activeTierStore.set(null);
}


// ── 1. No active filter: zero-fetch, both stores null ───────────────────────
{
  reset();
  macroFilteredStore.set(new Map([[A.url, { count: 1, complete: 1, partial: 0, missing: 0 }]]));
  const { orch } = attach({ backends: [A, B], filters: NO_FILTER });
  await settle();
  assert.equal(get(activeTierStore), 'macro');
  assert.equal(get(macroFilteredStore), null);
  assert.equal(get(macroCoverageStore), null);
  assert.equal(calls.length, 0, 'macro tier without a filter fetches nothing');
  orch.detach();
}

// ── 2. Accumulation across backends, per-backend bbox, coarsest zoom ────────
{
  reset();
  respond = (url) => url.startsWith(A.url)
    ? { status: 200, body: [{ count: 3, complete: 1, partial: 1, missing: 1 }, { count: 2, complete: 2 }] }
    : { status: 200, body: [{ count: 4, complete: 0, partial: 4, missing: 0 }] };
  const published = [];
  const unsub = macroFilteredStore.subscribe(v => published.push(v));
  const { orch } = attach({ backends: [A, B], filters: WATER });
  await settle();
  unsub();

  const m = get(macroFilteredStore);
  assert.deepEqual(m.get(A.url), { count: 5, complete: 3, partial: 1, missing: 1 });
  assert.deepEqual(m.get(B.url), { count: 4, complete: 0, partial: 4, missing: 0 });
  assert.deepEqual(get(macroCoverageStore), { answered: 2, total: 2, cantFilter: [], settling: false });

  // Each backend is queried over its OWN bbox (not the viewport), at
  // macroMaxZoom, with the active filter.
  assert.equal(calls.length, 2);
  for (const backend of [A, B]) {
    const q = calls.find(u => u.href.startsWith(backend.url)).searchParams;
    assert.equal(q.get('z'), String(macroMaxZoom));
    assert.equal(q.get('filter_water'), 'true');
    const got = ['min_lon', 'min_lat', 'max_lon', 'max_lat'].map(k => Number(q.get(k)));
    got.forEach((v, i) => assert.ok(Math.abs(v - backend.bbox[i]) < 1e-9, `${backend.url} bbox[${i}]: ${v}`));
  }

  // Every publish is a fresh Map, or Svelte subscribers would not re-render.
  const maps = published.filter(v => v instanceof Map);
  assert.equal(maps.length, 3, 'empty Map + one publish per backend');
  assert.equal(new Set(maps).size, maps.length);
  orch.detach();
}

// ── 3. Offline peers are out of scope; a peer without a bbox can't filter ───
{
  reset();
  respond = () => ({ status: 200, body: [{ count: 1, complete: 1, partial: 0, missing: 0 }] });
  const offline = { url: 'https://down.example/api', bbox: [0, 0, 1, 1], healthUp: false };
  const noBbox  = { url: 'https://nobbox.example/api', bbox: null };
  const { orch } = attach({ backends: [A, offline, noBbox], filters: WATER });
  await settle();
  assert.deepEqual(get(macroCoverageStore), { answered: 1, total: 2, cantFilter: [noBbox.url], settling: false });
  assert.deepEqual([...get(macroFilteredStore).keys()], [A.url]);
  assert.deepEqual(calls.map(u => u.origin), ['https://a.example']);
  orch.detach();
}

// ── 4. Nothing filterable: terminal coverage straight away, no fetch ────────
{
  reset();
  const { orch } = attach({ backends: [{ url: 'https://nobbox.example/api', bbox: null }], filters: WATER });
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(get(macroFilteredStore).size, 0);
  assert.deepEqual(get(macroCoverageStore), {
    answered: 0, total: 1, cantFilter: ['https://nobbox.example/api'], settling: false,
  });
  orch.detach();
}

// ── 5. 404 → can't filter, sticky; 500 → can't filter, retried next run ─────
{
  reset();
  respond = (url) => url.startsWith(A.url) ? { status: 404, body: null } : { status: 500, body: null };
  const { orch } = attach({ backends: [A, B], filters: WATER });
  await settle();
  assert.deepEqual([...get(macroCoverageStore).cantFilter].sort(), [A.url, B.url]);
  assert.equal(get(macroFilteredStore).size, 0);
  // The 404 warns once (it makes the fallback sticky); the 500 is silent.
  assert.equal(warnings.length, 1);
  assert.match(warnings.splice(0)[0], new RegExp(`${A.url} returned 404`));

  // Next run: the 404 peer is can't-filter from the start and not asked
  // again (pre-tier backend); the 500 peer was a transient error and is.
  calls = [];
  respond = () => ({ status: 200, body: [{ count: 2, complete: 2, partial: 0, missing: 0 }] });
  orch.rerun();
  await settle();
  assert.deepEqual(calls.map(u => u.origin), ['https://b.example']);
  assert.deepEqual(get(macroCoverageStore), { answered: 1, total: 2, cantFilter: [A.url], settling: false });
  assert.deepEqual(get(macroFilteredStore).get(B.url), { count: 2, complete: 2, partial: 0, missing: 0 });
  orch.detach();
}

// ── 6. A superseded run publishes nothing when its replies arrive late ──────
{
  reset();
  let release;
  const late = new Promise(r => { release = r; });
  respond = () => late.then(() => ({ status: 200, body: [{ count: 9, complete: 9, partial: 0, missing: 0 }] }));
  const { state, orch } = attach({ backends: [A], filters: WATER });
  await settle();
  assert.equal(get(macroCoverageStore).settling, true);

  state.filters = NO_FILTER;
  orch.rerun();
  assert.equal(get(macroFilteredStore), null);
  release();
  await settle();
  assert.equal(get(macroFilteredStore), null, 'aborted run must not repopulate the store');
  assert.equal(get(macroCoverageStore), null, 'aborted run must not republish coverage');
  orch.detach();
}

// ── 6b. Filter X → filter Y: X's late replies must not land under Y ─────────
{
  reset();
  let release;
  const late = new Promise(r => { release = r; });
  respond = (url) => url.includes('filter_water')
    ? late.then(() => ({ status: 200, body: [{ count: 9, complete: 9, partial: 0, missing: 0 }] }))
    : { status: 200, body: [{ count: 2, complete: 1, partial: 1, missing: 0 }] };
  const { state, orch } = attach({ backends: [A], filters: WATER });
  await settle();

  state.filters = { ...NO_FILTER, baby: true };
  orch.rerun();
  await settle();
  release();
  await settle();
  assert.deepEqual(get(macroFilteredStore).get(A.url), { count: 2, complete: 1, partial: 1, missing: 0 });
  assert.deepEqual(get(macroCoverageStore), { answered: 1, total: 1, cantFilter: [], settling: false },
    "the aborted water run must not mark A can't-filter");
  orch.detach();
}

// ── 7. P12: filters cleared at the polygon tier, then zoom out to macro ─────
// The macro layer is visible only while activeTierStore is 'macro' (Map.svelte)
// and HubApp does not rerun the orchestrator for a filter change at the
// polygon tier, so the previous filter's aggregate is still in the store when
// the user zooms out. That is harmless only if the tier flip and the store
// reset happen in the same synchronous stretch: OL draws on the next
// animation frame, so no frame can show the stale rings. Asserted here
// without awaiting `rerun()` — an `await` slipped in between would fail it.
{
  reset();
  respond = () => ({ status: 200, body: [{ count: 1, complete: 1, partial: 0, missing: 0 }] });
  const { state, orch } = attach({ backends: [A], filters: WATER });
  await settle();
  assert.ok(get(macroFilteredStore).has(A.url));

  state.zoom = 15;
  orch.rerun();
  await settle();
  assert.equal(get(activeTierStore), 'polygon');

  state.filters = NO_FILTER;  // cleared at the polygon tier: no rerun (HubApp)
  state.zoom = macroMaxZoom;  // zoom out — the moveend runs orchestrate()
  orch.rerun();
  assert.equal(get(activeTierStore), 'macro');
  assert.equal(get(macroFilteredStore), null);
  assert.equal(get(macroCoverageStore), null);
  orch.detach();
}

reset();
console.warn = warn;
console.log('hubOrchestrator.macro.test.js OK');
