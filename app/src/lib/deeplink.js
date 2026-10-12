// URL hash parser / writer supporting two forms:
//
//   #W<osm_id>             — legacy; no backend slug
//   #<slug>/W<osm_id>      — new; <slug> identifies a backend in registry.json
//
// Standalone ignores any slug (there is only one backend). Hub uses the slug
// to scope selection to a specific backend, falling back to broadcast search
// when the slug is absent.
//
// Slug format: [a-z0-9-]+ (lowercase ASCII, digits, hyphens).

const SLUG_RE = /^[a-z0-9-]+$/;
// The letter says what the id is: W a playground (any OSM type — the letter
// predates pitches and is kept so existing links keep working), P a
// standalone pitch (#934).
const WITH_SLUG_RE = /^#([a-z0-9-]+)\/([WP])(\d+)$/;
const LEGACY_RE = /^#([WP])(\d+)$/;
const KIND_BY_LETTER = { W: 'playground', P: 'pitch' };
const LETTER_BY_KIND = { playground: 'W', pitch: 'P' };

/**
 * Parse a URL hash into `{ slug, osmId, kind }`, or return `null` if the hash
 * does not match either supported form. `kind` is 'playground' or 'pitch'.
 *
 * @param {string} hash
 * @returns {{ slug: string | null, osmId: number, kind: 'playground' | 'pitch' } | null}
 */
export function parseHash(hash) {
  if (!hash) return null;
  const h = hash.startsWith('#') ? hash : `#${hash}`;

  const withSlug = h.match(WITH_SLUG_RE);
  if (withSlug) {
    return { slug: withSlug[1], osmId: parseInt(withSlug[3], 10), kind: KIND_BY_LETTER[withSlug[2]] };
  }

  const legacy = h.match(LEGACY_RE);
  if (legacy) {
    return { slug: null, osmId: parseInt(legacy[2], 10), kind: KIND_BY_LETTER[legacy[1]] };
  }

  return null;
}

/**
 * Build a URL hash for a selection. Emits the legacy form when the slug is
 * missing or invalid; otherwise the prefixed form.
 *
 * @param {{ slug?: string | null, osmId: number, kind?: 'playground' | 'pitch' }} selection
 * @returns {string} the full hash including the leading `#`
 */
export function writeHash({ slug, osmId, kind = 'playground' }) {
  const letter = LETTER_BY_KIND[kind] ?? 'W';
  if (slug && SLUG_RE.test(slug)) {
    return `#${slug}/${letter}${osmId}`;
  }
  return `#${letter}${osmId}`;
}

/** Returns true if `value` is a valid registry slug. */
export function isValidSlug(value) {
  return typeof value === 'string' && SLUG_RE.test(value);
}
