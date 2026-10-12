import assert from 'node:assert/strict';
import { mergeOverlappingBuckets, markerRadiusPx, markerLiftPx } from './clusterMerge.js';

const R = 10; // 10 m per px
const b = (x, y, count, extra = {}) => ({ x, y, count, complete: count, partial: 0, missing: 0, ...extra });

// 1. The reported case: a 4-disc with two singles right next to it merges into one 6.
{
  // One pin 25 px to the right, one 25 px below: both bodies reach into the disc.
  const out = mergeOverlappingBuckets([b(0, 0, 4), b(250, 0, 1), b(0, -250, 1)], R);
  assert.equal(out.length, 1);
  assert.equal(out[0].count, 6);
  assert.equal(out[0].complete, 6, 'segments are summed too');
}

// 2. Markers that clear each other stay separate.
{
  const far = (markerRadiusPx(4) + markerRadiusPx(1) + 4 + 1) * R;
  const out = mergeOverlappingBuckets([b(0, 0, 4), b(far, 0, 1)], R);
  assert.equal(out.length, 2);
}

// 3. Same buckets, more zoomed in (smaller resolution) → no longer overlap.
{
  const input = [b(0, 0, 4), b(300, 0, 1)];
  assert.equal(mergeOverlappingBuckets(input, 10).length, 1);
  assert.equal(mergeOverlappingBuckets(input, 1).length, 2);
}

// 4. Position is count-weighted.
{
  const [m] = mergeOverlappingBuckets([b(0, 0, 3), b(100, 0, 1)], R);
  assert.equal(m.x, 25);
  assert.equal(m.y, 0);
}

// 5. Total count is preserved, and a merge that grows a disc can pull in a
//    neighbour it cleared before (repeated passes).
{
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push(b((i % 8) * 220, Math.floor(i / 8) * 220, 1 + (i % 3)));
  const total = rows.reduce((s, r) => s + r.count, 0);
  const out = mergeOverlappingBuckets(rows, R);
  assert.equal(out.reduce((s, r) => s + r.count, 0), total);
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const d = Math.hypot(out[i].x - out[j].x,
        out[i].y + markerLiftPx(out[i].count) * R - out[j].y - markerLiftPx(out[j].count) * R) / R;
      assert.ok(d >= markerRadiusPx(out[i].count) + markerRadiusPx(out[j].count) + 4, 'no overlaps remain');
    }
  }
}

// 6. Input untouched; backend tag survives only when shared.
{
  const input = [b(0, 0, 2, { _backendUrl: '/a' }), b(10, 0, 2, { _backendUrl: '/a' }), b(5000, 0, 1, { _backendUrl: '/a' }), b(5010, 0, 1, { _backendUrl: '/b' })];
  const out = mergeOverlappingBuckets(input, R);
  assert.equal(input.length, 4);
  assert.equal(input[0].count, 2);
  const byCount = Object.fromEntries(out.map(o => [o.count, o]));
  assert.equal(byCount[4]._backendUrl, '/a');
  assert.equal(byCount[2]._backendUrl, undefined);
}

// 7. A pin is measured around its body, 19 px above its tip: a single just
//    below a disc touches it with its body even when the tips are far apart.
{
  const r4 = markerRadiusPx(4), r1 = markerRadiusPx(1);
  const below = (r4 + r1 + 4 + 2) * R; // clear if measured at the tip …
  const out = mergeOverlappingBuckets([b(0, 0, 4), b(0, -below, 1)], R); // … single below the disc
  assert.equal(out.length, 1, 'its body reaches up into the disc');
  const above = mergeOverlappingBuckets([b(0, 0, 4), b(0, below, 1)], R);
  assert.equal(above.length, 2, 'above the disc the body is further away');
}

// 8. Degenerate resolution leaves buckets alone.
assert.equal(mergeOverlappingBuckets([b(0, 0, 1), b(0, 0, 1)], 0).length, 2);

console.log('clusterMerge tests passed.');
