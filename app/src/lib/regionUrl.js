import { nominatimFetch } from './nominatim.js';

const RESERVED_PREFIXES = ['api', 'api2', 'legal', 'metrics'];

export async function resolveRegionFromPath(pathname) {
  if (!pathname || pathname === '/') return null;

  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (segments.length !== 1 || !segments[0]) return null;

  const candidate = decodeURIComponent(segments[0]);
  if (candidate.includes('.')) return null;
  if (RESERVED_PREFIXES.includes(candidate.toLowerCase())) return null;

  try {
    const results = await nominatimFetch('/search', {
      q: candidate,
      limit: 5,
      featuretype: 'settlement',
    });
    if (!results.length) return null;

    const best =
      results.find(r => r.osm_type === 'relation' && (r.class === 'boundary' || r.class === 'place')) ||
      results.find(r => r.osm_type === 'relation') ||
      results.find(r => r.boundingbox) ||
      results[0];

    if (!best.boundingbox || best.boundingbox.length !== 4) return null;

    const bbox = best.boundingbox.map(Number);
    if (!bbox.every(Number.isFinite)) return null;

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
