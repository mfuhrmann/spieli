import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import OpeningHours from 'opening_hours';
import { resolveOpeningHoursAddress } from './openingHoursAddress.js';
import table from './holidayStates.generated.json' with { type: 'json' };

const addr = (cc, s) => resolveOpeningHoursAddress(cc, s).address;
const warn = (cc, s) => resolveOpeningHoursAddress(cc, s).warning;

// A value that is closed on public holidays, evaluated on a day that is a
// holiday only in some German states. "closed" = the state was recognised.
const isOpen = (address, date) =>
  new OpeningHours('Mo-Su 08:00-20:00; PH off', { address }).getState(new Date(`${date}T10:00:00`));
const CORPUS_CHRISTI = '2026-06-04';  // holiday in Hessen
const REFORMATION_DAY = '2026-10-31'; // holiday in Thüringen, not in Hessen
const EPIPHANY = '2026-01-06';        // holiday in Baden-Württemberg

// 0. The table matches the installed library; regenerate with
//    `make holiday-states` after an opening_hours bump.
const installed = JSON.parse(readFileSync(new URL('../../node_modules/opening_hours/package.json', import.meta.url))).version;
assert.equal(table.opening_hours, installed,
  `holidayStates.generated.json is from opening_hours ${table.opening_hours}, installed is ${installed} — run make holiday-states`);

// 1. The documented code, the ISO form and the name, in any case, all resolve
//    to the library's name — the code used to be ignored silently (#878).
for (const s of ['he', 'HE', 'DE-HE', 'de-he', 'Hessen', 'hessen', ' Hessen ']) {
  assert.deepEqual(addr('de', s), { country_code: 'de', state: 'Hessen' }, s);
  assert.equal(warn('de', s), null, s);
}
assert.equal(isOpen(addr('de', 'he'), CORPUS_CHRISTI), false, 'Corpus Christi is a holiday in Hessen');
assert.equal(isOpen(addr('de', 'he'), REFORMATION_DAY), true, 'Reformation Day is not one in Hessen');

// 2. The umlaut states the entrypoint used to mangle.
for (const s of ['th', 'Thüringen']) assert.equal(isOpen(addr('de', s), REFORMATION_DAY), false, s);
for (const s of ['bw', 'Baden-Württemberg']) assert.equal(isOpen(addr('de', s), EPIPHANY), false, s);

// 3. Codes that contain a hyphen themselves are not mistaken for a prefix.
assert.equal(addr('ch', 'ai-ap').state, table.countries.ch.codes['ai-ap']);
assert.equal(addr('ch', 'CH-AI-AP').state, table.countries.ch.codes['ai-ap']);

// 4. Unknown values and another country's code: no state, and a warning.
assert.deepEqual(addr('de', 'Thueringen'), { country_code: 'de' });
assert.match(warn('de', 'Thueringen'), /not a state of "de"/);
assert.match(warn('at', 'DE-BY'), /looks like a code for "de"/);
assert.deepEqual(addr('at', 'DE-BY'), { country_code: 'at' });

// 5. No state → no state passed, exactly as before the option existed.
assert.deepEqual(addr('de', ''), { country_code: 'de' });
assert.deepEqual(addr('DE', '  '), { country_code: 'de' });
assert.equal(warn('de', ''), null);
assert.equal(isOpen(addr('de', ''), CORPUS_CHRISTI), true);

// 6. Every name in the table is accepted by the library as-is (no throw).
for (const [cc, { names }] of Object.entries(table.countries)) {
  for (const state of names) new OpeningHours('Mo-Su 08:00-20:00; PH off', { address: { country_code: cc, state } });
}

console.log('openingHoursAddress tests passed.');
