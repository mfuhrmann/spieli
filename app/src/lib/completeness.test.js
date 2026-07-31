import assert from 'node:assert/strict';
import { playgroundCompleteness } from './completeness.js';

// completeness = f(hasPhoto, hasEquipment, hasInfo):
//   complete = all three present
//   partial  = at least one present
//   missing  = none present
// `name` and `operator` are intentionally NOT signals (see completeness.js).

// --- complete: all three signals ---

// 1. photo + equipment + info → complete
{
  assert.equal(
    playgroundCompleteness({ panoramax: 'abc123', device_count: 2, surface: 'sand' }),
    'complete',
  );
}

// 2. panoramax:* prefix counts as photo → complete
{
  assert.equal(
    playgroundCompleteness({ 'panoramax:sequence': 'abc', has_soccer: true, opening_hours: 'Mo-Su 08:00-20:00' }),
    'complete',
  );
}

// --- partial: exactly one or two signals ---

// 3. photo + equipment, no info → partial
{
  assert.equal(playgroundCompleteness({ panoramax: 'abc', device_count: 1 }), 'partial');
}

// 4. photo + info, no equipment → partial
{
  assert.equal(playgroundCompleteness({ panoramax: 'abc', surface: 'grass' }), 'partial');
}

// 5. equipment + info, no photo → partial
{
  assert.equal(playgroundCompleteness({ bench_count: 2, opening_hours: 'x' }), 'partial');
}

// 6. photo only → partial
{
  assert.equal(playgroundCompleteness({ panoramax: 'abc' }), 'partial');
}

// 6a. wikimedia_commons counts as a photo (issue #650) → partial
{
  assert.equal(playgroundCompleteness({ wikimedia_commons: 'Category:Foo' }), 'partial');
}

// 6b. Wikimedia-hosted image tag counts as a photo (issue #650) → partial
{
  assert.equal(playgroundCompleteness({ image: 'https://upload.wikimedia.org/x.jpg' }), 'partial');
  assert.equal(playgroundCompleteness({ image: 'https://commons.wikimedia.org/wiki/File:X.jpg' }), 'partial');
}

// 6d. Off-Wikimedia image link does NOT count — the gallery can't render it,
// so it must not raise completeness (issue #650) → missing
{
  assert.equal(playgroundCompleteness({ image: 'https://www.mapillary.com/app/?pKey=123' }), 'missing');
  assert.equal(playgroundCompleteness({ image: 'https://example.com/x.jpg' }), 'missing');
  // host-suffix spoof must not slip through
  assert.equal(playgroundCompleteness({ image: 'https://wikimedia.org.evil.com/x.jpg' }), 'missing');
  // plain http (mixed content) does not count
  assert.equal(playgroundCompleteness({ image: 'http://upload.wikimedia.org/x.jpg' }), 'missing');
}

// 6c. wikimedia_commons + equipment + info → complete
{
  assert.equal(
    playgroundCompleteness({ wikimedia_commons: 'Category:Foo', device_count: 1, surface: 'sand' }),
    'complete',
  );
}

// 7. equipment only → partial
{
  assert.equal(playgroundCompleteness({ device_count: 1 }), 'partial');
}

// 8. info only (opening_hours / surface) → partial
{
  assert.equal(playgroundCompleteness({ opening_hours: 'Mo-Su 08:00-20:00' }), 'partial');
  assert.equal(playgroundCompleteness({ surface: 'sand' }), 'partial');
}

// 9. non-trivial access counts as info → partial
{
  assert.equal(playgroundCompleteness({ access: 'private' }), 'partial');
  assert.equal(playgroundCompleteness({ access: 'no' }), 'partial');
  assert.equal(playgroundCompleteness({ access: 'permissive' }), 'partial');
}

// 10. each equipment flag individually counts as equipment → partial
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

// --- missing: no signals ---

// 11. access: 'yes' does NOT count as info → missing
{
  assert.equal(playgroundCompleteness({ access: 'yes' }), 'missing');
}

// 12. name and operator are NOT signals → missing
{
  assert.equal(playgroundCompleteness({ name: 'Park' }), 'missing');
  assert.equal(playgroundCompleteness({ operator: 'City Parks' }), 'missing');
  assert.equal(playgroundCompleteness({ name: 'Park', operator: 'City Parks' }), 'missing');
}

// 13. zero counts do NOT count as equipment → missing
{
  assert.equal(playgroundCompleteness({ device_count: 0, bench_count: 0 }), 'missing');
}

// 14. nothing relevant → missing
{
  assert.equal(playgroundCompleteness({}), 'missing');
  assert.equal(playgroundCompleteness({ nearest_highway: 'residential' }), 'missing');
}

console.log('All completeness tests passed.');
