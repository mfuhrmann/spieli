// Playground theme symbols and aggregation.
//
// `playground:theme=*` (OSM) describes a playground's — or a single device's —
// thematic flavour (ship, castle, horse, …). Per taginfo the key splits ~50/50
// between the whole playground (`leisure=playground`) and an individual
// equipment node (`playground=*`, e.g. a horse-shaped spring rocker), so a
// single playground often carries several themes at once.
//
// This module maps theme values to curated symbols and aggregates the themes of
// a playground (its area tag + every themed device) into a deduped, ordered set
// for the details panel. The display name is localised via `equipAttr.themes.*`
// (svelte-i18n); this module only owns the symbols + aggregation.

// Curated symbols for the common theme values. Anything not listed falls back
// to FALLBACK_ICON — the open OSM vocabulary means we never assume a wrong icon.
const THEME_ICONS = {
  // top taginfo values
  ship: '🚢', castle: '🏰', spiderweb: '🕸️', water: '💧', adventure: '🧭',
  horse: '🐴', swing: '🛝', house: '🏠', train: '🚆', car: '🚗',
  elephant: '🐘', motorcycle: '🏍️', dog: '🐕', rocket: '🚀', octopus: '🐙',
  // remaining curated set
  animal: '🐾', bicycle: '🚲', boat: '⛵', camel: '🐪', carrot: '🥕',
  construction: '🚧', dragon: '🐉', duck: '🦆', farm: '🚜', fish: '🐟',
  flower: '🌸', helicopter: '🚁', ice_cream: '🍦', jungle: '🌴', lama: '🦙',
  locomotive: '🚂', luggage: '🧳', mammoth: '🦣', mushroom: '🍄', nature: '🌳',
  ocean: '🌊', palace: '🏛️', pirate: '🏴‍☠️', plane: '✈️', rainbow: '🌈',
  rock: '🪨', seal: '🦭', sheep: '🐑', snake: '🐍', space: '🪐',
  sport: '⚽', tent: '⛺', tower: '🗼', wagon: '🚃', western: '🤠',
  whale: '🐋', dinosaur: '🦕',
  // long-tail values that actually appear in OSM (taginfo, count ≥ 15)
  panda: '🐼', bee: '🐝', frog: '🐸', insect: '🐛', dolphin: '🐬',
  tractor: '🚜', bird: '🐦', turtle: '🐢', cow: '🐄', ladybug: '🐞',
  forest: '🌲', barrel: '🛢️', snail: '🐌', bridge: '🌉', climbing: '🧗',
  rabbit: '🐰', truck: '🚚', lion: '🦁', giraffe: '🦒', crocodile: '🐊',
  koala: '🐨', bear: '🐻', treehouse: '🌳', caterpillar: '🐛', pig: '🐷',
  music: '🎵', squirrel: '🐿️', tree: '🌳', chicken: '🐔', beetle: '🪲',
  slide: '🛝', bible: '📖',
  // spelling/synonym aliases of the above
  airplane: '✈️', motorbike: '🏍️', animals: '🐾', pirate_ship: '🏴‍☠️',
};

// Generic "themed" glyph for unknown long-tail values.
export const FALLBACK_ICON = '✨';

// Values that are tagging noise, not real themes.
const NOISE = new Set(['playground', 'play', 'playlot', 'yes', 'no', 'none']);

/** Symbol for a theme value (curated icon, or generic fallback). */
export function themeIcon(value) {
  return THEME_ICONS[value] ?? FALLBACK_ICON;
}

/**
 * Localised display name for a theme value. Falls back to the raw value when no
 * translation exists (matches the `tl()` pattern elsewhere).
 * @param {string} value
 * @param {Function} t - svelte-i18n translate function
 */
export function themeName(value, t) {
  return t(`equipAttr.themes.${value}`, { default: value });
}

/**
 * The first clean theme value on a single feature's properties, or null when it
 * carries no usable theme. Used to put an inline symbol on a themed device.
 */
export function themeOf(props) {
  return splitThemes(props?.['playground:theme'])[0] ?? null;
}

/**
 * The clean theme values on the playground's own area tag (`leisure=playground`
 * + `playground:theme`). Usually one — "this is an octopus playground". Used for
 * the prominent banner, kept separate from device-derived themes.
 */
export function areaThemesOf(props) {
  return splitThemes(props?.['playground:theme']);
}

/** Split a `playground:theme` tag value (may be `;`-separated) into clean tokens. */
function splitThemes(raw) {
  if (!raw) return [];
  return String(raw)
    .split(';')
    .map(v => v.trim().toLowerCase())
    .filter(v => v && !NOISE.has(v));
}

/**
 * Aggregate the themes of a playground into an ordered, deduped list.
 *
 * Order: area-level themes first (the playground is *itself* themed), then
 * device-derived themes by descending frequency, then first appearance.
 *
 * @param {Object} areaProps - playground polygon properties
 * @param {Object[]} deviceProps - property objects of every device within the playground
 * @returns {string[]} deduped, ordered theme values
 */
export function aggregatePlaygroundThemes(areaProps, deviceProps = []) {
  const area = splitThemes(areaProps?.['playground:theme']);
  const areaSet = new Set(area);

  // Count device themes (excluding ones already claimed by the area tag),
  // remembering first-appearance order as the stable tiebreaker.
  const freq = new Map();
  const firstSeen = new Map();
  for (const props of deviceProps) {
    for (const v of splitThemes(props?.['playground:theme'])) {
      if (areaSet.has(v)) continue;
      if (!freq.has(v)) { freq.set(v, 0); firstSeen.set(v, firstSeen.size); }
      freq.set(v, freq.get(v) + 1);
    }
  }
  const device = [...freq.keys()].sort(
    (a, b) => freq.get(b) - freq.get(a) || firstSeen.get(a) - firstSeen.get(b)
  );

  return [...area, ...device];
}
