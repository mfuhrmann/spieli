//----------------------------------------------//
// Overpass API — Spielplatzdaten aus OSM laden //
//----------------------------------------------//

import { transformExtent } from 'ol/proj';
import { osmRelationId } from './config.js';

const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];
const PLAYGROUND_CACHE_TTL_MS = 24 * 60 * 60 * 1000;       // 24 Stunden
const EQUIPMENT_CACHE_TTL_MS  =  7 * 24 * 60 * 60 * 1000;  // 7 Tage
const NEARBY_CACHE_TTL_MS     = 24 * 60 * 60 * 1000;       // 24 Stunden
const CACHE_KEY = `spielplatzkarte_playgrounds_${osmRelationId}`;

// Alle Spielplätze in der konfigurierten Region als Polygone laden (inkl. Geometrie und Tags)
export async function fetchPlaygrounds() {
    // Frischen Cache zurückgeben, falls vorhanden
    const cached = loadCache(CACHE_KEY, PLAYGROUND_CACHE_TTL_MS, false);
    if (cached) return cached;

    const query = `[out:json][timeout:60];
area(${3600000000 + osmRelationId})->.a;
way[leisure=playground](area.a);
out geom tags;`;

    let data;
    try {
        data = await overpassPost(query);
    } catch (e) {
        // Bei Fehler veralteten Cache als Fallback versuchen
        const stale = loadCache(CACHE_KEY, PLAYGROUND_CACHE_TTL_MS, true);
        if (stale) {
            console.warn('Overpass API nicht erreichbar – nutze zwischengespeicherte Spielplatzdaten.');
            return stale;
        }
        throw e;
    }

    const geojson = {
        type: 'FeatureCollection',
        features: data.elements
            .filter(el => el.geometry && el.geometry.length > 1)
            .map(el => ({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [el.geometry.map(p => [p.lon, p.lat])]
                },
                properties: {
                    osm_id: el.id,
                    osm_type: 'W',
                    ...el.tags
                }
            }))
    };

    saveCache(CACHE_KEY, geojson);
    return geojson;
}

// Spielgeräte und Ausstattung eines Spielplatzes laden (bbox in EPSG:3857)
export async function fetchPlaygroundEquipment(extentEPSG3857, osmId = null) {
    const equipCacheKey = osmId ? `spielplatzkarte_equipment_${osmRelationId}_${osmId}` : null;
    if (equipCacheKey) {
        const cached = loadCache(equipCacheKey, EQUIPMENT_CACHE_TTL_MS, false);
        if (cached) return cached;
    }
    const [minLon, minLat, maxLon, maxLat] = transformExtent(extentEPSG3857, 'EPSG:3857', 'EPSG:4326');
    const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;
    const query = `[out:json][timeout:30];
(
  node[playground](${bboxStr});
  way[playground](${bboxStr});
  node[amenity=bench](${bboxStr});
  node[amenity=shelter](${bboxStr});
  node[leisure=picnic_table](${bboxStr});
  node[leisure=pitch](${bboxStr});
  way[leisure=pitch](${bboxStr});
  node[leisure=fitness_station](${bboxStr});
);
out body geom;`;
    let data;
    try {
        data = await overpassPost(query);
    } catch (e) {
        if (equipCacheKey) {
            const stale = loadCache(equipCacheKey, EQUIPMENT_CACHE_TTL_MS, true);
            if (stale) {
                console.warn('Overpass API nicht erreichbar – nutze zwischengespeicherte Spielgerätedaten.');
                return stale;
            }
        }
        throw e;
    }

    const geojson = {
        type: 'FeatureCollection',
        features: data.elements
            .map(el => {
                let geometry;
                if (el.type === 'node') {
                    geometry = { type: 'Point', coordinates: [el.lon, el.lat] };
                } else if (el.type === 'way' && el.geometry) {
                    geometry = { type: 'Polygon', coordinates: [el.geometry.map(p => [p.lon, p.lat])] };
                } else {
                    return null;
                }
                return {
                    type: 'Feature',
                    geometry,
                    properties: { osm_id: el.id, osm_type: el.type === 'node' ? 'N' : 'W', ...el.tags }
                };
            })
            .filter(Boolean)
    };

    if (equipCacheKey) saveCache(equipCacheKey, geojson);
    return geojson;
}

// Nahegelegene POIs (Toiletten, Bushaltestellen, Eis, Notaufnahme) laden
export async function fetchNearbyPOIs(lat, lon, radiusM = 500, osmId = null) {
    const cacheKey = osmId ? `spielplatzkarte_nearby_${osmRelationId}_${osmId}_r${radiusM}_v2` : null;
    if (cacheKey) {
        const cached = loadCache(cacheKey, NEARBY_CACHE_TTL_MS, false);
        if (cached) return cached;
    }

    const around = `(around:${radiusM},${lat},${lon})`;
    const query = `[out:json][timeout:15];
(
  node["amenity"="toilets"]${around};
  node["highway"="bus_stop"]${around};
  node["amenity"~"^(cafe|restaurant)$"]["cuisine"~"ice_cream"]${around};
  node["amenity"="ice_cream"]${around};
  node["amenity"="hospital"]${around};
  node["amenity"="doctors"]["emergency"="yes"]${around};
  node["emergency"="yes"]["emergency"!="fire_hydrant"]${around};
  node["shop"="chemist"]${around};
);
out body;`;

    let data;
    try {
        data = await overpassPost(query);
    } catch (e) {
        if (cacheKey) {
            const stale = loadCache(cacheKey, NEARBY_CACHE_TTL_MS, true);
            if (stale) {
                console.warn('Overpass API nicht erreichbar – nutze zwischengespeicherte Umfeld-Daten.');
                return stale;
            }
        }
        throw e;
    }

    const pois = data.elements
        .filter(el => el.lat != null && el.lon != null)
        .map(el => ({ lat: el.lat, lon: el.lon, tags: el.tags, osm_id: el.id }));

    if (cacheKey) saveCache(cacheKey, pois);
    return pois;
}

async function overpassPost(query, retries = 3, delayMs = 5000) {
    for (const api of OVERPASS_MIRRORS) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            const response = await fetch(api, {
                method: 'POST',
                body: 'data=' + encodeURIComponent(query)
            });
            if (response.ok) return response.json();
            if (response.status === 429 && attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
                continue;
            }
            if (response.status === 504) break; // try next mirror
            throw new Error(`Overpass API error: ${response.status}`);
        }
    }
    throw new Error('Overpass API error: 504 on all mirrors');
}

// Cache-Hilfsfunktionen
function loadCache(key, ttl, allowStale) {
    try {
        const item = localStorage.getItem(key);
        if (!item) return null;
        const { timestamp, data } = JSON.parse(item);
        if (!allowStale && Date.now() - timestamp > ttl) return null;
        return data;
    } catch {
        return null;
    }
}

function saveCache(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
    } catch {
        // localStorage voll oder nicht verfügbar – ignorieren
    }
}
