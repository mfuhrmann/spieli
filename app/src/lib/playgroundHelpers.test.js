import assert from 'node:assert/strict';
import { getPlaygroundTitle, hasOsmName, navigationUrl, isMobileUserAgent } from './playgroundHelpers.js';

// hasOsmName decides which `lang` a rendered title carries: an OSM name is a
// proper noun in the region's language, the fallback is interface text. The two
// must not be conflated (WCAG 3.1.2), so the predicate has to agree with
// getPlaygroundTitle's own branch for every tag it reads.

const NAME_TAGS = ['name', 'alt_name', 'loc_name', 'official_name', 'old_name', 'short_name'];

for (const tag of NAME_TAGS) {
  const attr = { [tag]: 'Spielplatz Am Rosengarten' };
  assert.equal(hasOsmName(attr), true, `${tag} alone counts as an OSM name`);
  assert.equal(
    getPlaygroundTitle(attr, () => 'PLACEHOLDER'),
    'Spielplatz Am Rosengarten',
    `${tag} alone produces a title from OSM data`
  );
}

assert.equal(hasOsmName({}), false, 'no tags at all is not an OSM name');
assert.equal(
  hasOsmName({ operator: 'Stadt Fulda', surface: 'sand' }),
  false,
  'unrelated tags do not count'
);
assert.equal(hasOsmName(null), false, 'a null attribute object is not an OSM name');
assert.equal(hasOsmName(undefined), false, 'an undefined attribute object is not an OSM name');

// Empty strings are falsy for getPlaygroundTitle's filter, so they must be
// falsy here too — otherwise the placeholder would be announced as German.
assert.equal(hasOsmName({ name: '' }), false, 'an empty name tag is not an OSM name');
assert.equal(
  getPlaygroundTitle({ name: '' }, () => 'PLACEHOLDER'),
  'PLACEHOLDER',
  'an empty name tag falls back, matching hasOsmName'
);

// Multi-tag titles still come from OSM.
const multi = { name: 'Spielplatz Nord', alt_name: 'Bolzplatz' };
assert.equal(hasOsmName(multi), true);
assert.equal(getPlaygroundTitle(multi, () => 'PLACEHOLDER'), 'Spielplatz Nord (Bolzplatz)');

// navigationUrl: geo: on mobile, OSM directions on desktop (#934)
assert.equal(
  navigationUrl({ lat: 50.5, lon: 9.6, title: 'Bolz platz', mobile: true }),
  'geo:50.5,9.6?q=50.5,9.6(Bolz%20platz)',
);
assert.equal(
  navigationUrl({ lat: 50.5, lon: 9.6, mobile: false, origin: { lat: 50.1, lon: 9.1 } }),
  'https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=50.1,9.1;50.5,9.6',
);
assert.equal(
  navigationUrl({ lat: 50.5, lon: 9.6, mobile: false }),
  'https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=;50.5,9.6',
);
assert.equal(navigationUrl({ lat: NaN, lon: 9.6, mobile: true }), null);
assert.equal(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)'), true);
assert.equal(isMobileUserAgent('Mozilla/5.0 (X11; Linux x86_64)'), false);

console.log('All playgroundHelpers tests passed.');
