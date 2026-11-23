import assert from 'node:assert/strict';
import { shadeState } from './shade.js';

// raw tag wins, including partial, which has_shade reports as false (#1072)
assert.equal(shadeState({ shade: 'partial', has_shade: false }), 'partial');
assert.equal(shadeState({ shade: 'yes', has_shade: true }), 'yes');
assert.equal(shadeState({ shade: 'no', has_shade: false }), 'no');
assert.equal(shadeState({ shade: ' Partial ' }), 'partial');
// no raw tag: fall back to the server flag
assert.equal(shadeState({ has_shade: true }), 'yes');
assert.equal(shadeState({ has_shade: false }), 'no');
// unknown raw value: fall back, never invent
assert.equal(shadeState({ shade: 'umbrella', has_shade: false }), 'no');
assert.equal(shadeState({ shade: 'umbrella' }), null);
// nothing recorded
assert.equal(shadeState({ has_shade: null }), null);
assert.equal(shadeState({}), null);
assert.equal(shadeState(null), null);

console.log('shade.test.js: all assertions passed');
