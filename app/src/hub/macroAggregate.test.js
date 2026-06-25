/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict';
import { sumClusterBuckets, deriveMacroRing } from './macroAggregate.js';

// ── sumClusterBuckets ───────────────────────────────────────────────────────

// 1. Empty / null / undefined bucket lists sum to all-zeros.
{
  const zero = { count: 0, complete: 0, partial: 0, missing: 0 };
  assert.deepEqual(sumClusterBuckets([]), zero);
  assert.deepEqual(sumClusterBuckets(null), zero);
  assert.deepEqual(sumClusterBuckets(undefined), zero);
}

// 2. Multi-bucket accumulation across all four fields.
{
  const sum = sumClusterBuckets([
    { count: 3, complete: 1, partial: 1, missing: 1 },
    { count: 2, complete: 2, partial: 0, missing: 0 },
  ]);
  assert.deepEqual(sum, { count: 5, complete: 3, partial: 1, missing: 1 });
}

// 3. Missing numeric fields coalesce to 0 (not NaN).
{
  const sum = sumClusterBuckets([{ count: 4 }]);
  assert.deepEqual(sum, { count: 4, complete: 0, partial: 0, missing: 0 });
}

// ── deriveMacroRing: cached-meta (no filter) ────────────────────────────────

// 4. Healthy backend with completeness → count + segments from cached meta.
{
  const r = deriveMacroRing({ url: 'a', playgroundCount: 10, completeness: { complete: 6, partial: 3, missing: 1 } });
  assert.equal(r.offline, false);
  assert.equal(r.importing, false);
  assert.equal(r.degraded, false);
  assert.equal(r.filteredEmpty, false);
  assert.deepEqual([r.count, r.complete, r.partial, r.missing, r.restricted], [10, 6, 3, 1, 0]);
}

// 5. Pre-P1 backend (no completeness) → count maps into the restricted bucket.
{
  const r = deriveMacroRing({ url: 'd', playgroundCount: 7 });
  assert.deepEqual([r.count, r.complete, r.partial, r.missing, r.restricted], [7, 0, 0, 0, 7]);
  assert.equal(r.degraded, false, 'non-empty pre-P1 backend is not degraded');
}

// 6. Genuinely empty backend (no filter) → "no data" / degraded.
{
  const r = deriveMacroRing({ url: 'e', playgroundCount: 0 });
  assert.equal(r.degraded, true, 'empty cached-meta backend is degraded (no data)');
  assert.equal(r.filteredEmpty, false);
  assert.equal(r.count, 0);
}

// ── deriveMacroRing: health states take precedence ──────────────────────────

// 7. Offline (healthUp:false) wins over everything; no degraded/filteredEmpty.
{
  const r = deriveMacroRing({ url: 'b', healthUp: false, playgroundCount: 0 }, { count: 0, complete: 0, partial: 0, missing: 0 });
  assert.equal(r.offline, true);
  assert.equal(r.importing, false);
  assert.equal(r.degraded, false);
  assert.equal(r.filteredEmpty, false);
}

// 8. Importing suppresses degraded/filteredEmpty.
{
  const r = deriveMacroRing({ url: 'c', importing: true, playgroundCount: 0 });
  assert.equal(r.importing, true);
  assert.equal(r.degraded, false);
  assert.equal(r.filteredEmpty, false);
}

// ── deriveMacroRing: active filter (filtered aggregate present) ──────────────

// 9. Filtered subset with matches → count + segments from the filtered total.
{
  const r = deriveMacroRing(
    { url: 'f', playgroundCount: 100, completeness: { complete: 60, partial: 30, missing: 10 } },
    { count: 8, complete: 5, partial: 2, missing: 1 },
  );
  assert.deepEqual([r.count, r.complete, r.partial, r.missing, r.restricted], [8, 5, 2, 1, 0]);
  assert.equal(r.degraded, false);
  assert.equal(r.filteredEmpty, false);
}

// 10. Filter excluded everything on a backend that HAS data → "no match".
{
  const r = deriveMacroRing(
    { url: 'g', playgroundCount: 50, completeness: { complete: 30, partial: 15, missing: 5 } },
    { count: 0, complete: 0, partial: 0, missing: 0 },
  );
  assert.equal(r.filteredEmpty, true, 'filtered total of 0 on a populated backend is "no match"');
  assert.equal(r.degraded, false);
  assert.equal(r.count, 0);
}

// 11. CURRENT behavior (#689): a genuinely EMPTY backend under an active filter
//     is mislabeled "no match" instead of "no data". Characterized here so the
//     #689 fix (gate filteredEmpty on playgroundCount > 0) shows as a test diff.
{
  const r = deriveMacroRing(
    { url: 'h', playgroundCount: 0 },
    { count: 0, complete: 0, partial: 0, missing: 0 },
  );
  assert.equal(r.filteredEmpty, true, '#689: empty backend currently reads as no-match (to be fixed)');
  assert.equal(r.degraded, false, '#689: degraded is suppressed once a filter settles');
}

console.log('macroAggregate.test.js OK');
