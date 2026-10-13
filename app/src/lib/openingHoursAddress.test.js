import assert from 'node:assert/strict';
import OpeningHours from 'opening_hours';
import { openingHoursAddressFor } from './openingHoursAddress.js';

// A value that is closed on public holidays, evaluated on a day that is a
// holiday only in some German states. "closed" = the state was recognised.
const isOpen = (address, date) =>
  new OpeningHours('Mo-Su 08:00-20:00; PH off', { address }).getState(new Date(`${date}T10:00:00`));

const CORPUS_CHRISTI = '2026-06-04'; // holiday in Hessen, not in Berlin
const REFORMATION_DAY = '2026-10-31'; // holiday in Thüringen, not in Hessen
const EPIPHANY = '2026-01-06'; // holiday in Baden-Württemberg, not in Hessen

// 1. The documented short code, the ISO form and the full name all work (#878:
//    the short code used to be ignored silently).
for (const state of ['he', 'HE', 'DE-HE', 'de-he', 'Hessen']) {
  const addr = openingHoursAddressFor('de', state);
  assert.equal(isOpen(addr, CORPUS_CHRISTI), false, `${state}: Corpus Christi is a holiday in Hessen`);
  assert.equal(isOpen(addr, REFORMATION_DAY), true, `${state}: Reformation Day is not one in Hessen`);
}

// 2. The two states whose names carry umlauts — the entrypoint used to strip
//    them, so these were unconfigurable.
for (const state of ['th', 'Thüringen']) {
  assert.equal(isOpen(openingHoursAddressFor('de', state), REFORMATION_DAY), false, state);
}
for (const state of ['bw', 'Baden-Württemberg']) {
  assert.equal(isOpen(openingHoursAddressFor('de', state), EPIPHANY), false, state);
}

// 3. No state → no state passed, exactly as before the option existed.
assert.deepEqual(openingHoursAddressFor('de', ''), { country_code: 'de' });
assert.deepEqual(openingHoursAddressFor('DE', '  '), { country_code: 'de' });
assert.equal(isOpen(openingHoursAddressFor('de', ''), CORPUS_CHRISTI), true);

// 4. Shape: both fields are passed so either form resolves.
assert.deepEqual(openingHoursAddressFor('de', 'he'),
  { country_code: 'de', state: 'he', 'ISO3166-2-lvl4': 'DE-HE' });

console.log('openingHoursAddress tests passed.');
