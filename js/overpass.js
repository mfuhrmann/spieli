//----------------------------------------------//
// Datenquellen — PostgREST (primär) / Overpass //
//----------------------------------------------//

import { transformExtent } from 'ol/proj';
import { osmRelationId, apiBaseUrl } from './config.js';

const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];

// Alle Spielplätze in der konfigurierten Region als Polygone laden (inkl. Geometrie und Tags)
export async function fetchPlaygrounds() {
    if (apiBaseUrl) {
        const res = await fetch(`${apiBaseUrl}/rpc/get_playgrounds?relation_id=${osmRelationId}`);
        if (res.ok) return res.json();
    }

    // Fallback für lokale Entwicklung ohne PostgREST
    const query = `[out:json][timeout:60];
area(${3600000000 + osmRelationId})->.a;
way[leisure=playground](area.a);
out geom tags;`;
    const data = await overpassPost(query);
    return {
        type: 'FeatureCollection',
        features: data.elements
            .filter(el => el.geometry && el.geometry.length > 1)
            .map(el => ({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [el.geometry.map(p => [p.lon, p.lat])] },
                properties: { osm_id: el.id, osm_type: 'W', ...el.tags }
            }))
    };
}

// Spielgeräte und Ausstattung eines Spielplatzes laden (bbox in EPSG:3857)
export async function fetchPlaygroundEquipment(extentEPSG3857) {
    const [minLon, minLat, maxLon, maxLat] = transformExtent(extentEPSG3857, 'EPSG:3857', 'EPSG:4326');

    if (apiBaseUrl) {
        const params = new URLSearchParams({ min_lon: minLon, min_lat: minLat, max_lon: maxLon, max_lat: maxLat });
        const res = await fetch(`${apiBaseUrl}/rpc/get_equipment?${params}`);
        if (res.ok) return res.json();
    }

    // Fallback für lokale Entwicklung ohne PostgREST
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
    const data = await overpassPost(query);
    return {
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
}

// Nahegelegene POIs (Toiletten, Bushaltestellen, Eis, Notaufnahme) laden
export async function fetchNearbyPOIs(lat, lon, radiusM = 500) {
    if (apiBaseUrl) {
        const params = new URLSearchParams({ lat, lon, radius_m: radiusM });
        const res = await fetch(`${apiBaseUrl}/rpc/get_pois?${params}`);
        if (res.ok) return res.json();
    }

    // Fallback für lokale Entwicklung ohne PostgREST
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
  node["shop"="supermarket"]${around};
  node["shop"="convenience"]${around};
);
out body;`;
    const data = await overpassPost(query);
    return data.elements
        .filter(el => el.lat != null && el.lon != null)
        .map(el => ({ lat: el.lat, lon: el.lon, tags: el.tags, osm_id: el.id }));
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
