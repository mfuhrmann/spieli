const RESERVED_PREFIXES = ['api', 'legal', 'metrics'];
const NOMINATIM_TIMEOUT_MS = 3000;

export async function resolveRegionFromPath(pathname) {
  if (!pathname || pathname === '/') return null;

  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (segments.length !== 1 || !segments[0]) return null;

  const candidate = decodeURIComponent(segments[0]).toLowerCase();
  if (RESERVED_PREFIXES.includes(candidate)) return null;

  const query = decodeURIComponent(segments[0]);
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&featuretype=settlement`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;

    const results = await res.json();
    if (!results.length) return null;

    const best =
      results.find(r => r.osm_type === 'relation' && (r.class === 'boundary' || r.class === 'place')) ||
      results.find(r => r.osm_type === 'relation') ||
      results.find(r => r.boundingbox) ||
      results[0];

    if (!best.boundingbox) return null;

    const [minLat, maxLat, minLon, maxLon] = best.boundingbox.map(Number);
    return {
      name: best.display_name.split(',')[0].trim(),
      extent: [minLon, minLat, maxLon, maxLat],
      osmId: Number(best.osm_id),
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}
