import assert from 'node:assert/strict';
import { aggregatePlaygroundThemes, themeOf, themeIcon, themeName, FALLBACK_ICON } from './playgroundThemes.js';

const dev = theme => ({ 'playground:theme': theme });

// --- themeOf: clean per-device value ---

// known value passes through, lowercased
assert.equal(themeOf(dev('Ship')), 'ship');
// multi-value keeps the first
assert.equal(themeOf(dev('ship;castle')), 'ship');
// noise → null
assert.equal(themeOf(dev('playground')), null);
assert.equal(themeOf(dev('yes')), null);
// absent → null
assert.equal(themeOf({}), null);
assert.equal(themeOf(undefined), null);

// --- themeIcon: curated + fallback ---

assert.equal(themeIcon('castle'), '🏰');
assert.equal(themeIcon('unicorn'), FALLBACK_ICON); // unknown long-tail

// --- themeName: i18n with raw fallback ---

const t = (key, opts) => (key === 'equipAttr.themes.ship' ? 'Ship' : opts?.default);
assert.equal(themeName('ship', t), 'Ship');
assert.equal(themeName('unicorn', t), 'unicorn'); // missing translation → raw value

// --- aggregatePlaygroundThemes ---

// area theme + device themes, area first
{
  const area = { 'playground:theme': 'castle' };
  const out = aggregatePlaygroundThemes(area, [dev('ship'), dev('horse')]);
  assert.deepEqual(out, ['castle', 'ship', 'horse']);
}

// dedupe identical device themes to one entry
{
  const out = aggregatePlaygroundThemes({}, [dev('horse'), dev('horse'), dev('horse')]);
  assert.deepEqual(out, ['horse']);
}

// device themes ordered by frequency desc, then first appearance
{
  const out = aggregatePlaygroundThemes({}, [dev('ship'), dev('horse'), dev('horse')]);
  assert.deepEqual(out, ['horse', 'ship']);
}

// area theme not duplicated when a device repeats it
{
  const out = aggregatePlaygroundThemes({ 'playground:theme': 'ship' }, [dev('ship'), dev('castle')]);
  assert.deepEqual(out, ['ship', 'castle']);
}

// noise values excluded everywhere
{
  const out = aggregatePlaygroundThemes({ 'playground:theme': 'play' }, [dev('playground'), dev('castle')]);
  assert.deepEqual(out, ['castle']);
}

// no themes → empty
assert.deepEqual(aggregatePlaygroundThemes({}, [{}, {}]), []);

console.log('playgroundThemes.test.js passed');
