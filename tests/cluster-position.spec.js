// Live-API integration: verifies that `api.get_playground_clusters` ships
// the bucket position as the unweighted spatial mean of its members'
// centroids — the contract introduced by the
// `position-clusters-at-member-centroid` change.
//
// Hits the running docker stack at http://localhost:8080/api directly via
// Playwright's request fixture. Skips if PostgREST isn't reachable so this
// suite stays opt-in for local dev / CI environments without docker.
//
// The complementary SQL-level regression lives at
// `dev/sql-tests/cluster-position.sql` (task 3.2 of the change). This
// browser-side test exists for two reasons (task 3.3):
//   1. positive proof that the rendered cluster position is *inside* the
//      member convex hull — i.e. the dot tracks geography, not the grid
//      anchor (which at z=7 would land ~10 km outside the Fulda cluster).
//   2. round-trip coverage of the wire format (PostgREST → JSON → client)
//      so a future schema rename or projection bug surfaces here.

import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:8080/api';

// Bbox covering Hessen with the seeded 4 Fulda playgrounds at z=7
// (78 km cell). Picked so the seed collapses into one bucket regardless
// of cell-edge stickiness.
const BBOX = { min_lon: 8.5, min_lat: 50.0, max_lon: 10.5, max_lat: 51.2 };
const Z = 7;

test.describe('Cluster position semantics (live API)', () => {
  test.beforeAll(async ({ request }) => {
    let probe;
    try {
      probe = await request.get(`${API_BASE}/rpc/get_meta`, { timeout: 2000 });
    } catch (err) {
      test.skip(true, `Skipping live-API tests — ${API_BASE} unreachable: ${err.message}`);
    }
    if (!probe?.ok()) {
      test.skip(true, `Skipping live-API tests — ${API_BASE}/rpc/get_meta returned ${probe?.status?.() ?? '?'}`);
    }
  });

  test('multi-member bucket lon/lat lies inside the convex hull of its members', async ({ request }) => {
    const clustersUrl =
      `${API_BASE}/rpc/get_playground_clusters?z=${Z}` +
      `&min_lon=${BBOX.min_lon}&min_lat=${BBOX.min_lat}` +
      `&max_lon=${BBOX.max_lon}&max_lat=${BBOX.max_lat}`;
    const clustersRes = await request.get(clustersUrl);
    expect(clustersRes.ok(), `clusters RPC failed: ${clustersRes.status()}`).toBeTruthy();
    const clusters = await clustersRes.json();
    expect(Array.isArray(clusters)).toBe(true);

    const multi = clusters.filter(b => b.count >= 2).sort((a, b) => b.count - a.count);
    expect(
      multi.length,
      'no multi-member bucket — seed must place ≥ 2 playgrounds in one z=7 cell',
    ).toBeGreaterThan(0);
    const bucket = multi[0];

    // Schema invariant from the spec: count = complete + partial + missing + restricted.
    expect(bucket.count).toBe(bucket.complete + bucket.partial + bucket.missing + bucket.restricted);

    const centroidsUrl =
      `${API_BASE}/rpc/get_playground_centroids` +
      `?min_lon=${BBOX.min_lon}&min_lat=${BBOX.min_lat}` +
      `&max_lon=${BBOX.max_lon}&max_lat=${BBOX.max_lat}`;
    const centroidsRes = await request.get(centroidsUrl);
    expect(centroidsRes.ok(), `centroids RPC failed: ${centroidsRes.status()}`).toBeTruthy();
    const centroids = await centroidsRes.json();
    expect(centroids.length).toBeGreaterThanOrEqual(bucket.count);

    // Re-bucket centroids with the same `ST_SnapToGrid` cell size used at
    // z=7 (78 125 m), then pick the cell whose member count matches the
    // bucket. This avoids assuming a single cell covers the whole bbox —
    // future seed growth could split into multiple cells.
    const cellSize = 78125;
    const buckets = bucketBy3857(centroids, cellSize);
    const matching = [...buckets.values()].filter(g => g.length === bucket.count);
    expect(
      matching.length,
      `expected exactly one cell with ${bucket.count} members; got ${matching.length}`,
    ).toBe(1);
    const members = matching[0];

    const hull = convexHull(members.map(m => [m.lon, m.lat]));
    expect(
      pointInOrOnPolygon([bucket.lon, bucket.lat], hull),
      `bucket position (${bucket.lon}, ${bucket.lat}) lies outside the convex hull of its members ` +
        `(${members.map(m => `(${m.lon}, ${m.lat})`).join(', ')})`,
    ).toBe(true);
  });
});

// --- geometry helpers ---

// Snap centroid lon/lat into the same Web Mercator grid the SQL function uses.
// We approximate ST_Transform + ST_SnapToGrid by transforming through the
// standard 4326 ↔ 3857 formulas.
function bucketBy3857(centroids, cellSize) {
  const groups = new Map();
  for (const c of centroids) {
    const [x, y] = lonLatTo3857(c.lon, c.lat);
    const cx = Math.floor(x / cellSize) * cellSize;
    const cy = Math.floor(y / cellSize) * cellSize;
    const key = `${cx},${cy}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return groups;
}

function lonLatTo3857(lon, lat) {
  const r = 6378137;
  const x = (lon * Math.PI / 180) * r;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * r;
  return [x, y];
}

// Andrew's monotone-chain convex hull (returns CCW vertices, no duplicate end).
function convexHull(points) {
  const pts = points
    .map(p => [...p])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 2) return pts;

  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Ray-cast point-in-polygon with a small inclusive tolerance for boundary
// hits — for a 2-member bucket the hull degenerates to a segment, so the
// mean lies on the boundary and a strict-inside test would falsely fail.
function pointInOrOnPolygon([px, py], polygon) {
  const eps = 1e-9;
  if (polygon.length < 2) return false;
  if (polygon.length === 2) {
    const [a, b] = polygon;
    return onSegment(a, b, [px, py], eps);
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (onSegment([xj, yj], [xi, yi], [px, py], eps)) return true;
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function onSegment(a, b, p, eps) {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  if (Math.abs(cross) > eps) return false;
  const dot = (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
  if (dot < -eps) return false;
  const lenSq = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  return dot <= lenSq + eps;
}
