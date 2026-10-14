import assert from 'node:assert/strict';
import { rankSearchHits, isPlace, searchArea } from './searchRanking.js';

const hit = (id, cls, type, addresstype, importance, lon, lat, name = id) =>
  ({ osm_type: 'node', osm_id: id, class: cls, type, addresstype, importance, lon: String(lon), lat: String(lat), display_name: name });

const WETZLAR = [8.40, 50.50, 8.60, 50.60];

// 1. The reported case: on Wetzlar, "Frankfurt" — the city comes first, the
//    shop in view stays as a later option.
{
  const global = [
    hit(1, 'boundary', 'administrative', 'city', 0.758, 8.68, 50.11, 'Frankfurt am Main'),
    hit(2, 'boundary', 'administrative', 'city', 0.618, 14.55, 52.34, 'Frankfurt (Oder)'),
  ];
  const local = [hit(3, 'shop', 'leather', 'shop', 0, 8.50, 50.55, 'Secnatur Frankfurt')];
  const r = rankSearchHits(global, local, WETZLAR);
  assert.deepEqual(r.map(h => h.display_name), ['Frankfurt am Main', 'Frankfurt (Oder)', 'Secnatur Frankfurt']);
}

// 2. Streets in view come before far-away non-places, nearest first.
{
  const local = [
    hit(10, 'highway', 'residential', 'road', 0.05, 8.59, 50.59, 'Bahnhofstraße far'),
    hit(11, 'highway', 'residential', 'road', 0.05, 8.50, 50.55, 'Bahnhofstraße near'),
  ];
  const global = [hit(12, 'highway', 'residential', 'road', 0.1, 13.4, 52.5, 'Bahnhofstraße Berlin')];
  const r = rankSearchHits(global, local, WETZLAR);
  assert.deepEqual(r.map(h => h.display_name), ['Bahnhofstraße near', 'Bahnhofstraße far', 'Bahnhofstraße Berlin']);
}

// 3. The same object from both answers appears once.
{
  const town = hit(20, 'boundary', 'administrative', 'town', 0.5, 8.5, 50.55, 'Wetzlar');
  assert.equal(rankSearchHits([town], [{ ...town }], WETZLAR).length, 1);
}

// 4. A place in view outranks a slightly more important namesake elsewhere.
{
  const near = hit(30, 'boundary', 'administrative', 'village', 0.40, 8.55, 50.52, 'Petersberg near');
  const far  = hit(31, 'boundary', 'administrative', 'town', 0.45, 9.9, 51.0, 'Petersberg far');
  assert.equal(rankSearchHits([far, near], [], WETZLAR)[0].display_name, 'Petersberg near');
}

// 5. At most three places, so local results are not crowded out; limit holds.
{
  const places = [1, 2, 3, 4, 5].map(i => hit(40 + i, 'place', 'village', 'village', 0.3, 8.4 + i / 50, 50.55, `P${i}`));
  const local = [hit(50, 'amenity', 'cafe', 'amenity', 0, 8.5, 50.55, 'Café')];
  const r = rankSearchHits(places, local, WETZLAR);
  // Three places lead, the local café comes next, further places fill up.
  assert.equal(r.slice(0, 3).filter(isPlace).length, 3);
  assert.equal(r[3].display_name, 'Café');
  assert.ok(r.length <= 6);
}

// 6. No view (hub before the map settles): global order kept, no crash.
{
  const r = rankSearchHits([hit(60, 'place', 'city', 'city', 0.7, 9, 50, 'A')], [], null);
  assert.equal(r[0].display_name, 'A');
}

// 7. Hits without OSM ids are kept apart, not merged into one.
{
  const a = { display_name: 'A', lat: '1', lon: '1' }, b = { display_name: 'B', lat: '2', lon: '2' };
  assert.equal(rankSearchHits([a, b], [], null).length, 2);
}

// 8. The same town as boundary, place node and postcode area shows once.
{
  const r = rankSearchHits([
    hit(70, 'boundary', 'administrative', 'village', 0.4, 8.55, 50.52, 'Petersberg, Landkreis Fulda, Hessen, 36100, Deutschland'),
    hit(71, 'boundary', 'administrative', 'village', 0.39, 8.55, 50.52, 'Petersberg, Landkreis Fulda, Hessen, Deutschland'),
    hit(72, 'place', 'postcode', 'postcode', 0.2, 8.55, 50.52, 'Petersberg, Landkreis Fulda, Hessen, 36100, Deutschland'),
  ], [], WETZLAR);
  assert.equal(r.length, 1);
}

// 9. A small far-away namesake does not lead; nearby local hits come first.
{
  const r = rankSearchHits(
    [hit(80, 'boundary', 'administrative', 'town', 0.59, 9.68, 50.55, 'Fulda, Hessen'),
     hit(81, 'boundary', 'administrative', 'city', 0.30, -95.6, 43.9, 'Fulda, Minnesota')],
    [hit(82, 'highway', 'residential', 'road', 0.05, 8.5, 50.55, 'Fuldaer Straße')],
    WETZLAR);
  assert.deepEqual(r.map(h => h.display_name), ['Fulda, Hessen', 'Fuldaer Straße', 'Fulda, Minnesota']);
}

// 10. Far-away non-places are capped, identical-looking segments shown once.
{
  const zurich = [1, 2, 3, 4, 5].map(i => hit(90 + i, 'highway', 'pedestrian', 'road', 0.3, 8.54, 47.37, 'Bahnhofstrasse, Zürich'));
  const r = rankSearchHits(zurich, [hit(99, 'highway', 'residential', 'road', 0.1, 8.5, 50.55, 'Bahnhofstraße, Wetzlar')], WETZLAR);
  assert.deepEqual(r.map(h => h.display_name), ['Bahnhofstraße, Wetzlar', 'Bahnhofstrasse, Zürich']);
}

// 11. No view, or the view request failed: the global answer fills the list.
{
  const streets = [1, 2, 3, 4, 5].map(i => hit(100 + i, 'highway', 'residential', 'road', 0.1, 8 + i, 50 + i, `Street ${i}`));
  assert.equal(rankSearchHits(streets, null, null).length, 5);
  assert.equal(rankSearchHits(streets, null, WETZLAR).length, 5);
}

// 12. More places than the place slots: the rest still fill the list later.
{
  const villages = [1, 2, 3, 4, 5].map(i => hit(110 + i, 'place', 'village', 'village', 0.3, 8.4 + i / 50, 50.55, `Neu${i}`));
  assert.equal(rankSearchHits(villages, villages, WETZLAR).length, 5);
}

// 13. Address points and postcodes are not places.
{
  assert.equal(isPlace(hit(120, 'place', 'house', 'place', 0.1, 8.5, 50.5)), false);
  assert.equal(isPlace(hit(121, 'place', 'postcode', 'postcode', 0.1, 8.5, 50.5)), false);
  assert.equal(isPlace(hit(122, 'place', 'village', 'village', 0.1, 8.5, 50.5)), true);
}

// 14. A wrapped view (longitudes past 180) still recognises nearby hits.
{
  const wrapped = WETZLAR.map((v, i) => i % 2 === 0 ? v + 360 : v);
  const near = hit(130, 'boundary', 'administrative', 'village', 0.40, 8.55, 50.52, 'Near');
  const far  = hit(131, 'boundary', 'administrative', 'town', 0.45, 9.9, 51.0, 'Far');
  assert.equal(rankSearchHits([far, near], [], wrapped)[0].display_name, 'Near');
}

// 15. A street-level view is widened to ~10 km, so a street 2.5 km away in
//     the same town counts as nearby (#976); a larger view stays as it is.
{
  const z17 = [9.669, 50.548, 9.683, 50.554];   // ~1 km across, Fulda centre
  const area = searchArea(z17);
  const lehnerz = { lon: '9.7032', lat: '50.5718' };
  assert.ok(area[0] < 9.6 && area[2] > 9.75 && area[1] < 50.47 && area[3] > 50.63, JSON.stringify(area));
  assert.ok(+lehnerz.lon > area[0] && +lehnerz.lon < area[2] && +lehnerz.lat > area[1] && +lehnerz.lat < area[3]);
  assert.deepEqual(searchArea(WETZLAR.map((v, i) => i < 2 ? v - 1 : v + 1)), WETZLAR.map((v, i) => i < 2 ? v - 1 : v + 1));
  assert.equal(searchArea(null), null);
  assert.equal(searchArea([NaN, 1, 2, 3]), null);
  // Near the antimeridian the box stays a valid viewbox.
  const fiji = searchArea([179.95, -16.6, 179.97, -16.58]);
  assert.ok(fiji[2] <= 180 && fiji[0] >= -180);
}

// 16. With the widened query, what is on screen still comes first: local hits
//     are ordered by distance from the real view's centre.
{
  const z17 = [9.669, 50.548, 9.683, 50.554];
  const local = [
    hit(140, 'highway', 'residential', 'road', 0.2, 9.80, 50.60, 'Turmstraße, far side'),
    hit(141, 'highway', 'residential', 'road', 0.1, 9.677, 50.551, 'Turmstraße, on screen'),
    hit(142, 'highway', 'residential', 'road', 0.1, 9.703, 50.572, 'Turmstraße, Lehnerz'),
  ];
  assert.deepEqual(rankSearchHits([], local, z17).map(h => h.display_name),
    ['Turmstraße, on screen', 'Turmstraße, Lehnerz', 'Turmstraße, far side']);
}

console.log('searchRanking tests passed.');
