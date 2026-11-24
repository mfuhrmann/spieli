import assert from 'node:assert/strict';
import { ACTIVITIES, ACTIVITY_ICONS, deviceIcon, deviceKeysOf, activitiesOf, highlightsOf } from './activities.js';
import { objDevices } from './objPlaygroundEquipment.js';

const f = playground => ({ properties: { playground } });

// --- Catalogue: every device declares both fields explicitly ---

for (const [key, def] of Object.entries(objDevices)) {
  assert.ok('activity' in def, `${key}: missing activity`);
  assert.ok('highlight' in def, `${key}: missing highlight`);
  assert.equal(typeof def.highlight, 'boolean', `${key}: highlight must be boolean`);
  assert.ok(def.activity === null || ACTIVITIES.includes(def.activity),
    `${key}: unknown activity ${def.activity}`);
}

// --- deviceKeysOf ---

// standalone devices, `yes` ignored
assert.deepEqual([...deviceKeysOf([f('swing'), f('yes'), {}])], ['swing']);
// structure and its children both count
assert.deepEqual(
  [...deviceKeysOf([], [{ structure: f('structure'), children: [f('slide'), f('ladder')] }])].sort(),
  ['ladder', 'slide', 'structure'],
);
// area schema: yes and positive counts, not zero, not unknown keys, not theme
assert.deepEqual(
  [...deviceKeysOf([], [], {
    'playground:slide': 'yes',
    'playground:swing': '2',
    'playground:seesaw': '0',
    'playground:theme': 'ship',
    'playground:nonsense': 'yes',
  })].sort(),
  ['slide', 'swing'],
);
// no input → empty
assert.equal(deviceKeysOf().size, 0);

// --- activitiesOf ---

// several devices, one activity; fixed order regardless of input order
assert.deepEqual(
  activitiesOf(new Set(['sandpit', 'basketswing', 'swing', 'slide'])),
  ['swing', 'slide', 'dig'],
);
// structure parts and water devices produce nothing
assert.deepEqual(activitiesOf(new Set(['structure', 'platform', 'ladder', 'pump'])), []);
// unknown device keys are ignored
assert.deepEqual(activitiesOf(new Set(['carousel'])), []);

// --- highlightsOf ---

// nothing special → empty
assert.deepEqual(highlightsOf(new Set(['swing', 'slide'])), []);
// themes first, water once, then devices in catalogue order
const hl = highlightsOf(new Set(['marble_run', 'pump', 'water_channel', 'zipwire']), { themes: ['ship'] });
assert.deepEqual(hl.map(h => h.kind), ['theme', 'water', 'device', 'device']);
assert.equal(hl[0].value, 'ship');
const devOrder = Object.keys(objDevices);
assert.ok(devOrder.indexOf(hl[2].key) < devOrder.indexOf(hl[3].key));
assert.deepEqual(hl.slice(2).map(h => h.key).sort(), ['marble_run', 'zipwire']);
// a water theme already covers water play — no second entry
assert.deepEqual(
  highlightsOf(new Set(['pump']), { themes: ['water'], isWater: true }),
  [{ kind: 'theme', value: 'water' }],
);
// the server's is_water flag alone is enough for water play
assert.deepEqual(highlightsOf(new Set(), { isWater: true }), [{ kind: 'water' }]);
// highlight devices also counted via the area schema
assert.deepEqual(
  highlightsOf(deviceKeysOf([], [], { 'playground:trampoline': 'yes' })),
  [{ kind: 'device', key: 'trampoline' }],
);

// --- icons ---

for (const a of ACTIVITIES) assert.ok(ACTIVITY_ICONS[a], `${a}: no icon`);
assert.equal(deviceIcon('basketswing'), ACTIVITY_ICONS.swing);
assert.equal(deviceIcon('zipwire'), null);   // no activity → text only
assert.equal(deviceIcon('nonsense'), null);

console.log('activities.test.js: all assertions passed');
