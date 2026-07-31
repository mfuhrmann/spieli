import assert from 'node:assert/strict';
import { playgroundCompleteness, hasPhotoSignal } from './completeness.js';

// completeness = f(hasEquipment, hasInfo):
//   complete = both present
//   partial  = exactly one present
//   missing  = neither
//
// A photo is deliberately NOT part of this rule (#733) — it is surfaced
// separately by hasPhotoSignal(). `name` and `operator` are not signals
// either (see completeness.js).

// --- complete: equipment AND info ---

// 1. equipment + info, no photo → complete (the case the old rule held at
//    partial, which is the whole point of the rework)
{
  assert.equal(playgroundCompleteness({ bench_count: 2, opening_hours: 'x' }), 'complete');
  assert.equal(playgroundCompleteness({ device_count: 12, surface: 'sand' }), 'complete');
}

// 2. equipment + info + photo → complete (a photo neither helps nor hurts)
{
  assert.equal(
    playgroundCompleteness({ panoramax: 'abc123', device_count: 2, surface: 'sand' }),
    'complete',
  );
  assert.equal(
    playgroundCompleteness({ wikimedia_commons: 'Category:Foo', device_count: 1, surface: 'sand' }),
    'complete',
  );
}

// 3. non-trivial access counts as info → complete when paired with equipment
{
  assert.equal(playgroundCompleteness({ device_count: 1, access: 'private' }), 'complete');
  assert.equal(playgroundCompleteness({ device_count: 1, access: 'permissive' }), 'complete');
}

// --- partial: exactly one of the two ---

// 4. equipment only → partial
{
  assert.equal(playgroundCompleteness({ device_count: 1 }), 'partial');
  assert.equal(playgroundCompleteness({ panoramax: 'abc', device_count: 1 }), 'partial');
}

// 5. info only → partial
{
  assert.equal(playgroundCompleteness({ opening_hours: 'Mo-Su 08:00-20:00' }), 'partial');
  assert.equal(playgroundCompleteness({ surface: 'sand' }), 'partial');
  assert.equal(playgroundCompleteness({ panoramax: 'abc', surface: 'grass' }), 'partial');
}

// 6. non-trivial access alone counts as info → partial
{
  assert.equal(playgroundCompleteness({ access: 'private' }), 'partial');
  assert.equal(playgroundCompleteness({ access: 'no' }), 'partial');
  assert.equal(playgroundCompleteness({ access: 'permissive' }), 'partial');
}

// 7. each equipment flag individually counts as equipment → partial
{
  const equipmentProps = [
    { device_count: 1 },
    { bench_count: 1 },
    { shelter_count: 1 },
    { picnic_count: 1 },
    { table_tennis_count: 1 },
    { has_soccer: true },
    { has_basketball: true },
    { is_water: true },
    { for_baby: true },
    { for_toddler: true },
    { for_wheelchair: true },
  ];
  for (const props of equipmentProps) {
    assert.equal(playgroundCompleteness(props), 'partial', `expected partial for ${JSON.stringify(props)}`);
  }
}

// --- missing: neither ---

// 8. a photo on its own no longer lifts the bucket → missing
{
  assert.equal(playgroundCompleteness({ panoramax: 'abc' }), 'missing');
  assert.equal(playgroundCompleteness({ 'panoramax:sequence': 'abc' }), 'missing');
  assert.equal(playgroundCompleteness({ wikimedia_commons: 'Category:Foo' }), 'missing');
  assert.equal(playgroundCompleteness({ image: 'https://upload.wikimedia.org/x.jpg' }), 'missing');
}

// 9. access: 'yes' does NOT count as info → missing
{
  assert.equal(playgroundCompleteness({ access: 'yes' }), 'missing');
}

// 10. name and operator are NOT signals → missing
{
  assert.equal(playgroundCompleteness({ name: 'Park' }), 'missing');
  assert.equal(playgroundCompleteness({ operator: 'City Parks' }), 'missing');
  assert.equal(playgroundCompleteness({ name: 'Park', operator: 'City Parks' }), 'missing');
}

// 11. zero counts do NOT count as equipment → missing
{
  assert.equal(playgroundCompleteness({ device_count: 0, bench_count: 0 }), 'missing');
}

// 12. empty-string tags are treated as absent, matching the SQL NULLIF('','')
{
  assert.equal(playgroundCompleteness({ surface: '', opening_hours: '' }), 'missing');
  assert.equal(playgroundCompleteness({ device_count: 1, surface: '' }), 'partial');
}

// 13. nothing relevant → missing
{
  assert.equal(playgroundCompleteness({}), 'missing');
  assert.equal(playgroundCompleteness({ nearest_highway: 'residential' }), 'missing');
}

// --- the photo signal, now standalone ---

// 14. panoramax, panoramax:*, wikimedia_commons and Wikimedia-hosted images
//     all count (issue #650)
{
  assert.equal(hasPhotoSignal({ panoramax: 'abc' }), true);
  assert.equal(hasPhotoSignal({ 'panoramax:sequence': 'abc' }), true);
  assert.equal(hasPhotoSignal({ wikimedia_commons: 'Category:Foo' }), true);
  assert.equal(hasPhotoSignal({ image: 'https://upload.wikimedia.org/x.jpg' }), true);
  assert.equal(hasPhotoSignal({ image: 'https://commons.wikimedia.org/wiki/File:X.jpg' }), true);
}

// 15. off-Wikimedia image links do NOT count — the gallery can't render them
{
  assert.equal(hasPhotoSignal({ image: 'https://www.mapillary.com/app/?pKey=123' }), false);
  assert.equal(hasPhotoSignal({ image: 'https://example.com/x.jpg' }), false);
  // host-suffix spoof must not slip through
  assert.equal(hasPhotoSignal({ image: 'https://wikimedia.org.evil.com/x.jpg' }), false);
  // plain http (mixed content) does not count
  assert.equal(hasPhotoSignal({ image: 'http://upload.wikimedia.org/x.jpg' }), false);
}

// 16. no photo tags at all
{
  assert.equal(hasPhotoSignal({}), false);
  assert.equal(hasPhotoSignal({ device_count: 3, surface: 'sand' }), false);
}

// 17. the photo signal is independent of the bucket in both directions
{
  const detailedWithPhoto = { device_count: 1, surface: 'sand', panoramax: 'abc' };
  const detailedNoPhoto   = { device_count: 1, surface: 'sand' };
  assert.equal(playgroundCompleteness(detailedWithPhoto), playgroundCompleteness(detailedNoPhoto));
  assert.equal(hasPhotoSignal(detailedWithPhoto), true);
  assert.equal(hasPhotoSignal(detailedNoPhoto), false);
}

// --- JS ↔ SQL parity ---
//
// 18. The full hasEquipment × hasInfo truth table. The identical table is
//     asserted against the SQL rule by the "Assert JS/SQL rule parity" step in
//     .github/workflows/db-smoke.yml. Both sides must be edited together —
//     changing one and not the other makes a feature classified from Overpass
//     data disagree with the same feature classified from PostgREST.
{
  const TRUTH_TABLE = [
    { hasEquipment: false, hasInfo: false, expected: 'missing'  },
    { hasEquipment: false, hasInfo: true,  expected: 'partial'  },
    { hasEquipment: true,  hasInfo: false, expected: 'partial'  },
    { hasEquipment: true,  hasInfo: true,  expected: 'complete' },
  ];
  for (const { hasEquipment, hasInfo, expected } of TRUTH_TABLE) {
    const props = {};
    if (hasEquipment) props.device_count = 1;
    if (hasInfo) props.surface = 'sand';
    assert.equal(
      playgroundCompleteness(props), expected,
      `equipment=${hasEquipment} info=${hasInfo} should be ${expected}`,
    );
    // …and the same holds with a photo present, since it is not an input.
    assert.equal(playgroundCompleteness({ ...props, panoramax: 'abc' }), expected);
  }
}

console.log('All completeness tests passed.');
