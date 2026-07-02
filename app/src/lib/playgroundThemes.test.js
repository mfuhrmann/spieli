import assert from 'node:assert/strict';
import { aggregatePlaygroundThemes, themeOf, themeIcon, themeName, FALLBACK_ICON } from './playgroundThemes.js';

const dev = theme => ({ 'playground:theme': theme });

// --- themeOf: clean per-device value ---

// allowlisted value passes through, lowercased
assert.equal(themeOf(dev('Ship')), 'ship');
// multi-value keeps the first allowlisted one
assert.equal(themeOf(dev('ship;castle')), 'ship');
// non-allowlisted device shape (spring-rider motif) → null
assert.equal(themeOf(dev('horse')), null);
assert.equal(themeOf(dev('duck')), null);
// noise → null
assert.equal(themeOf(dev('playground')), null);
assert.equal(themeOf(dev('yes')), null);
// absent → null
assert.equal(themeOf({}), null);
assert.equal(themeOf(undefined), null);

// --- themeIcon: curated + fallback ---

assert.equal(themeIcon('castle'), '🏰');
assert.equal(themeIcon('unicorn'), FALLBACK_ICON); // non-allowlisted → defensive fallback

// --- themeName: i18n with raw fallback ---

const t = (key, opts) => (key === 'equipAttr.themes.ship' ? 'Ship' : opts?.default);
assert.equal(themeName('ship', t), 'Ship');
assert.equal(themeName('unicorn', t), 'unicorn'); // missing translation → raw value

// --- aggregatePlaygroundThemes ---

// area theme + allowlisted device theme, area first; non-allowlisted dropped
{
  const area = { 'playground:theme': 'castle' };
  const out = aggregatePlaygroundThemes(area, [dev('ship'), dev('horse')]);
  assert.deepEqual(out, ['castle', 'ship']); // horse dropped (not allowlisted)
}

// dedupe identical device themes to one entry
{
  const out = aggregatePlaygroundThemes({}, [dev('ship'), dev('ship'), dev('ship')]);
  assert.deepEqual(out, ['ship']);
}

// device themes ordered by frequency desc, then first appearance
{
  const out = aggregatePlaygroundThemes({}, [dev('rocket'), dev('ship'), dev('ship')]);
  assert.deepEqual(out, ['ship', 'rocket']);
}

// area theme not duplicated when a device repeats it
{
  const out = aggregatePlaygroundThemes({ 'playground:theme': 'ship' }, [dev('ship'), dev('castle')]);
  assert.deepEqual(out, ['ship', 'castle']);
}

// non-allowlisted values (noise + device shapes) excluded everywhere
{
  const out = aggregatePlaygroundThemes({ 'playground:theme': 'play' }, [dev('horse'), dev('duck'), dev('castle')]);
  assert.deepEqual(out, ['castle']);
}

// no themes → empty
assert.deepEqual(aggregatePlaygroundThemes({}, [{}, {}]), []);

console.log('playgroundThemes.test.js passed');
