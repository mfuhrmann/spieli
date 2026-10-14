// Ranking for the location search (#973).
//
// The search asks Nominatim twice: once only inside the current view
// (`bounded=1`, what finds the nearby street or shop) and once everywhere
// (`bounded=0`, what finds the city). Using the local answer alone whenever it
// had anything hid every city behind a same-named shop: on Wetzlar, "Frankfurt"
// offered only a leather shop. Sorting everything by distance from the view
// then threw away Nominatim's own importance ranking.
//
// Order of the merged list, filled up to `limit`:
//   1. leading places — settlements in or near the view, or important in their
//      own right — by importance, with a boost in view (at most `maxPlaces`);
//   2. what was found in view, nearest first;
//   3. the remaining places, by the same score;
//   4. everything else in Nominatim's order — only `maxRest` of it when the
//      view answer arrived (far-away streets are noise next to local ones), the
//      whole remaining room when there is no view or that request failed.
// Duplicates — the same OSM object, or the same visible name without postcode
// (a town as boundary + place node + postcode area, a street's segments) — are
// shown once.

import { haversineDistance } from './playgroundHelpers.js';

// Settlements and areas a visitor means by "a place". `class=place` alone also
// covers house numbers, postcodes, squares and farms, which must not fill the
// place slots or be ordered by importance instead of distance.
const PLACE_TYPES = new Set([
  'city', 'town', 'village', 'hamlet', 'isolated_dwelling', 'municipality',
  'suburb', 'borough', 'quarter', 'neighbourhood', 'city_district', 'district',
  'county', 'state', 'region', 'country', 'island', 'locality',
]);

/** A settlement or administrative area, as opposed to a street, shop or POI. */
export function isPlace(hit) {
  return (hit.class === 'boundary' && hit.type === 'administrative')
    || (hit.class === 'place' && PLACE_TYPES.has(hit.type))
    || (hit.class !== 'place' && PLACE_TYPES.has(hit.addresstype));
}

// The OSM object when Nominatim names it (it always does); otherwise the name
// and position, so hits without ids are not all collapsed into one.
const key = (h) => (h.osm_type && h.osm_id != null)
  ? `${h.osm_type}/${h.osm_id}`
  : `${h.display_name}@${h.lat},${h.lon}`;

// The visible text without (numeric) postcodes.
const visibleName = (h) => String(h.display_name ?? '').replace(/,\s*\d{4,5}(?=,|$)/g, '').trim();

const wrapLon = (lon) => ((lon + 180) % 360 + 360) % 360 - 180;

/**
 * The area "nearby" means: the view, but at least `minKm` around its centre
 * (#976). Selecting a place zooms the map to street level, about 1 km across;
 * searching a street from there must still find the one 2.5 km away in the
 * same town (Turmstraße in Fulda-Lehnerz), not only namesakes elsewhere.
 * @param {number[]|null} box  [minLon, minLat, maxLon, maxLat]
 * @returns {number[]|null}
 */
export function searchArea(box, minKm = 10) {
  if (!box || box.some(v => !Number.isFinite(v))) return box ?? null;
  const lon = (box[0] + box[2]) / 2, lat = (box[1] + box[3]) / 2;
  const dLat = minKm / 111;
  const dLon = minKm / (111 * Math.max(0.01, Math.cos(lat * Math.PI / 180)));
  return [
    Math.min(box[0], lon - dLon), Math.max(-90, Math.min(box[1], lat - dLat)),
    Math.max(box[2], lon + dLon), Math.min(90, Math.max(box[3], lat + dLat)),
  ];
}

/** The view as a centre and a containment test, or null. Copes with a view
 *  whose longitudes OpenLayers reports outside [-180, 180] (a wrapped world). */
function viewOf(box) {
  if (!box || box.some(v => !Number.isFinite(v)) || box[2] - box[0] >= 360) return null;
  const shift = wrapLon(box[0]) - box[0];
  const [w, s, e, n] = [box[0] + shift, box[1], box[2] + shift, box[3]];
  const lon = (w + e) / 2, lat = (s + n) / 2;
  return {
    lon, lat,
    contains: (h) => {
      let x = parseFloat(h.lon), y = parseFloat(h.lat);
      if (x < w) x += 360;  // a view crossing the antimeridian
      return x >= w && x <= e && y >= s && y <= n;
    },
  };
}

/**
 * @param {object[]} globalHits  unbounded answer (Nominatim order = importance)
 * @param {object[]|null} localHits  answer bounded to the view; null when there
 *   is no view or that request failed
 * @param {number[]|null} box    view as [minLon, minLat, maxLon, maxLat]
 * @param {{ limit?: number, maxPlaces?: number, maxRest?: number }} [opts]
 */
export function rankSearchHits(globalHits, localHits, box, { limit = 6, maxPlaces = 3, maxRest = 2 } = {}) {
  const view = viewOf(box);
  const global = globalHits ?? [];
  const local = localHits ?? [];

  // Score and distance once per hit, not per comparison.
  const info = new Map();
  for (const h of [...global, ...local]) {
    if (info.has(h)) continue;
    const imp = parseFloat(h.importance) || 0;
    const km = view ? haversineDistance(view.lat, view.lon, parseFloat(h.lat), parseFloat(h.lon)) / 1000 : 0;
    const inView = view ? view.contains(h) : false;
    info.set(h, {
      km: Number.isFinite(km) ? km : Infinity,
      // In view, a place outranks an equally important one elsewhere: on
      // Fulda, "Petersberg" should be the neighbouring town.
      score: imp + (inView ? 0.1 : 0),
      // Leads the list when it is what the visitor most likely means: in or
      // near the view, or important in its own right (a major city). A small
      // namesake across the world (Fulda, Minnesota) comes after what is near.
      leads: !view || inView || km < 100 || imp >= 0.45,
    });
  }

  const seenKeys = new Set();
  const seenNames = new Set();
  const out = [];
  const add = (h) => {
    if (out.length >= limit) return false;
    const k = key(h), n = visibleName(h);
    if (seenKeys.has(k) || seenNames.has(n)) return false;
    seenKeys.add(k); seenNames.add(n);
    out.push(h);
    return true;
  };
  const byScore = (a, b) => info.get(b).score - info.get(a).score;
  const byDistance = (a, b) => info.get(a).km - info.get(b).km;

  const places = [...global, ...local].filter(isPlace).sort(byScore);
  let placed = 0;
  for (const h of places) {
    if (placed >= maxPlaces) break;
    if (info.get(h).leads && add(h)) placed++;
  }
  for (const h of local.filter(h => !isPlace(h)).sort(byDistance)) add(h);
  for (const h of places) add(h);
  let rest = 0;
  const restCap = localHits ? maxRest : limit;
  for (const h of global) {
    if (rest >= restCap) break;
    if (add(h)) rest++;
  }
  return out;
}
