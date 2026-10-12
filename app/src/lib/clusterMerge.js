// Merge cluster buckets whose markers would overlap on screen (#941).
//
// The server buckets playgrounds on a fixed grid (`ST_SnapToGrid`, cell =
// 10 000 000 m / 2^z) and places each bucket at its members' centroid. A cell
// is about as wide as a marker — ≈ 64 px at z12 against a ≈ 52 px disc — so
// two playgrounds 300 m apart on either side of a cell border become two
// markers that touch or overlap: a "4" disc with single pins right next to
// it. This merges such buckets on the client, in screen space, at the
// resolution the buckets are about to be drawn at.
//
// Mode-independent on purpose: a single playground is sized as the finder pin
// even though mapping detail draws it as a small dot, so toggling mapping
// detail never changes the counts on the map.

import { radiusForCount } from './clusterStyle.js';

// Outer radius in CSS px of the marker drawn for a bucket of `count`: a ring
// or finder disc reaches radiusForCount + half its 8 px band (+1 px casing);
// a single playground is a pin of radius 11 (+2 px casing).
export function markerRadiusPx(count) {
  return count <= 1 ? 13 : radiusForCount(count) + 5;
}

// How far above its coordinate a marker's circle sits, in CSS px. Discs are
// centred on the point; a pin is drawn with its *tip* on the point, so its
// round body is 19 px higher (radius 11 + 8 px pointer, finderStyle.js).
export function markerLiftPx(count) {
  return count <= 1 ? 19 : 0;
}

const SUMMED = ['count', 'complete', 'partial', 'missing'];

function combine(a, b) {
  const wa = Math.max(a.count, 1);
  const wb = Math.max(b.count, 1);
  const out = {
    // Count-weighted, so a merged disc sits where the playgrounds are.
    x: (a.x * wa + b.x * wb) / (wa + wb),
    y: (a.y * wa + b.y * wb) / (wa + wb),
  };
  for (const k of SUMMED) out[k] = (a[k] ?? 0) + (b[k] ?? 0);
  // Keep a backend tag only while every member shares it (hub).
  if (a._backendUrl !== undefined || b._backendUrl !== undefined) {
    out._backendUrl = a._backendUrl === b._backendUrl ? a._backendUrl : undefined;
  }
  return out;
}

/**
 * @param {Array<{x:number, y:number, count:number, complete?:number,
 *   partial?:number, missing?:number, _backendUrl?:string}>} buckets
 *   positions in EPSG:3857 metres
 * @param {number} resolution  map units (m) per CSS pixel at the drawing zoom
 * @param {{ gapPx?: number, radiusFor?: (count:number) => number }} [opts]
 * @returns the merged buckets, same shape; the input is not modified
 */
export function mergeOverlappingBuckets(buckets, resolution, { gapPx = 4, radiusFor = markerRadiusPx, liftFor = markerLiftPx } = {}) {
  if (!(resolution > 0)) return buckets.map(b => ({ ...b }));
  let groups = buckets.map(b => ({ ...b }));

  // Greedy passes, biggest first, until a pass merges nothing: a merge grows
  // the disc, which can make it overlap a neighbour it cleared before.
  for (;;) {
    groups.sort((a, b) => b.count - a.count);
    const kept = [];
    for (const g of groups) {
      const rg = radiusFor(g.count);
      // Compare the drawn circles, not the coordinates: screen-up is +y in
      // EPSG:3857, so a pin's body is at y + lift.
      const gy = g.y / resolution + liftFor(g.count);
      const hit = kept.findIndex(k =>
        Math.hypot(k.x / resolution - g.x / resolution, k.y / resolution + liftFor(k.count) - gy)
          < radiusFor(k.count) + rg + gapPx);
      if (hit === -1) kept.push(g);
      else kept[hit] = combine(kept[hit], g);
    }
    if (kept.length === groups.length) return kept;
    groups = kept;
  }
}
