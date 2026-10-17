// Where this map has playground data (#1000 review): one entry per backend,
// `{ url, bbox: [minLon, minLat, maxLon, maxLat], slug?, name? }` in WGS84.
// Written by StandaloneApp (its own backend's get_meta) and HubApp (every
// registered backend that reported a bbox); read by ReportMissingFlow.
//
// Outside every bbox the map knows nothing, so "no playgrounds here" means
// nothing either: the missing-playground flow must not suggest the area is
// empty or file an OSM note there without a duplicate check.
//
// `null` = not known yet, or no backend reported a bbox. Readers fail open.
import { writable } from 'svelte/store';

export const dataCoverage = writable(null);

/** The coverage entries whose bbox contains [lon, lat]; [] outside all. */
export function coverageAt(coverage, lon, lat) {
    if (!Array.isArray(coverage)) return [];
    return coverage.filter(({ bbox }) =>
        Array.isArray(bbox) && lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]);
}

/** True when [lon, lat] has data, or when coverage is unknown (fail open). */
export function isCovered(coverage, lon, lat) {
    if (!Array.isArray(coverage) || coverage.length === 0) return true;
    return coverageAt(coverage, lon, lat).length > 0;
}
