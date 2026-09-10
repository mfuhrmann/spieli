// SPDX-FileCopyrightText: 2026 spieli contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Does the current view sit outside the basemap's DETAILED coverage?
//
// A regional tileset has two extents and only one is discoverable from the
// tileset. Planetiler bakes Natural Earth and water polygons in globally, so
// low zooms render everywhere and the declared bounds describe that wide area
// honestly. OSM detail exists only inside the imported extract; above roughly
// z7 outside it the tile server answers 204 No Content and the renderer draws
// an empty tile. Nothing errors, so a void is indistinguishable from a
// legitimately empty map — which is the failure this predicate exists to name.
//
// Kept pure and separate from Map.svelte because the interesting part is the
// rule, not the wiring, and the rule is worth testing without a browser.

// Below this the tileset's global low-zoom layer still renders, so a view
// outside the extract is not blank and there is nothing to report.
export const BASEMAP_COVERAGE_DETAIL_ZOOM = 8;

/**
 * Parse "minLon,minLat,maxLon,maxLat". Returns null for anything malformed:
 * a typo should cost the notice, not the map.
 * @param {unknown} raw
 * @returns {[number, number, number, number] | null}
 */
export function parseCoverageBbox(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const parts = raw.split(',').map((n) => Number(n.trim()));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
    const [minLon, minLat, maxLon, maxLat] = parts;
    if (minLon >= maxLon || minLat >= maxLat) return null;
    if (minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90) return null;
    return [minLon, minLat, maxLon, maxLat];
}

/**
 * @param {[number,number,number,number]|null} bbox coverage, or null for "no limit"
 * @param {[number,number]|null} lonLat view centre
 * @param {number|undefined} zoom
 * @returns {boolean|null} null = nothing to say; true = outside detailed coverage
 */
export function isOutsideCoverage(bbox, lonLat, zoom) {
    // No declared coverage means a planet tileset, or an operator who has not
    // said. Either way, never claim anything.
    if (!bbox) return null;
    if (typeof zoom !== 'number' || !Number.isFinite(zoom)) return null;
    if (!Array.isArray(lonLat) || lonLat.length !== 2) return null;
    if (zoom < BASEMAP_COVERAGE_DETAIL_ZOOM) return false;
    const [lon, lat] = lonLat;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const [minLon, minLat, maxLon, maxLat] = bbox;
    // Keyed on the view CENTRE rather than the viewport intersecting the bbox:
    // near a border a partly-covered view is normal, and a notice there would
    // cry wolf. A centre outside the extract means the area being looked at is
    // the empty part.
    return lon < minLon || lon > maxLon || lat < minLat || lat > maxLat;
}
