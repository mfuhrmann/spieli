import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { modalOpen, modal } from './modalOpen.js';

// Nested dialogs: closing the inner one must not release the map (#758).
assert.equal(get(modalOpen), false);
const outer = modal();
assert.equal(get(modalOpen), true);
const inner = modal();
inner.destroy();
assert.equal(get(modalOpen), true, 'outer dialog still open');
outer.destroy();
assert.equal(get(modalOpen), false);
// An extra destroy cannot drive the count negative and wedge it closed.
outer.destroy();
const again = modal();
assert.equal(get(modalOpen), true);
again.destroy();
assert.equal(get(modalOpen), false);

console.log('modalOpen.test.js: all assertions passed');
