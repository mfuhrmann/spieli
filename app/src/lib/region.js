import { nominatimFetch } from './nominatim.js';

export async function fetchRegionInfo(relationId) {
    const results = await nominatimFetch('/lookup', {
        osm_ids: `R${relationId}`,
        'accept-language': 'de',
    }, { timeout: 0 });
    const [result] = results;
    const [minLat, maxLat, minLon, maxLon] = result.boundingbox.map(Number);
    return {
        name: result.name,
        extent: [minLon, minLat, maxLon, maxLat],
        center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
    };
}
