// Ranking for the location search (#973).
//
// The search asks Nominatim twice: once only inside the current view
// (`bounded=1`, what finds the nearby street or shop) and once everywhere
// (`bounded=0`, what finds the city). Using the local answer alone whenever it
// had anything hid every city behind a same-named shop: on Wetzlar, "Frankfurt"
// offered only a leather shop. Sorting everything by distance from the view
// then threw away Nominatim's own importance ranking.
//
// The merged list puts places first (cities, towns, villages, districts — a
// visitor typing a place name almost always means the place), by importance
// with a small boost for those in view; then what was found in view, nearest
// first; then the rest. Duplicates (the same OSM object from both answers) are
// dropped.

const PLACE_TYPES = new Set([
  'city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'borough',
  'quarter', 'neighbourhood', 'city_district', 'district', 'county', 'state',
  'region', 'country', 'island', 'locality', 'isolated_dwelling',
]);

/** A settlement or administrative area, as opposed to a street, shop or POI. */
export function isPlace(hit) {
  return hit.class === 'place'
    || (hit.class === 'boundary' && hit.type === 'administrative')
    || PLACE_TYPES.has(hit.addresstype);
}

// The OSM object when Nominatim names it (it always does); otherwise the name
// and position, so hits without ids are not all collapsed into one.
const key = (h) => (h.osm_type && h.osm_id != null)
  ? `${h.osm_type}/${h.osm_id}`
  : `${h.display_name}@${h.lat},${h.lon}`;

function inBox(h, box) {
  if (!box) return false;
  const lon = parseFloat(h.lon), lat = parseFloat(h.lat);
  return lon >= box[0] && lat >= box[1] && lon <= box[2] && lat <= box[3];
}

// The visible text without postcodes: Nominatim often returns the same town
// as its boundary, its place node and a postcode area, and a street as several
// segments — identical to the visitor, so shown once.
const visibleName = (h) => String(h.display_name ?? '').replace(/,\s*\d{4,5}(?=,|$)/g, '').trim();

function kmBetween(h, cx, cy) {
  const kx = Math.cos(cy * Math.PI / 180);
  return Math.hypot((parseFloat(h.lon) - cx) * kx, parseFloat(h.lat) - cy) * 111;
}

/**
 * @param {object[]} globalHits  unbounded answer (Nominatim order = importance)
 * @param {object[]} localHits   answer bounded to the view
 * @param {number[]|null} box    view as [minLon, minLat, maxLon, maxLat]
 * @param {{ limit?: number, maxPlaces?: number, maxRest?: number }} [opts]
 */
export function rankSearchHits(globalHits, localHits, box, { limit = 6, maxPlaces = 3, maxRest = 2 } = {}) {
  const seenKeys = new Set();
  const seenNames = new Set();
  const take = (h) => {
    const k = key(h), n = visibleName(h);
    if (seenKeys.has(k) || seenNames.has(n)) return false;
    seenKeys.add(k); seenNames.add(n);
    return true;
  };
  const all = [...(globalHits ?? []), ...(localHits ?? [])];
  const cx = box ? (box[0] + box[2]) / 2 : null;
  const cy = box ? (box[1] + box[3]) / 2 : null;

  // A place leads the list when it is what the visitor most likely means: in
  // or near the view (100 km), or important in its own right (a major city).
  // A small namesake across the world (Fulda, Minnesota) is still offered, but
  // after what is nearby. In view, a place outranks an equally important one
  // elsewhere: on Fulda, "Petersberg" should be the neighbouring town.
  const leads = (h) => !box || inBox(h, box) || kmBetween(h, cx, cy) < 100
    || (parseFloat(h.importance) || 0) >= 0.45;
  const placeScore = (h) => (parseFloat(h.importance) || 0) + (inBox(h, box) ? 0.1 : 0);
  const places = all.filter(h => isPlace(h) && leads(h))
    .sort((a, b) => placeScore(b) - placeScore(a))
    .filter(take)
    .slice(0, maxPlaces);

  const dist = (h) => box ? kmBetween(h, cx, cy) : 0;
  const local = (localHits ?? []).filter(h => !isPlace(h))
    .sort((a, b) => dist(a) - dist(b))
    .filter(take);

  // Everything else — far-away streets and shops, minor far-away places — in
  // Nominatim's own order, and only a couple of them.
  const rest = (globalHits ?? []).filter(take).slice(0, maxRest);

  return [...places, ...local, ...rest].slice(0, limit);
}
