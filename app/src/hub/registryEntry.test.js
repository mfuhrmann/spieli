import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { normaliseBackendUrl, normaliseSlug, parseCountry, usableEntries } from './registryEntry.js';

const quiet = (fn) => {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  try { return { value: fn(), warns }; } finally { console.warn = orig; }
};

// --- parseCountry (#741) ---
{
  const { warns } = quiet(() => {
    assert.equal(parseCountry('SK', 'u'), 'SK');
    assert.equal(parseCountry(' sk ', 'u'), 'SK');
    assert.equal(parseCountry(undefined, 'u'), null);
    assert.equal(parseCountry('', 'u'), null);
  });
  assert.equal(warns.length, 0, 'absent is not a warning');
  const bad = quiet(() => [parseCountry('SVK', 'u'), parseCountry(42, 'u')]);
  assert.deepEqual(bad.value, [null, null]);
  assert.equal(bad.warns.length, 2);
  assert.match(bad.warns[0], /backend u/);
}

// --- normaliseSlug: never repaired, only accepted or dropped ---
{
  assert.equal(normaliseSlug('kosice', 'u'), 'kosice');
  const r = quiet(() => normaliseSlug('Kosice', 'u'));
  assert.equal(r.value, null);
  assert.match(r.warns[0], /invalid slug "Kosice" on backend u/);
}

// --- usableEntries: empty and duplicate URLs are skipped with a warning ---
{
  const r = quiet(() => usableEntries([
    { url: 'https://a.de/api', name: 'A' },
    { url: 'https://a.de/api/ ', name: 'A again' },
    { name: 'No URL' },
    { url: '/', name: 'Slash' },
    { url: ' https://b.de/api', name: 'B' },
  ]));
  assert.deepEqual(r.value.map(e => e.url), ['https://a.de/api', 'https://b.de/api']);
  assert.equal(r.warns.length, 3);
  assert.ok(r.warns.some(w => /duplicate url https:\/\/a\.de\/api/.test(w)));
}

// --- normaliseBackendUrl agrees with poll-federation.sh's jq (#740) ---
// The health merge matches federation-status.json to backends by exact URL,
// so both sides are run on the same inputs here. U+FEFF and U+00A0 are the
// cases where JS trim() and jq's \s used to disagree.
const CASES = [
  'https://hojdy.sk/api ',
  '  https://x.de/api//',
  '\thttps://t.de/api\n',
  '/api',
  '/api2/',
  '\uFEFFhttps://bom.de/api',
  'https://nbsp.de/api\u00A0',
];
for (const c of CASES.slice(0, 5)) {
  assert.equal(normaliseBackendUrl(c), c.trim().replace(/\/+$/, ''), JSON.stringify(c));
}
{
  const script = readFileSync(new URL('../../../oci/app/poll-federation.sh', import.meta.url), 'utf8');
  const filter = /^jq -r '(.+)' \\$/m.exec(script)?.[1];
  assert.ok(filter, 'jq filter not found in poll-federation.sh');
  let jqOut = null;
  try {
    jqOut = execFileSync('jq', ['-r', filter], {
      input: JSON.stringify({ instances: CASES.map((url, i) => ({ slug: `s${i}`, url })) }),
      encoding: 'utf8',
    });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    console.log('registryEntry.test.js: jq not installed — parity check skipped');
  }
  if (jqOut !== null) {
    const fromJq = jqOut.replace(/\n$/, '').split('\n').map(l => l.split('\t')[1]);
    assert.deepEqual(fromJq, CASES.map(normaliseBackendUrl), 'jq and normaliseBackendUrl must agree');
  }
}

console.log('registryEntry.test.js: all assertions passed');
