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
    const mod = await import(`./config.js?basemap-test=${encodeURIComponent(label)}`);
    try {
        await fn(mod);
        console.log(`  ok  ${label}`);
    } catch (err) {
        failures += 1;
        console.error(`  FAIL ${label}\n       ${err.message}`);
    } finally {
        delete globalThis.window;
    }
}

const CARTO = 'basemaps.cartocdn.com';

await withConfig({}, (c) => {
    assert.ok(c.basemapUrl.includes(CARTO), 'default raster URL is the CARTO template');
    assert.equal(c.basemapStyleUrl, '', 'no style configured by default');
    assert.equal(c.basemapIsVector, false, 'default delivery is raster');
    assert.equal(c.basemapUrlIsExplicit, false, 'compiled-in default is not explicit');
}, 'unset config falls back to the CARTO raster default');

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

// Regression guard for the fallback rule: falling back to the compiled-in
// CARTO default would send visitors to a third party an operator running
// vector tiles may have chosen vector specifically to avoid.
await withConfig({
    basemapStyleUrl: '/basemap/style.json',
    basemapAttribution: '&copy; Example',
}, (c) => {
    assert.equal(c.basemapUrlIsExplicit, false,
        'with no operator-set raster URL there is nothing safe to fall back to');
    assert.ok(c.basemapUrl.includes(CARTO),
        'the default is still exposed, but callers must gate on basemapUrlIsExplicit');
}, 'vector without an explicit raster URL has no safe fallback');

if (failures) {
    console.error(`basemapConfig.test.js: ${failures} failure(s)`);
    process.exit(1);
}
console.log('basemapConfig.test.js: all assertions passed');
