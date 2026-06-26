import { nominatimFetch } from './nominatim.js';

const RESERVED_PREFIXES = ['api', 'api2', 'legal', 'metrics'];

/**
 * Synchronous predicate: does this path look like a region URL (e.g. `/Frankfurt`)?
 * Mirrors the cheap structural checks in `resolveRegionFromPath` without the
 * Nominatim round-trip, so callers can decide up front whether the URL expresses
 * an explicit region-framing intent.
 */
export function isRegionPath(pathname) {
  if (!pathname || pathname === '/') return false;

  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (segments.length !== 1 || !segments[0]) return false;

  let candidate;
  try {
    candidate = decodeURIComponent(segments[0]);
  } catch {
    return false;
  }
  if (candidate.includes('.')) return false;
  if (RESERVED_PREFIXES.includes(candidate.toLowerCase())) return false;
  return true;
}

/**
 * Resolve a region URL path (e.g. `/Lauterbach`) to `{ name, extent, osmId }`
 * via Nominatim, or `null` if it does not look like a region or nothing matches.
 *
 * `opts.near` — `[lon, lat]` of the deployment's configured region centre. When
 * provided, ambiguous names (several settlements share a name) are disambiguated
 * by picking the candidate whose bbox centroid is nearest to it. Without it, the
 * highest-importance boundary/place relation wins. This keeps a Fulda instance's
 * `/Lauterbach` on Lauterbach (Hessen) rather than the higher-importance
 * Lauterbach in Czechia.
 */
/**
 * Policy for whether auto-locate may pan the map to the GPS fix on page load.
 * A deeplink hash always wins (explicit user intent). For a region path we only
 * suppress centering when the region framing actually took effect — if it was
 * present but failed to resolve (`framingApplied === false`), GPS centering is
 * allowed so the user is not silently stranded on the fallback region. When
 * there is no region path, centering is allowed.
 *
 * @param {{ hasDeeplink: boolean, regionPath: boolean, framingApplied: (boolean|null) }} state
 * @returns {boolean} true → center on the GPS fix
 */
export function shouldAutoCenterOnLocate({ hasDeeplink, regionPath, framingApplied }) {
  if (hasDeeplink) return false;
  if (!regionPath) return true;
  return framingApplied === false;
}

export async function resolveRegionFromPath(pathname, { near } = {}) {
  if (!isRegionPath(pathname)) return null;

  const candidate = decodeURIComponent(pathname.replace(/^\/+|\/+$/g, '').split('/')[0]);

  try {
    const results = await nominatimFetch('/search', {
      q: candidate,
      limit: 5,
      featuretype: 'settlement',
    });
    if (!results.length) return null;

    // Keep only candidates with a usable numeric bbox, then prefer relations
    // (boundaries) over standalone nodes/ways.
    const parsed = results
      .map(r => ({ r, bbox: (r.boundingbox || []).map(Number) }))
      .filter(({ bbox }) => bbox.length === 4 && bbox.every(Number.isFinite));
    if (!parsed.length) return null;

    const relations = parsed.filter(({ r }) => r.osm_type === 'relation');
    const pool = relations.length ? relations : parsed;

    const hasNear = Array.isArray(near) && near.length === 2 && near.every(Number.isFinite);
    let chosen;
    if (hasNear) {
      const [nLon, nLat] = near;
      const distSq = ([minLat, maxLat, minLon, maxLon]) => {
        const cLon = (minLon + maxLon) / 2;
        const cLat = (minLat + maxLat) / 2;
        return (nLon - cLon) ** 2 + (nLat - cLat) ** 2;
      };
      chosen = pool.reduce((best, cur) =>
        distSq(cur.bbox) < distSq(best.bbox) ? cur : best
      );
    } else {
      chosen =
        pool.find(({ r }) => r.class === 'boundary' || r.class === 'place') || pool[0];
    }

    const { r: best, bbox } = chosen;
    const [minLat, maxLat, minLon, maxLon] = bbox;
    return {
      name: best.display_name.split(',')[0].trim(),
      extent: [minLon, minLat, maxLon, maxLat],
      osmId: Number(best.osm_id),
    };
  } catch {
    return null;
  }
}
