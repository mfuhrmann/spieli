import assert from 'node:assert/strict';
import { deviceLabel, humanizeTagValue, tagValuesLabel } from './deviceLabel.js';

// A stand-in for svelte-i18n's $_: knows two keys, otherwise returns the default.
const known = { 'equipment.devices.swing': 'Swing', 'equipment.devices.slide': 'Slide' };
const t = (id, { default: d } = {}) => known[id] ?? d;

// --- humanizeTagValue ---
assert.equal(humanizeTagValue('carousel'), 'Carousel');
assert.equal(humanizeTagValue('water_pump'), 'Water pump');
assert.equal(humanizeTagValue('Already'), 'Already');
assert.equal(humanizeTagValue('über'), 'Über');
assert.equal(humanizeTagValue(''), '');
assert.equal(humanizeTagValue(undefined), '');
// locale-independent: never the Turkish dotted capital I
assert.equal(humanizeTagValue('isle_swing'), 'Isle swing');
// an astral first character is kept whole
assert.equal(humanizeTagValue('𝒳_thing'), '𝒳 thing');

// --- tagValuesLabel ---
const ts = (id, { default: d } = {}) => (id === 'details.surfaceValues.grass' ? 'Grass' : d);
assert.equal(tagValuesLabel('grass', 'details.surfaceValues.', ts), 'Grass');
assert.equal(tagValuesLabel('grass; wood_chips', 'details.surfaceValues.', ts), 'Grass / Wood chips');
assert.equal(tagValuesLabel('table_soccer', 'pitch.sports.', ts), 'Table soccer');
assert.equal(tagValuesLabel('', 'pitch.sports.', ts), '');

// --- deviceLabel ---
// locale string wins
assert.equal(deviceLabel('swing', t), 'Swing');
// unknown to locale and objDevices → humanised, never the lower-case raw value
assert.equal(deviceLabel('carousel', t), 'Carousel');
assert.equal(deviceLabel('some_new_thing', t), 'Some new thing');
// multi-value: each part labelled on its own
assert.equal(deviceLabel('swing;slide', t), 'Swing / Slide');
assert.equal(deviceLabel('swing ; water_pump', t), 'Swing / Water pump');
assert.equal(deviceLabel('swing;', t), 'Swing');
// known to objDevices but missing from the locale → name_de fallback. Every
// registered locale has this key today; this guards a locale that does not
// yet (CLAUDE.md: name_de is the fallback for untranslated locales).
assert.equal(deviceLabel('roundabout', t), 'Karussell');

console.log('deviceLabel tests passed');
