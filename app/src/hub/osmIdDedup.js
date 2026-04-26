// Cross-backend osm_id deduplication for the polygon tier.
//
// When two backends serve the same playground (same osm_id, e.g. a region
// boundary runs through a park), the polygon source would otherwise contain
// two overlapping features. This module keeps exactly one: the feature whose
// backend ran the most recent import.
//
// Tie-breaking rules (in order):
//   1. One timestamp is parseable, the other is null or unparseable → parseable wins.
//   2. Both parseable and strictly different → newer wins.
//   3. Both parseable and equal (including same instant in different TZ formats),
//      or both null/unparseable → URL-alphabetical (raw JS < on _backendUrl,
//      no case-folding, no normalisation) so the result is deterministic.
//
// Features without an `osm_id` property (shouldn't happen in practice) are
// always added — no dedup attempted.

/**
 * Given two OL Features for the same osm_id, return the one that should
 * survive. Pure function — no side effects.
 *
 * @param {import('ol/Feature.js').default} a
 * @param {import('ol/Feature.js').default} b
 * @returns {import('ol/Feature.js').default}
 */
export function dedupWinner(a, b) {
  const ta = a.get('_lastImportAt'); // ISO string | null
  const tb = b.get('_lastImportAt');

  const pa = ta != null && Number.isFinite(Date.parse(ta));
  const pb = tb != null && Number.isFinite(Date.parse(tb));

  if (!pa && !pb) return (a.get('_backendUrl') ?? '') <= (b.get('_backendUrl') ?? '') ? a : b;
  if (!pa) return b;
  if (!pb) return a;

  const da = Date.parse(ta);
  const db = Date.parse(tb);
  if (db > da) return b;
  if (da > db) return a;
  // tie (equal or same instant in different TZ formats) → URL alphabetical
  return (a.get('_backendUrl') ?? '') <= (b.get('_backendUrl') ?? '') ? a : b;
}

/**
 * Merge an incoming batch of features into `dedupMap`, updating the map in
 * place and returning which OL Features to add to / remove from the source.
 *
 * @param {import('ol/Feature.js').default[]} incoming
 * @param {Map<string, import('ol/Feature.js').default>} dedupMap
 *   Caller-owned map of osm_id (string) → current winning OL Feature.
 *   Modified in place.
 * @returns {{ toAdd: import('ol/Feature.js').default[], toRemove: import('ol/Feature.js').default[] }}
 */
export function applyDedup(incoming, dedupMap) {
  const toAdd    = [];
  const toRemove = [];

  for (const f of incoming) {
    const osmId = f.get('osm_id');
    if (osmId == null) {
      toAdd.push(f);
      continue;
    }
    const key      = String(osmId);
    const existing = dedupMap.get(key);
    if (!existing) {
      dedupMap.set(key, f);
      toAdd.push(f);
    } else {
      const winner = dedupWinner(existing, f);
      if (winner === f) {
        // Incoming beats the current winner — swap
        dedupMap.set(key, f);
        toRemove.push(existing);
        toAdd.push(f);
      }
      // else: existing still wins, incoming is silently dropped
    }
  }

  return { toAdd, toRemove };
}
