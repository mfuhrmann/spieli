import assert from 'node:assert/strict';
import { matchesFilters, hasActiveFilters } from './filters.js';

const noFilters = {
  private: false, water: false, baby: false, toddler: false,
  wheelchair: false, bench: false, picnic: false, shelter: false,
  tableTennis: false, soccer: false, basketball: false, standalonePitches: false,
};

// --- matchesFilters ---

// 1. No active filters → always passes
{
  assert.equal(matchesFilters({}, noFilters), true);
  assert.equal(matchesFilters({ access: 'private', is_water: false }, noFilters), true);
}

// 2. private filter: access=private or access=no → excluded; anything else → included
{
  const f = { ...noFilters, private: true };
  assert.equal(matchesFilters({ access: 'private' }, f), false);
  assert.equal(matchesFilters({ access: 'no' }, f), false);
  assert.equal(matchesFilters({ access: 'yes' }, f), true);
  assert.equal(matchesFilters({}, f), true);
}

// 3. water filter
{
  const f = { ...noFilters, water: true };
  assert.equal(matchesFilters({ is_water: true }, f), true);
  assert.equal(matchesFilters({ is_water: false }, f), false);
  assert.equal(matchesFilters({}, f), false);
}

// 4. baby filter
{
  const f = { ...noFilters, baby: true };
  assert.equal(matchesFilters({ for_baby: true }, f), true);
  assert.equal(matchesFilters({ for_baby: false }, f), false);
  assert.equal(matchesFilters({}, f), false);
}

// 5. toddler filter
{
  const f = { ...noFilters, toddler: true };
  assert.equal(matchesFilters({ for_toddler: true }, f), true);
  assert.equal(matchesFilters({}, f), false);
}

// 6. wheelchair filter
{
  const f = { ...noFilters, wheelchair: true };
  assert.equal(matchesFilters({ for_wheelchair: true }, f), true);
  assert.equal(matchesFilters({ for_wheelchair: false }, f), false);
}

// 7. bench filter — bench_count must be > 0
{
  const f = { ...noFilters, bench: true };
  assert.equal(matchesFilters({ bench_count: 2 }, f), true);
  assert.equal(matchesFilters({ bench_count: 0 }, f), false);
  assert.equal(matchesFilters({}, f), false);
}

// 8. picnic filter
{
  const f = { ...noFilters, picnic: true };
  assert.equal(matchesFilters({ picnic_count: 1 }, f), true);
  assert.equal(matchesFilters({ picnic_count: 0 }, f), false);
}

// 9. shelter filter
{
  const f = { ...noFilters, shelter: true };
  assert.equal(matchesFilters({ shelter_count: 1 }, f), true);
  assert.equal(matchesFilters({}, f), false);
}

// 10. tableTennis filter
{
  const f = { ...noFilters, tableTennis: true };
  assert.equal(matchesFilters({ table_tennis_count: 1 }, f), true);
  assert.equal(matchesFilters({ table_tennis_count: 0 }, f), false);
}

// 11. soccer filter
{
  const f = { ...noFilters, soccer: true };
  assert.equal(matchesFilters({ has_soccer: true }, f), true);
  assert.equal(matchesFilters({ has_soccer: false }, f), false);
}

// 12. basketball filter
{
  const f = { ...noFilters, basketball: true };
  assert.equal(matchesFilters({ has_basketball: true }, f), true);
  assert.equal(matchesFilters({}, f), false);
}

// 13. Multiple active filters — ALL must match
{
  const f = { ...noFilters, water: true, bench: true };
  assert.equal(matchesFilters({ is_water: true, bench_count: 1 }, f), true);
  assert.equal(matchesFilters({ is_water: true, bench_count: 0 }, f), false);
  assert.equal(matchesFilters({ is_water: false, bench_count: 1 }, f), false);
}

// --- hasActiveFilters ---

// 14. All false → false
{
  assert.equal(hasActiveFilters(noFilters), false);
}

// 15. Any single true → true
{
  assert.equal(hasActiveFilters({ ...noFilters, water: true }), true);
  assert.equal(hasActiveFilters({ ...noFilters, standalonePitches: true }), true);
  assert.equal(hasActiveFilters({ ...noFilters, basketball: true }), true);
}

console.log('All filter tests passed.');
