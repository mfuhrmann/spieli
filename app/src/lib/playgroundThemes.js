// Playground theme symbols and aggregation.
//
// `playground:theme=*` (OSM) describes a playground's thematic motto — an
// octopus playground, a ship playground, … — per the wiki
// (wiki.openstreetmap.org/wiki/DE:Key:playground:theme). The tag also appears on
// individual equipment nodes; the majority of that device usage is spring-rider
// shapes (`playground:theme=horse`/`duck` on `playground=springy`), which are
// device motifs, not playground themes. We therefore honour only an explicit
// allowlist of documented theme values (SUPPORTED_THEMES); anything else — a
// duck spring rider, tagging noise, a long-tail one-off — is dropped everywhere
// (banner, chips, inline device symbol) so the highlight stays meaningful.
//
// This module owns the symbols + aggregation; display names are localised via
// `equipAttr.themes.*` (svelte-i18n). Extend the allowlist by adding an entry to
// THEME_ICONS — the icon and the supported set are one and the same.

import { tl } from './utils.js';

// Curated symbols for the wiki-documented theme values. The key set *is* the
// allowlist: a value with no entry here is not treated as a theme.
const THEME_ICONS = {
  ship: '🚢', octopus: '🐙', castle: '🏰', rocket: '🚀',
  spiderweb: '🕸️', circus: '🎪', dragon: '🐉',
  water: '💧', adventure: '🧭',
};

// The allowlist of recognised theme values, derived from the curated icon set.
export const SUPPORTED_THEMES = new Set(Object.keys(THEME_ICONS));

// Fallback glyph. With an allowlist every supported value has a curated icon, so
// this is only a defensive backstop (e.g. a newly allowlisted value missing an
// icon) and never renders for non-allowlisted values, which are dropped upstream.
export const FALLBACK_ICON = '✨';

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
  return tl(t, `equipAttr.themes.${value}`, value);
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

/**
 * Split a `playground:theme` tag value (may be `;`-separated) into clean tokens,
 * keeping only allowlisted theme values (SUPPORTED_THEMES). This is the single
 * choke point that keeps device-shape noise (horse/duck spring riders) and
 * long-tail one-offs out of every consumer.
 */
function splitThemes(raw) {
  if (!raw) return [];
  return String(raw)
    .split(';')
    .map(v => v.trim().toLowerCase())
    .filter(v => SUPPORTED_THEMES.has(v));
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
