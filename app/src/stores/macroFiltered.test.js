import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { macroFilteredStore } from './macroFiltered.js';

// 1. Default is null (no filter active → MacroView uses cached meta)
{
  assert.equal(get(macroFilteredStore), null);
}

// 2. Holds a per-backend aggregate Map when set
{
  const m = new Map([
    ['https://a.example/api', { count: 12, complete: 5, partial: 4, missing: 3 }],
  ]);
  macroFilteredStore.set(m);
  assert.equal(get(macroFilteredStore), m);
  assert.deepEqual(get(macroFilteredStore).get('https://a.example/api'), {
    count: 12, complete: 5, partial: 4, missing: 3,
  });
  // Reset so the store doesn't leak state into other suites sharing the module.
  macroFilteredStore.set(null);
  assert.equal(get(macroFilteredStore), null);
}

console.log('macroFiltered.test.js OK');
