// Display rules for a standalone pitch's tags (#934), shared by the pitch
// panel and — for lighting — the playground panel.
//
// Every function returns `null` when the tag is absent or carries nothing a
// visitor can use. That is the rule, not an omission: most pitches are
// sparsely tagged, and a row of "unknown"s would read as "bad pitch".
//
// Results are i18n descriptors `{ key, values? }` (or plain data), so this
// module stays free of svelte-i18n and is unit-testable in node.

/** Sports a pitch is tagged with: `sport` split on `;`, trimmed, empties dropped. */
export function pitchSports(props) {
  return String(props?.sport ?? '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

// Sports with their own "… pitch / court" title; others fall back to "Sports pitch".
export const TITLED_SPORTS = new Set([
  'soccer', 'basketball', 'tennis', 'table_tennis', 'volleyball', 'beachvolleyball',
  'skateboard', 'equestrian', 'athletics', 'boules', 'chess', 'baseball', 'multi',
]);

/**
 * Title: the OSM name when there is one (`{ name }` — region language), else
 * a label for the first sport (`{ key }` — interface language).
 */
export function pitchTitle(props) {
  if (props?.name) return { name: props.name };
  const first = pitchSports(props)[0];
  return { key: `pitch.titles.${TITLED_SPORTS.has(first) ? first : 'generic'}` };
}

/**
 * Lighting from `lit`: yes / no, or the times it is lit (`sunset-23:00`,
 * `Mo-Fr 17:00-22:00`) with hyphens shown as en dashes.
 */
export function litInfo(lit) {
  const v = String(lit ?? '').trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  if (lower === 'yes' || lower === '24/7' || lower === 'automatic') return { key: 'pitch.lit.yes' };
  if (lower === 'no' || lower === 'disused') return { key: 'pitch.lit.no' };
  if (lower === 'limited' || lower === 'interval') return { key: 'pitch.lit.limited' };
  if (/\d/.test(v) || lower.includes('sunset') || lower.includes('sunrise')) {
    return { key: 'pitch.lit.times', values: { times: v.replace(/-/g, '–') } };
  }
  return null;
}

const ACCESS = {
  yes: 'public', public: 'public', permissive: 'public',
  customers: 'customers',
  members: 'members', private: 'private', no: 'private',
};

/** Who may use it, from `access` — only values that answer "can I just go?". */
export function accessInfo(props) {
  const v = String(props?.access ?? '').trim().toLowerCase();
  return v in ACCESS ? { key: `pitch.access.${ACCESS[v]}` } : null;
}

/** Fee from `fee`: shown both ways, since "free" is worth knowing. */
export function feeInfo(props) {
  const v = String(props?.fee ?? '').trim().toLowerCase();
  if (v === 'yes') return { key: 'pitch.fee.yes' };
  if (v === 'no') return { key: 'pitch.fee.no' };
  return null;
}

/** Booking from `reservation`: only when it matters (required / recommended). */
export function reservationInfo(props) {
  const v = String(props?.reservation ?? '').trim().toLowerCase();
  if (v === 'required' || v === 'yes' || v === 'only') return { key: 'pitch.reservation.required' };
  if (v === 'recommended') return { key: 'pitch.reservation.recommended' };
  return null;
}

/** Basketball hoops from `hoops`, a positive integer. */
export function hoopsInfo(props) {
  const n = parseInt(props?.hoops, 10);
  return Number.isFinite(n) && n > 0 ? { key: 'pitch.hoops', values: { count: n } } : null;
}

/** Wheelchair access from `wheelchair`: yes / limited / no. */
export function wheelchairInfo(props) {
  const v = String(props?.wheelchair ?? '').trim().toLowerCase();
  return ['yes', 'limited', 'no'].includes(v) ? { key: `pitch.wheelchair.${v}` } : null;
}
