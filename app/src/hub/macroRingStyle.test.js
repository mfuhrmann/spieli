import assert from 'node:assert/strict';
import { macroRingStyleFn } from './macroRingStyle.js';

// Fake OL feature: only `.get(key)` is consulted by macroRingStyleFn.
const feat = (props) => ({ get: (k) => props[k] });

// Each variant resolves to a distinct Style instance.
const offline       = macroRingStyleFn(feat({ _offline: true }));
const importing     = macroRingStyleFn(feat({ _importing: true }));
const filteredEmpty = macroRingStyleFn(feat({ _filteredEmpty: true }));
const degraded      = macroRingStyleFn(feat({ _degraded: true }));
const healthy       = macroRingStyleFn(feat({}));

// 1. Five distinct styles
{
  const styles = [offline, importing, filteredEmpty, degraded, healthy];
  const unique = new Set(styles);
  assert.equal(unique.size, 5, 'expected five distinct macro ring styles');
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

console.log('macroRingStyle.test.js OK');
