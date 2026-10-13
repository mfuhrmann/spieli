// Parsing of one registry.json entry's fields (#740, #741). Each parser takes
// the raw value plus the entry's URL for its warning, and returns a clean value
// or null: a malformed optional field never takes the rest of the entry down.
// parseNominalCentroid lives in centroid.js beside the centroid maths.

import { isValidSlug } from '../lib/deeplink.js';

// Only ASCII whitespace is trimmed, with exactly the same character class as
// the jq in oci/app/poll-federation.sh. federation-status.json is matched to
// backends by exact URL string, so the two sides must normalise identically:
// String.prototype.trim() also strips U+FEFF and other code points jq's \s does
// not, and one differing character silently drops a backend's health data.
const EDGE_WS = /^[ \t\r\n]+|[ \t\r\n]+$/g;

/** Trims ASCII whitespace and drops trailing slashes — never intentional. */
export function normaliseBackendUrl(raw) {
  return String(raw ?? '').replace(EDGE_WS, '').replace(/\/+$/, '');
}

/** Valid slugs pass; invalid ones warn and are treated as missing. Not
 *  lower-cased: the slug is part of shared links, so the hub must not serve
 *  a different spelling than the registry says. */
export function normaliseSlug(raw, url) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (isValidSlug(raw)) return raw;
  console.warn(`[registry] invalid slug "${raw}" on backend ${url} — treating as missing`);
  return null;
}

/** ISO 3166-1 alpha-2 (`"SK"`, case-insensitive) → upper case, else null +
 *  warn. A country code, unlike a slug, appears in no shared link. */
export function parseCountry(raw, url) {
  if (raw === undefined || raw === null || raw === '') return null;
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(code)) {
    console.warn(`[registry] invalid country ${JSON.stringify(raw)} on backend ${url} — expected an ISO 3166-1 alpha-2 code such as "SK"`);
    return null;
  }
  return code;
}

/**
 * Normalise the entries' URLs and drop the ones that cannot work: no URL at
 * all (nothing to ask), or the same URL as an earlier entry once normalised —
 * every per-backend lookup is by URL, so a second entry would never be
 * patched and would show "loading" forever. Both warn, naming the entry.
 * @returns {Array<{ url: string, entry: object }>}
 */
export function usableEntries(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const url = normaliseBackendUrl(entry?.url);
    if (!url) {
      console.warn(`[registry] entry ${JSON.stringify(entry?.name ?? entry?.slug ?? entry)} has no url — skipped`);
      continue;
    }
    if (seen.has(url)) {
      console.warn(`[registry] duplicate url ${url} — skipping the later entry ${JSON.stringify(entry?.name ?? entry?.slug ?? '')}`);
      continue;
    }
    seen.add(url);
    out.push({ url, entry });
  }
  return out;
}
