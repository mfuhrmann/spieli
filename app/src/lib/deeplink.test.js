import assert from 'node:assert/strict';
import { parseHash, writeHash, isValidSlug } from './deeplink.js';

// --- parseHash ---

// 1. Falsy / empty input → null
{
  assert.equal(parseHash(null), null);
  assert.equal(parseHash(''), null);
  assert.equal(parseHash('#'), null);
}

// 2. Legacy form #W<id>
{
  const r = parseHash('#W123');
  assert.deepEqual(r, { slug: null, osmId: 123, kind: 'playground' });
}

// 3. Slug form #<slug>/W<id>
{
  const r = parseHash('#fulda/W456');
  assert.deepEqual(r, { slug: 'fulda', osmId: 456, kind: 'playground' });
}

// 4. Slug with digits and hyphens
{
  const r = parseHash('#my-city-01/W789');
  assert.deepEqual(r, { slug: 'my-city-01', osmId: 789, kind: 'playground' });
}

// 5. Input without leading # is accepted (function prepends it)
{
  const r = parseHash('W123');
  assert.deepEqual(r, { slug: null, osmId: 123, kind: 'playground' });
}

// 6. Uppercase slug is not a valid slug → null
{
  assert.equal(parseHash('#Berlin/W100'), null);
}

// 7. Hash without W prefix or osm_id → null
{
  assert.equal(parseHash('#just-text'), null);
  assert.equal(parseHash('#123'), null);
  assert.equal(parseHash('#/W123'), null);
}

// --- writeHash ---

// 8. Null/undefined slug → legacy form
{
  assert.equal(writeHash({ slug: null, osmId: 123 }), '#W123');
  assert.equal(writeHash({ slug: undefined, osmId: 99 }), '#W99');
}

// 9. Valid slug → prefixed form
{
  assert.equal(writeHash({ slug: 'fulda', osmId: 456 }), '#fulda/W456');
  assert.equal(writeHash({ slug: 'my-city-01', osmId: 1 }), '#my-city-01/W1');
}

// 10. Invalid slug (uppercase) → legacy form
{
  assert.equal(writeHash({ slug: 'Fulda', osmId: 1 }), '#W1');
}

// 11. Empty string slug → legacy form
{
  assert.equal(writeHash({ slug: '', osmId: 5 }), '#W5');
}

// 12. parseHash(writeHash(x)) round-trips correctly
{
  const legacy = { slug: null, osmId: 42, kind: 'playground' };
  assert.deepEqual(parseHash(writeHash(legacy)), legacy);

  const withSlug = { slug: 'fulda', osmId: 99, kind: 'playground' };
  assert.deepEqual(parseHash(writeHash(withSlug)), withSlug);

  const pitch = { slug: null, osmId: 7, kind: 'pitch' };
  assert.deepEqual(parseHash(writeHash(pitch)), pitch);
}

// 13. Pitch links (#934): P letter, with and without slug; default kind is playground
{
  assert.deepEqual(parseHash('#P923521639'), { slug: null, osmId: 923521639, kind: 'pitch' });
  assert.deepEqual(parseHash('#fulda/P5'), { slug: 'fulda', osmId: 5, kind: 'pitch' });
  assert.equal(writeHash({ slug: null, osmId: 5, kind: 'pitch' }), '#P5');
  assert.equal(writeHash({ slug: 'fulda', osmId: 5, kind: 'pitch' }), '#fulda/P5');
  assert.equal(writeHash({ osmId: 5 }), '#W5');
  assert.equal(parseHash('#X5'), null);
}

// --- isValidSlug ---

// 13. Valid slugs
{
  assert.equal(isValidSlug('fulda'), true);
  assert.equal(isValidSlug('my-city'), true);
  assert.equal(isValidSlug('abc123'), true);
  assert.equal(isValidSlug('a'), true);
}

// 14. Invalid slugs
{
  assert.equal(isValidSlug(''), false);
  assert.equal(isValidSlug('Berlin'), false);
  assert.equal(isValidSlug('my_city'), false);
  assert.equal(isValidSlug(null), false);
  assert.equal(isValidSlug(42), false);
  assert.equal(isValidSlug('has space'), false);
}

console.log('All deeplink tests passed.');
