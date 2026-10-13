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
// A repeated destroy is ignored, even while another dialog is open — it must
// not release that one.
outer.destroy();
const a = modal();
const b = modal();
b.destroy();
b.destroy();
assert.equal(get(modalOpen), true, 'a double destroy released the other dialog');
a.destroy();
assert.equal(get(modalOpen), false);
const again = modal();
assert.equal(get(modalOpen), true);
again.destroy();
assert.equal(get(modalOpen), false);

console.log('modalOpen.test.js: all assertions passed');
