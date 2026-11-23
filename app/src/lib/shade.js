// Shade state for the detail panel's pill (#1077, display half of #1072).
//
// The server's `has_shade` is a boolean that turns `shade=partial` into
// `false`, so the panel showed "No shade" for partly shaded playgrounds. The
// raw `shade` tag travels in the polygon tier's properties, so the panel reads
// it first and keeps `has_shade` only as a fallback (older backends, data
// without the raw tag).

const KNOWN = new Set(['yes', 'partial', 'no']);

/**
 * @param {Object|null} attr  playground properties
 * @returns {'yes'|'partial'|'no'|null}  null = not recorded
 */
export function shadeState(attr) {
  const raw = typeof attr?.shade === 'string' ? attr.shade.trim().toLowerCase() : null;
  if (raw && KNOWN.has(raw)) return raw;
  if (attr?.has_shade === true) return 'yes';
  if (attr?.has_shade === false) return 'no';
  return null;
}
