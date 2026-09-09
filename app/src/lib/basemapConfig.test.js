// SPDX-FileCopyrightText: 2026 spieli contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Basemap configuration precedence.
//
// config.js reads window.APP_CONFIG at module load, so each case sets the
// global and re-imports with a cache-busting query. That is the only way to
// exercise the precedence rules without a browser, and these rules are exactly
// where a code review found the vector path silently ignoring the operator's
// attribution and the proxy being bypassed by a style URL.
import assert from 'node:assert/strict';

let failures = 0;

async function withConfig(appConfig, fn, label) {
    globalThis.window = { APP_CONFIG: appConfig };
    // The attribution warning fires at module load, so it has to be captured
    // around the import rather than inspected afterwards.
    const realWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(' '));
    let mod;
    try {
        mod = await import(`./config.js?basemap-test=${encodeURIComponent(label)}`);
    } finally {
        console.warn = realWarn;
    }
    try {
        await fn(mod, warnings);
        console.log(`  ok  ${label}`);
    } catch (err) {
        failures += 1;
        console.error(`  FAIL ${label}\n       ${err.message}`);
    } finally {
        delete globalThis.window;
    }
}

const attributionWarnings = (warnings) =>
    warnings.filter((w) => w.includes('basemapAttribution'));

await withConfig({}, (c) => {
    assert.equal(c.basemapStyleUrl, '/basemap/style.json', 'default is the vendored style');
    assert.equal(c.basemapUrl, '', 'no raster default');
    assert.equal(c.basemapIsVector, true, 'default delivery is vector');
    assert.equal(c.basemapUrlIsExplicit, false, 'nothing to fall back to by default');
}, 'unset config uses the vendored vector style');

// Regression guard for the whole point of this change: no commercial keyed
// provider may reappear as a compiled-in default. A keyed provider would also
// reintroduce a per-operator signup, which the federation model cannot carry.
await withConfig({}, (c) => {
    const blob = [c.basemapUrl, c.basemapStyleUrl, c.basemapAttribution].join(' ').toLowerCase();
    for (const banned of ['cartocdn', 'carto.com', 'cartodb']) {
        assert.ok(!blob.includes(banned), `default config must not reference ${banned}`);
    }
    assert.ok(!/[?&](api_?key|access_?token|key)=/i.test(blob),
        'default config must not carry an API key');
}, 'no keyed commercial provider in the defaults');

await withConfig({
    basemapUrl: 'https://tiles.example.org/{z}/{y}/{x}.png',
    basemapAttribution: '&copy; Example',
}, (c) => {
    assert.equal(c.basemapUrl, 'https://tiles.example.org/{z}/{y}/{x}.png');
    assert.equal(c.basemapAttribution, '&copy; Example');
    assert.equal(c.basemapUrlIsExplicit, true, 'operator-set URL is explicit');
    assert.equal(c.basemapIsVector, false);
}, 'a reversed {z}/{y}/{x} template survives verbatim');

await withConfig({
    basemapStyleUrl: '/basemap/style.json',
    basemapAttribution: '&copy; Example',
}, (c) => {
    assert.equal(c.basemapIsVector, true, 'a style selects the vector branch');
    assert.equal(c.basemapStyleUrl, '/basemap/style.json');
}, 'a style URL selects vector rendering');

await withConfig({
    basemapUrl: 'https://raster.example.org/{z}/{x}/{y}.png',
    basemapStyleUrl: 'https://vector.example.org/style.json',
    basemapAttribution: '&copy; Example',
}, (c) => {
    assert.equal(c.basemapIsVector, true, 'style wins when both are set');
    assert.equal(c.basemapUrlIsExplicit, true, 'the raster URL is still available as a fallback');
}, 'style takes precedence over a raster URL');

await withConfig({
    basemapUrl: '/tiles/rastertiles/voyager/{z}/{x}/{y}.png',
    basemapAttribution: '&copy; Example',
}, (c) => {
    assert.equal(c.basemapIsVector, false);
    assert.ok(c.basemapUrl.startsWith('/tiles/'), 'proxied URL stays same-origin');
    assert.ok(!c.basemapUrl.includes('://'), 'proxied URL names no third-party host');
}, 'a proxied same-origin tile path is used as-is');

// Fallback rule: with no raster configured there is nothing to reach for, so
// a failed style leaves the map without a basemap rather than substituting a
// third party the operator never chose.
await withConfig({
    basemapStyleUrl: '/basemap/style.json',
    basemapAttribution: '&copy; Example',
}, (c) => {
    assert.equal(c.basemapUrlIsExplicit, false, 'nothing safe to fall back to');
    assert.equal(c.basemapUrl, '', 'and no raster URL exists to fall back to');
}, 'vector without an explicit raster URL has no fallback');

await withConfig({
    basemapUrl: 'https://raster.example.org/{z}/{x}/{y}.png',
    basemapAttribution: '&copy; Example',
}, (c) => {
    assert.equal(c.basemapIsVector, false, 'an explicit raster URL opts out of vector');
    assert.equal(c.basemapUrlIsExplicit, true, 'and is available as the style fallback');
}, 'an explicit raster URL replaces the vector default');

// ── Whose credit is shown ────────────────────────────────────────────────────
// A tile server declares its own attribution in its TileJSON, and that is
// authoritative — tiles.openfreemap.org and a self-hosted tileserver return
// different, individually correct values. Map.svelte therefore only overrides
// it when the OPERATOR named one. Getting this backwards is not cosmetic: it
// credited OpenFreeMap on a map built from our own Planetiler tiles, which is
// a licence statement about someone who supplied nothing.

await withConfig({}, (c) => {
    assert.equal(c.basemapAttributionIsExplicit, false,
        'nothing configured: let the source speak for itself');
    assert.ok(c.basemapAttribution.length > 0,
        'a default still exists as a last resort for the raster path, which has no TileJSON');
}, 'no operator attribution means the source keeps its own');

await withConfig({ basemapAttribution: '&copy; Stadt Fulda' }, (c) => {
    assert.equal(c.basemapAttributionIsExplicit, true, 'operator value wins');
    assert.equal(c.basemapAttribution, '&copy; Stadt Fulda');
}, 'an operator-set attribution is marked explicit');

// Changing the upstream must NOT by itself change who is credited: with a
// shared cache the upstream is an internal host while the tiles still come
// from the public server, so the hostname says nothing about attribution.
await withConfig({ basemapUpstream: 'http://basemap-cache' }, (c) => {
    assert.equal(c.basemapAttributionIsExplicit, false,
        'an upstream change alone must not be read as an attribution change');
}, 'upstream is not an attribution signal');

await withConfig({}, (c) => {
    assert.ok(c.FALLBACK_OSM_ATTRIBUTION.includes('OpenStreetMap'),
        'the floor must credit OpenStreetMap');
    assert.ok(!/openfreemap|openmaptiles/i.test(c.FALLBACK_OSM_ATTRIBUTION),
        'the floor states only what is true of ANY OSM-derived tileset — naming a '
        + 'specific producer is how the wrong party gets credited');
}, 'the attribution floor is provider-neutral');

// ── Attribution warning ──────────────────────────────────────────────────────
// The warning's own text says "the container entrypoint refuses to start on
// this". That is true for an operator-configured source and deliberately false
// for spieli's own bundled style, so firing it on a default deployment would
// put a false statement in every dev console. It can regress in either
// direction silently, hence both a positive and a negative case.

await withConfig({}, (_c, warnings) => {
    assert.equal(attributionWarnings(warnings).length, 0,
        'the default deployment must not warn: the bundled style ships its own credit');
}, 'no attribution warning for the compiled-in default');

await withConfig({
    basemapStyleUrl: '/basemap/style.local.json',
}, (_c, warnings) => {
    assert.equal(attributionWarnings(warnings).length, 0,
        'a same-origin bundled style is not an operator-configured provider');
}, 'no attribution warning for the same-origin bundled style');

await withConfig({
    basemapStyleUrl: 'https://tiles.example.org/style.json',
}, (_c, warnings) => {
    assert.equal(attributionWarnings(warnings).length, 1,
        'a third-party style with no attribution must warn');
}, 'attribution warning for a third-party style');

// Regression guard: '//host/style.json' starts with '/' but is third-party.
// A naive startsWith('/') check treats it as bundled and stays silent.
await withConfig({
    basemapStyleUrl: '//tiles.example.org/style.json',
}, (_c, warnings) => {
    assert.equal(attributionWarnings(warnings).length, 1,
        'a scheme-relative style URL is third-party, not same-origin');
}, 'attribution warning for a scheme-relative style URL');

await withConfig({
    basemapUrl: 'https://raster.example.org/{z}/{x}/{y}.png',
}, (_c, warnings) => {
    assert.equal(attributionWarnings(warnings).length, 1,
        'a configured raster source with no attribution must warn');
}, 'attribution warning for a raster source');

if (failures) {
    console.error(`basemapConfig.test.js: ${failures} failure(s)`);
    process.exit(1);
}
console.log('basemapConfig.test.js: all assertions passed');
