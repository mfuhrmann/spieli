// PostgREST API calls.
// All functions accept an optional baseUrl parameter (defaults to the configured apiBaseUrl).
// This allows the Hub to call per-backend URLs using the same functions.

import { transformExtent } from 'ol/proj';
import { osmRelationId, apiBaseUrl as defaultApiBaseUrl } from './config.js';

// All playgrounds in the configured region as polygons (including geometry and tags).
export async function fetchPlaygrounds(baseUrl = defaultApiBaseUrl) {
    const res = await fetch(`${baseUrl}/rpc/get_playgrounds?relation_id=${osmRelationId}`);
    if (res.ok) return res.json();
    throw new Error(`get_playgrounds failed: ${res.status}`);
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

// Instance metadata (requires spielplatzkarte v0.2.1+).
export async function fetchMeta(baseUrl = defaultApiBaseUrl) {
    const res = await fetch(`${baseUrl}/rpc/get_meta`);
    if (res.ok) return res.json();
    return null;
}
