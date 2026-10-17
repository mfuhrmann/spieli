import assert from 'node:assert/strict';
import { coverageAt, isCovered } from './dataCoverage.js';

const fulda = { url: '/api', bbox: [9.5, 50.4, 10.0, 50.7] };
const kassel = { url: '/api-k', bbox: [9.3, 51.2, 9.6, 51.4] };

assert.deepEqual(coverageAt([fulda, kassel], 9.67, 50.55), [fulda]);
assert.deepEqual(coverageAt([fulda, kassel], 8.68, 50.11), []);
assert.deepEqual(coverageAt(null, 9.67, 50.55), []);
assert.deepEqual(coverageAt([{ url: '/x', bbox: null }], 9.67, 50.55), []);

assert.equal(isCovered([fulda], 9.67, 50.55), true);
assert.equal(isCovered([fulda], 8.68, 50.11), false);   // Frankfurt from a Fulda map
// Unknown coverage fails open: the flow behaves as before.
assert.equal(isCovered(null, 8.68, 50.11), true);
assert.equal(isCovered([], 8.68, 50.11), true);

console.log('dataCoverage tests passed');
