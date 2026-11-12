import assert from 'node:assert/strict';
import { deviceLabel, humanizeTagValue } from './deviceLabel.js';

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
// known to objDevices but missing from the locale → name_de fallback
assert.equal(deviceLabel('roundabout', t), 'Karussell');

console.log('deviceLabel tests passed');
