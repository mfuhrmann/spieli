import assert from 'node:assert/strict';
import { playgroundCompleteness, hasPhotoSignal } from './completeness.js';

// mapping detail = f(hasEquipment, hasInfo):
//   complete = both present
//   partial  = either present
//   missing  = neither
//
// A photo is NOT an input (#733) — it is surfaced separately via
// hasPhotoSignal(). `name` and `operator` are not signals either.
//
// This must stay in lockstep with the completeness_attrs CTE in
// importer/api.sql; see docs/reference/completeness.md.

// --- complete: equipment AND info ---

// 1. devices + surface → complete
{
  assert.equal(
    playgroundCompleteness({ device_count: 2, surface: 'sand' }),
    'complete',
  );
}

// 2. pitch + opening_hours → complete
{
  assert.equal(
    playgroundCompleteness({ has_soccer: true, opening_hours: 'Mo-Su 08:00-20:00' }),
    'complete',
  );
}

// 3. a photo neither adds to nor subtracts from the rule — the same props
//    reach the same state with and without one
{
  const base = { device_count: 1, surface: 'sand' };
  assert.equal(playgroundCompleteness(base), 'complete');
  assert.equal(playgroundCompleteness({ ...base, panoramax: 'abc123' }), 'complete');
  assert.equal(playgroundCompleteness({ ...base, wikimedia_commons: 'Category:Foo' }), 'complete');
}

// --- partial: exactly one of the two ---

// 4. equipment only
{
  assert.equal(playgroundCompleteness({ device_count: 1 }), 'partial');
  assert.equal(playgroundCompleteness({ table_tennis_count: 1 }), 'partial');
  assert.equal(playgroundCompleteness({ has_soccer: true }), 'partial');
  assert.equal(playgroundCompleteness({ has_basketball: true }), 'partial');
}

// 5. info only
{
  assert.equal(playgroundCompleteness({ opening_hours: 'Mo-Su 08:00-20:00' }), 'partial');
  assert.equal(playgroundCompleteness({ surface: 'sand' }), 'partial');
}

// 6. non-trivial access counts as info
{
  assert.equal(playgroundCompleteness({ access: 'private' }), 'partial');
  assert.equal(playgroundCompleteness({ access: 'no' }), 'partial');
  assert.equal(playgroundCompleteness({ access: 'permissive' }), 'partial');
}

// --- missing ---

// 7. a photo alone is not mapping detail — it no longer lifts anything
{
  assert.equal(playgroundCompleteness({ panoramax: 'abc' }), 'missing');
  assert.equal(playgroundCompleteness({ 'panoramax:sequence': 'abc' }), 'missing');
  assert.equal(playgroundCompleteness({ wikimedia_commons: 'Category:Foo' }), 'missing');
  assert.equal(playgroundCompleteness({ image: 'https://upload.wikimedia.org/x.jpg' }), 'missing');
}

// 8. street furniture is NOT play infrastructure (#776). A bench inside a
//    playground area says nothing about whether there is anything to play on,
//    and under the equipment-as-pivot rule it would otherwise carry a
//    playground to `complete` on a bench plus a surface tag.
{
  const furniture = [
    { bench_count: 3 },
    { shelter_count: 1 },
    { picnic_count: 2 },
  ];
  for (const props of furniture) {
    assert.equal(
      playgroundCompleteness(props), 'missing',
      `furniture must not count as equipment: ${JSON.stringify(props)}`,
    );
    // …and must not reach `complete` when combined with info either.
    assert.equal(
      playgroundCompleteness({ ...props, surface: 'sand' }), 'partial',
      `furniture + info must stay partial: ${JSON.stringify(props)}`,
    );
  }
}

// 9. derived audience/feature flags are out. They are computed from tags on
//    equipment, so a real device already satisfies device_count — but a bench
//    carrying wheelchair=yes would set for_wheelchair, which is the same false
//    signal (#776).
{
  const derived = [
    { is_water: true },
    { for_baby: true },
    { for_toddler: true },
    { for_wheelchair: true },
  ];
  for (const props of derived) {
    assert.equal(
      playgroundCompleteness(props), 'missing',
      `derived flag must not count as equipment: ${JSON.stringify(props)}`,
    );
  }
}

// 10. access: 'yes' does NOT count as info
{
  assert.equal(playgroundCompleteness({ access: 'yes' }), 'missing');
}

// 11. name and operator are administrative, not mapping detail
{
  assert.equal(playgroundCompleteness({ name: 'Park' }), 'missing');
  assert.equal(playgroundCompleteness({ operator: 'City Parks' }), 'missing');
  assert.equal(playgroundCompleteness({ name: 'Park', operator: 'City Parks' }), 'missing');
}

// 12. zero counts do not count
{
  assert.equal(playgroundCompleteness({ device_count: 0, table_tennis_count: 0 }), 'missing');
}

// 13. nothing relevant
{
  assert.equal(playgroundCompleteness({}), 'missing');
  assert.equal(playgroundCompleteness({ nearest_highway: 'residential' }), 'missing');
}

// --- hasPhotoSignal: the additive marker ---

// 14. tags that count as a renderable photo
{
  assert.equal(hasPhotoSignal({ panoramax: 'abc123' }), true);
  assert.equal(hasPhotoSignal({ 'panoramax:sequence': 'abc' }), true);
  assert.equal(hasPhotoSignal({ wikimedia_commons: 'Category:Foo' }), true);
  assert.equal(hasPhotoSignal({ image: 'https://upload.wikimedia.org/x.jpg' }), true);
  assert.equal(hasPhotoSignal({ image: 'https://commons.wikimedia.org/wiki/File:X.jpg' }), true);
}

// 15. an image the gallery cannot render is not a photo signal (#650)
{
  assert.equal(hasPhotoSignal({ image: 'https://www.mapillary.com/app/?pKey=123' }), false);
  assert.equal(hasPhotoSignal({ image: 'https://example.com/x.jpg' }), false);
  // host-suffix spoof must not slip through
  assert.equal(hasPhotoSignal({ image: 'https://wikimedia.org.evil.com/x.jpg' }), false);
  // plain http (mixed content) does not count
  assert.equal(hasPhotoSignal({ image: 'http://upload.wikimedia.org/x.jpg' }), false);
}

// 16. no photo tag at all
{
  assert.equal(hasPhotoSignal({}), false);
  assert.equal(hasPhotoSignal({ device_count: 3, surface: 'sand' }), false);
}

console.log('All completeness tests passed.');
