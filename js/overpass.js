//----------------------------------------------//
// Overpass API — Spielplatzdaten aus OSM laden //
//----------------------------------------------//

import { osmRelationId } from './config.js';

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

// Alle Spielplätze in der konfigurierten Region als Mittelpunkt-Punkte laden
export async function fetchPlaygrounds() {
    const query = `[out:json][timeout:60];
area(${3600000000 + osmRelationId})->.a;
(
  way[leisure=playground](area.a);
  relation[leisure=playground](area.a);
);
out center tags;`;
    const data = await overpassPost(query);
    return {
        type: 'FeatureCollection',
        features: data.elements
            .filter(el => el.center)
            .map(el => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [el.center.lon, el.center.lat]
                },
                properties: {
                    osm_id: el.id,
                    osm_type: el.type === 'way' ? 'W' : 'R',
                    ...el.tags
                }
            }))
    };
}

// Polygongeometrie eines einzelnen Spielplatzes per OSM-Typ und ID laden
export async function fetchPlaygroundGeom(osmType, osmId) {
    const keyword = osmType === 'R' ? 'relation' : 'way';
    const query = `[out:json][timeout:30];
${keyword}(${osmId});
out body geom;`;
    const data = await overpassPost(query);
    const el = data.elements[0];
    if (!el || !el.geometry) return null;

    return {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [el.geometry.map(p => [p.lon, p.lat])]
            },
            properties: {
                osm_id: el.id,
                osm_type: osmType,
                ...el.tags
            }
        }]
    };
}

async function overpassPost(query) {
    const response = await fetch(OVERPASS_API, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query)
    });
    if (!response.ok) throw new Error(`Overpass API error: ${response.status}`);
    return response.json();
}
