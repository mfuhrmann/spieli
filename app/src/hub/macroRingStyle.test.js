import assert from 'node:assert/strict';
import { macroRingStyleFn } from './macroRingStyle.js';

// Fake OL feature: only `.get(key)` is consulted by macroRingStyleFn.
const feat = (props) => ({ get: (k) => props[k] });

// Each variant resolves to a distinct Style instance.
const offline       = macroRingStyleFn(feat({ _offline: true }));
const importing     = macroRingStyleFn(feat({ _importing: true }));
const cantFilter    = macroRingStyleFn(feat({ _cantFilter: true }));
const filteredEmpty = macroRingStyleFn(feat({ _filteredEmpty: true }));
const degraded      = macroRingStyleFn(feat({ _degraded: true }));
const healthy       = macroRingStyleFn(feat({}));

// 1. Six distinct styles
{
  const styles = [offline, importing, cantFilter, filteredEmpty, degraded, healthy];
  const unique = new Set(styles);
  assert.equal(unique.size, 6, 'expected six distinct macro ring styles');
}

// 2. _filteredEmpty maps to its own (grey "no match") style, not degraded/healthy
{
  assert.notEqual(filteredEmpty, degraded, 'no-match must differ from degraded');
  assert.notEqual(filteredEmpty, healthy, 'no-match must differ from healthy');
}

// 3. Backend-health states take precedence over a filter outcome
{
  assert.equal(
    macroRingStyleFn(feat({ _offline: true, _filteredEmpty: true })),
    offline,
    'offline must win over filteredEmpty',
  );
  assert.equal(
    macroRingStyleFn(feat({ _importing: true, _filteredEmpty: true })),
    importing,
    'importing must win over filteredEmpty',
  );
}

// 4. filteredEmpty sits above degraded (no-match outranks no-data)
{
  assert.equal(
    macroRingStyleFn(feat({ _filteredEmpty: true, _degraded: true })),
    filteredEmpty,
    'filteredEmpty must win over degraded',
  );
}

// 5. cantFilter (#688) sits above the filter outcomes but below backend health
{
  assert.equal(
    macroRingStyleFn(feat({ _cantFilter: true, _filteredEmpty: true, _degraded: true })),
    cantFilter,
    'cantFilter must win over filteredEmpty and degraded',
  );
  assert.equal(
    macroRingStyleFn(feat({ _offline: true, _cantFilter: true })),
    offline,
    'offline must win over cantFilter',
  );
  assert.equal(
    macroRingStyleFn(feat({ _importing: true, _cantFilter: true })),
    importing,
    'importing must win over cantFilter',
  );
  assert.notEqual(cantFilter, healthy, 'cantFilter must differ from healthy');
}

console.log('macroRingStyle.test.js OK');
