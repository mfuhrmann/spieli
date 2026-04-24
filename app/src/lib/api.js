// PostgREST API calls.
// All functions accept an optional baseUrl parameter (defaults to the configured apiBaseUrl).
// This allows the Hub to call per-backend URLs using the same functions.

import { transformExtent } from 'ol/proj';
import { osmRelationId, apiBaseUrl as defaultApiBaseUrl } from './config.js';

let _fetchPlaygroundsDeprecationWarned = false;

/**
 * All playgrounds in the configured region as polygons (including geometry and tags).
 *
 * @deprecated Since v0.2.7 — use {@link fetchPlaygroundsBbox} with a viewport
 *   extent. The region-scoped `get_playgrounds` RPC will be removed in the
 *   release after next. See openspec change add-tiered-playground-delivery.
 */
export async function fetchPlaygrounds(baseUrl = defaultApiBaseUrl) {
    if (!_fetchPlaygroundsDeprecationWarned) {
        _fetchPlaygroundsDeprecationWarned = true;
        console.warn('[api] fetchPlaygrounds is deprecated — use fetchPlaygroundsBbox. Scheduled for removal in the release after next.');
    }
    const res = await fetch(`${baseUrl}/rpc/get_playgrounds?relation_id=${osmRelationId}`);
    if (res.ok) return res.json();
    throw new Error(`get_playgrounds failed: ${res.status}`);
}

// ── Tiered playground delivery (P1) ──────────────────────────────────────────
// Three bbox-scoped fetchers the zoom-tier orchestrator picks between.
// All three accept an optional AbortSignal so a moveend handler can cancel
// an in-flight request when the viewport changes again before it settles.

/**
 * Cluster-tier buckets for zoom ≤ 10. Returns an array of
 * `{ lon, lat, count, complete, partial, missing }` bucket objects,
 * grid-aligned to a zoom-dependent cell size on the server.
 */
export async function fetchPlaygroundClusters(zoom, extentEPSG3857, baseUrl = defaultApiBaseUrl, signal) {
    const [minLon, minLat, maxLon, maxLat] = transformExtent(extentEPSG3857, 'EPSG:3857', 'EPSG:4326');
    const params = new URLSearchParams({ z: zoom, min_lon: minLon, min_lat: minLat, max_lon: maxLon, max_lat: maxLat });
    const res = await fetch(`${baseUrl}/rpc/get_playground_clusters?${params}`, { signal });
    if (res.ok) return res.json();
    throw new Error(`get_playground_clusters failed: ${res.status}`);
}

/**
 * Centroid-tier rows for zoom 11–13. Returns an array of
 * `{ osm_id, lon, lat, completeness, filter_attrs: { has_water, for_baby, ... } }`.
 * No polygon geometry, no tag hstore — meant for Supercluster to re-index client-side.
 */
export async function fetchPlaygroundCentroids(extentEPSG3857, baseUrl = defaultApiBaseUrl, signal) {
    const [minLon, minLat, maxLon, maxLat] = transformExtent(extentEPSG3857, 'EPSG:3857', 'EPSG:4326');
    const params = new URLSearchParams({ min_lon: minLon, min_lat: minLat, max_lon: maxLon, max_lat: maxLat });
    const res = await fetch(`${baseUrl}/rpc/get_playground_centroids?${params}`, { signal });
    if (res.ok) return res.json();
    throw new Error(`get_playground_centroids failed: ${res.status}`);
}

/**
 * Polygon-tier GeoJSON for zoom ≥ 14. Same FeatureCollection shape as the
 * legacy {@link fetchPlaygrounds} but bbox-scoped instead of region-scoped.
 */
export async function fetchPlaygroundsBbox(extentEPSG3857, baseUrl = defaultApiBaseUrl, signal) {
    const [minLon, minLat, maxLon, maxLat] = transformExtent(extentEPSG3857, 'EPSG:3857', 'EPSG:4326');
    const params = new URLSearchParams({ min_lon: minLon, min_lat: minLat, max_lon: maxLon, max_lat: maxLat });
    const res = await fetch(`${baseUrl}/rpc/get_playgrounds_bbox?${params}`, { signal });
    if (res.ok) return res.json();
    throw new Error(`get_playgrounds_bbox failed: ${res.status}`);
}

/**
 * Single-playground lookup for deeplink and nearby-list hydration when the
 * polygon source isn't populated (zoom ≤ clusterMaxZoom). Returns a single
 * GeoJSON Feature, or `null` if the backend reports no match. Throws on
 * non-OK responses so the caller can distinguish "not found" (null) from
 * "server error" (throw) and decide how to fail / retry.
 */
export async function fetchPlaygroundByOsmId(osmId, baseUrl = defaultApiBaseUrl, signal) {
    const params = new URLSearchParams({ osm_id: String(osmId) });
    const res = await fetch(`${baseUrl}/rpc/get_playground?${params}`, { signal });
    if (!res.ok) throw new Error(`get_playground failed: ${res.status}`);
    const json = await res.json();
    return json && json.geometry ? json : null;
}

// Equipment and fixtures for a playground (bbox in EPSG:3857).
// osmId is carried through for future query optimisation but currently unused server-side.
export async function fetchPlaygroundEquipment(extentEPSG3857, osmId = null, baseUrl = defaultApiBaseUrl) {
    const [minLon, minLat, maxLon, maxLat] = transformExtent(extentEPSG3857, 'EPSG:3857', 'EPSG:4326');
    const params = new URLSearchParams({ min_lon: minLon, min_lat: minLat, max_lon: maxLon, max_lat: maxLat });
    const res = await fetch(`${baseUrl}/rpc/get_equipment?${params}`);
    if (res.ok) return res.json();
    throw new Error(`get_equipment failed: ${res.status}`);
}

// Trees (natural=tree) within a bounding box.
export async function fetchTrees(extentEPSG3857, baseUrl = defaultApiBaseUrl) {
    const [minLon, minLat, maxLon, maxLat] = transformExtent(extentEPSG3857, 'EPSG:3857', 'EPSG:4326');
    const params = new URLSearchParams({ min_lon: minLon, min_lat: minLat, max_lon: maxLon, max_lat: maxLat });
    const res = await fetch(`${baseUrl}/rpc/get_trees?${params}`);
    if (res.ok) return res.json();
    return { type: 'FeatureCollection', features: [] };
}

// Nearby POIs (toilets, bus stops, ice cream, emergency rooms).
// osmId is carried through for future use but currently unused server-side.
export async function fetchNearbyPOIs(lat, lon, radiusM = 500, osmId = null, baseUrl = defaultApiBaseUrl) {
    const params = new URLSearchParams({ lat, lon, radius_m: radiusM });
    const res = await fetch(`${baseUrl}/rpc/get_pois?${params}`);
    if (res.ok) return res.json();
    return [];
}

// Pitches, benches, shelters, picnic tables and fitness stations not within
// any playground polygon, within a bounding box.
// Returns an empty FeatureCollection silently when no backend is configured.
export async function fetchStandaloneEquipment(extentEPSG3857, baseUrl = defaultApiBaseUrl) {
    if (!baseUrl) return { type: 'FeatureCollection', features: [] };
    const [minLon, minLat, maxLon, maxLat] = transformExtent(extentEPSG3857, 'EPSG:3857', 'EPSG:4326');
    const params = new URLSearchParams({ min_lon: minLon, min_lat: minLat, max_lon: maxLon, max_lat: maxLat });
    const res = await fetch(`${baseUrl}/rpc/get_standalone_equipment?${params}`);
    if (res.ok) return res.json();
    return { type: 'FeatureCollection', features: [] };
}

// Nearest playgrounds to a given WGS84 point, ordered by distance.
// Returns [] when apiBaseUrl is empty (Overpass / local dev mode).
export async function fetchNearestPlaygrounds(lat, lon, baseUrl = defaultApiBaseUrl) {
    if (!baseUrl) return [];
    const params = new URLSearchParams({ lat, lon });
    const res = await fetch(`${baseUrl}/rpc/get_nearest_playgrounds?${params}`);
    if (res.ok) return res.json();
    return [];
}

/**
 * Instance metadata (requires spieli v0.2.1+).
 *
 * Response shape:
 *   { relation_id, name, playground_count, complete, partial, missing, bbox: [w,s,e,n] }
 *
 * `complete`, `partial`, `missing` (since v0.2.7) sum to `playground_count` and
 * drive the hub's country-level macro view (see `add-federated-playground-clustering`).
 */
export async function fetchMeta(baseUrl = defaultApiBaseUrl) {
    const res = await fetch(`${baseUrl}/rpc/get_meta`);
    if (res.ok) return res.json();
    return null;
}
