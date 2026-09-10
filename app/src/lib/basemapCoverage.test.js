// SPDX-FileCopyrightText: 2026 spieli contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The rule behind the out-of-coverage notice (#847). Tested here rather than
// in a browser because every attempt to exercise it through the running app
// was confounded by something else moving the view — MAP_MIN_ZOOM clamping a
// requested zoom, and StandaloneApp fitting to the configured region on load.
// The wiring is verified in a browser; the rule is verified here.
import assert from 'node:assert/strict';
import {
    parseCoverageBbox, isOutsideCoverage, BASEMAP_COVERAGE_DETAIL_ZOOM,
} from './basemapCoverage.js';

let failures = 0;
function t(label, fn) {
    try { fn(); console.log(`  ok  ${label}`); }
    catch (err) { failures += 1; console.error(`  FAIL ${label}\n       ${err.message}`); }
}

const DE_CZ_SK = [5.8, 47.2, 22.6, 55.1];
const FULDA = [9.6808, 50.5558];
const PARIS = [2.3522, 48.8566];

t('unset coverage never claims anything', () => {
    assert.equal(isOutsideCoverage(null, PARIS, 12), null);
});

t('inside the covered area is not flagged', () => {
    assert.equal(isOutsideCoverage(DE_CZ_SK, FULDA, 12), false);
});

t('outside the covered area at detail zoom is flagged', () => {
    assert.equal(isOutsideCoverage(DE_CZ_SK, PARIS, 12), true);
});

// The whole point of the zoom threshold: below it the tileset still renders
// global context, so an outside view is not blank and a notice would be a lie.
t('outside but below the detail zoom is not flagged', () => {
    assert.equal(isOutsideCoverage(DE_CZ_SK, PARIS, BASEMAP_COVERAGE_DETAIL_ZOOM - 1), false);
});

t('the threshold itself counts as detail zoom', () => {
    assert.equal(isOutsideCoverage(DE_CZ_SK, PARIS, BASEMAP_COVERAGE_DETAIL_ZOOM), true);
});

t('a centre just inside an edge is not flagged', () => {
    assert.equal(isOutsideCoverage(DE_CZ_SK, [5.81, 47.21], 12), false);
    assert.equal(isOutsideCoverage(DE_CZ_SK, [22.59, 55.09], 12), false);
});

t('a centre just outside an edge is flagged', () => {
    assert.equal(isOutsideCoverage(DE_CZ_SK, [5.79, 50.0], 12), true);
    assert.equal(isOutsideCoverage(DE_CZ_SK, [12.0, 55.11], 12), true);
});

t('missing or nonsense inputs say nothing rather than guess', () => {
    assert.equal(isOutsideCoverage(DE_CZ_SK, FULDA, undefined), null);
    assert.equal(isOutsideCoverage(DE_CZ_SK, null, 12), null);
    assert.equal(isOutsideCoverage(DE_CZ_SK, [NaN, NaN], 12), null);
});

t('bbox parsing accepts a well-formed value', () => {
    assert.deepEqual(parseCoverageBbox('5.8,47.2,22.6,55.1'), DE_CZ_SK);
    assert.deepEqual(parseCoverageBbox(' 5.8 , 47.2 , 22.6 , 55.1 '), DE_CZ_SK);
});

// A typo must cost the notice, never the map.
t('bbox parsing rejects malformed values instead of throwing', () => {
    for (const bad of ['', '   ', 'not,a,bbox', '1,2,3', '1,2,3,4,5',
                       '22.6,47.2,5.8,55.1',   // min >= max longitude
                       '5.8,55.1,22.6,47.2',   // min >= max latitude
                       '-200,47.2,22.6,55.1',  // off the globe
                       null, undefined, 42, {}]) {
        assert.equal(parseCoverageBbox(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
});

if (failures) {
    console.error(`basemapCoverage.test.js: ${failures} failure(s)`);
    process.exit(1);
}
console.log('basemapCoverage.test.js: all assertions passed');
