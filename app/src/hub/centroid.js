/** Parses the optional `centroid: [lon, lat]` field from a registry entry.
 *  Returns `[lon, lat]` on success, `null` on absent, `null` + warn on invalid. */
export function parseNominalCentroid(raw, url) {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw) || raw.length !== 2) {
    console.warn(`[registry] invalid centroid on backend ${url} — expected [lon, lat] array`);
    return null;
  }
  const [lon, lat] = raw;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    console.warn(`[registry] invalid centroid [${lon}, ${lat}] on backend ${url} — lon ∈ [-180,180], lat ∈ [-90,90]`);
    return null;
  }
  return [lon, lat];
}

/** Returns [lon, lat] midpoint of a bbox, or null if bbox is absent/malformed. */
export function bboxCentroid(bbox) {
  if (!bbox || bbox.length !== 4) return null;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}

/** Parses the optional `country` field (ISO 3166-1 alpha-2, e.g. "SK") from a
 *  registry entry (#741). Returns the upper-case code, `null` when absent,
 *  `null` + warn when malformed. Lower case is accepted and upper-cased — a
 *  country code, unlike a slug, appears in no shared link. */
export function parseCountry(raw, url) {
  if (raw === undefined || raw === null || raw === '') return null;
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(code)) {
    console.warn(`[registry] invalid country ${JSON.stringify(raw)} on backend ${url} — expected an ISO 3166-1 alpha-2 code such as "SK"`);
    return null;
  }
  return code;
}

/** Trims a registry `url` and drops trailing slashes (#740) — whitespace and a
 *  trailing slash are never intentional. Mirrored in oci/app/poll-federation.sh:
 *  federation-status.json is matched to backends by exact URL, so both sides
 *  must normalise identically or the health merge silently misses. */
export function normaliseBackendUrl(raw) {
  return String(raw ?? '').trim().replace(/\/+$/, '');
}
