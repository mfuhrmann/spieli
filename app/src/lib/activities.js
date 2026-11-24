// Activities and highlights for the detail panel (#1077).
//
// The panel's activity row answers "what can my child do here?" instead of
// counting devices: several swing types are one "swing", structure parts are
// nothing. The highlights line names what makes a playground worth a detour:
// its theme, water play, and devices marked `highlight` in the catalogue.
//
// Both read separately mapped devices AND the area-level schema
// (`playground:<device>=yes|<n>` on the playground itself), the same
// fallback EquipmentList uses for its device list. In Fulda 10 playgrounds
// carry their equipment only that way.

import { objDevices } from './objPlaygroundEquipment.js';

/** Icon per activity, shared by the activity row and the hint form's chips. */
export const ACTIVITY_ICONS = {
  swing: '🪢', slide: '🛝', rock: '🐴', climb: '🧗', balance: '🪵',
  spin: '🌀', bounce: '🦘', exercise: '🤸', dig: '🪣', explore: '🏠',
};

/** Icon for a device (`playground=*` value) via its activity, or null. */
export function deviceIcon(key) {
  return ACTIVITY_ICONS[objDevices[key]?.activity] ?? null;
}

/** Display order of the activity row. */
export const ACTIVITIES = [
  'swing', 'slide', 'rock', 'climb', 'balance',
  'spin', 'bounce', 'exercise', 'dig', 'explore',
];

/**
 * Device keys (`playground=*` values) present at a playground.
 * @param {Array} features  standalone equipment GeoJSON features
 * @param {Array<{structure: Object, children: Object[]}>} groups  grouped structures
 * @param {Object|null} attr  the playground's own properties (area tags)
 * @returns {Set<string>}
 */
export function deviceKeysOf(features = [], groups = [], attr = null) {
  const keys = new Set();
  const add = props => {
    const k = props?.playground;
    if (k && k !== 'yes') keys.add(k);
  };
  for (const f of features) add(f.properties);
  for (const g of groups) {
    add(g.structure?.properties);
    for (const c of g.children ?? []) add(c.properties);
  }
  for (const [tag, val] of Object.entries(attr ?? {})) {
    if (!tag.startsWith('playground:')) continue;
    const key = tag.slice('playground:'.length);
    // Only catalogue devices: `playground:theme` and other sub-keys are not
    // equipment.
    if (!objDevices[key]) continue;
    const n = parseInt(val, 10);
    if (val === 'yes' || n > 0) keys.add(key);
  }
  return keys;
}

/**
 * Activities present, deduplicated, in ACTIVITIES order.
 * @param {Set<string>} keys  from deviceKeysOf
 * @returns {string[]}
 */
export function activitiesOf(keys) {
  const present = new Set();
  for (const k of keys) {
    const a = objDevices[k]?.activity;
    if (a) present.add(a);
  }
  return ACTIVITIES.filter(a => present.has(a));
}

/**
 * Highlights: themes first, then one water-play entry, then highlight devices
 * in catalogue order.
 * @param {Set<string>} keys  from deviceKeysOf
 * @param {Object} opts
 * @param {string[]} [opts.themes]  playground themes, area theme first
 * @param {boolean} [opts.isWater]  the server's is_water flag (covers what the
 *   loaded equipment may not, e.g. an older backend)
 * @returns {Array<{kind: 'theme', value: string} | {kind: 'water'} | {kind: 'device', key: string}>}
 */
export function highlightsOf(keys, { themes = [], isWater = false } = {}) {
  const out = themes.map(value => ({ kind: 'theme', value }));
  // A `water` theme already says it; "water play" next to it would repeat it.
  const water = !themes.includes('water')
    && (isWater || [...keys].some(k => objDevices[k]?.category === 'water'));
  if (water) out.push({ kind: 'water' });
  for (const [key, def] of Object.entries(objDevices)) {
    if (def.highlight && keys.has(key)) out.push({ kind: 'device', key });
  }
  return out;
}
