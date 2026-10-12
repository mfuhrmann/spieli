// Sport glyphs for standalone pitch pins (#924).
//
// Each glyph is SVG markup in a 24-unit viewBox, stroked, in the Lucide
// style the rest of the UI uses. Where Lucide has a fitting icon its path
// data is copied below (Lucide, ISC licence, © Lucide Icons and Contributors);
// it has no football, basketball, tennis, table-tennis or skateboard icon, so
// those are drawn here in the same 24-unit, stroke-2 idiom.
//
// Keyed by the OSM `sport` value. A multi-valued tag ("soccer;basketball")
// takes its first value; anything without a glyph gets the generic one.

const FILLED = 'fill="currentColor" stroke="none"';

const football =
  '<circle cx="12" cy="12" r="10"/>' +
  `<path ${FILLED} d="M12 7.6l4.2 3.05-1.6 4.95H9.4l-1.6-4.95z"/>` +
  '<path d="M12 7.6V2M16.2 10.65l5.3-1.7M14.6 15.6l3.3 4.5M9.4 15.6l-3.3 4.5M7.8 10.65l-5.3-1.7"/>';

const basketball =
  '<circle cx="12" cy="12" r="10"/>' +
  '<path d="M12 2v20M2 12h20M5.2 4.7a10 10 0 0 1 0 14.6M18.8 4.7a10 10 0 0 0 0 14.6"/>';

// Racket with crossed strings — without them the head and handle read as a
// magnifying glass.
const tennis =
  '<ellipse cx="9.5" cy="9.5" rx="5.5" ry="7" transform="rotate(-45 9.5 9.5)"/>' +
  '<path d="M6.5 9.5h6M9.5 6.5v6M7.4 7.4l4.2 4.2" stroke-width="1.2"/>' +
  '<path d="M14 14l7 7"/>' +
  `<circle ${FILLED} cx="19" cy="5" r="2"/>`;

// Solid paddle head: an outlined one reads as a magnifying glass.
const tableTennis =
  `<circle ${FILLED} cx="9.5" cy="9.5" r="6.5"/>` +
  '<path d="M14.2 14.2l5.3 5.3" stroke-width="3.5"/>' +
  `<circle ${FILLED} cx="19.5" cy="4.5" r="2"/>`;

const skateboard =
  '<path d="M2 9c1 2.5 2.5 3 4.5 3h11c2 0 3.5-.5 4.5-3"/>' +
  '<circle cx="7" cy="16.5" r="2"/><circle cx="17" cy="16.5" r="2"/>';

// ── Lucide ───────────────────────────────────────────────────────────────────
const volleyball =
  '<path d="M11.1 7.1a16.55 16.55 0 0 1 10.9 4"/><path d="M12 12a12.6 12.6 0 0 1-8.7 5"/>' +
  '<path d="M16.8 13.6a16.55 16.55 0 0 1-9 7.5"/><path d="M20.7 17a12.8 12.8 0 0 0-8.7-5 13.3 13.3 0 0 1 0-10"/>' +
  '<path d="M6.3 3.8a16.55 16.55 0 0 0 1.9 11.5"/><circle cx="12" cy="12" r="10"/>';
// chess-knight — a horse's head, which is what equestrian needs too.
const knight =
  '<path d="M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/>' +
  '<path d="M16.5 18c1-2 2.5-5 2.5-9a7 7 0 0 0-7-7H6.635a1 1 0 0 0-.768 1.64L7 5l-2.32 5.802a2 2 0 0 0 .95 2.526l2.87 1.456"/>' +
  '<path d="m15 5 1.425-1.425"/><path d="m17 8 1.53-1.53"/><path d="M9.713 12.185 7 18"/>';
const rook =
  '<path d="M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/>' +
  '<path d="M10 2v2"/><path d="M14 2v2"/><path d="m17 18-1-9"/>' +
  '<path d="M6 2v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2"/><path d="M6 4h12"/><path d="m7 18 1-9"/>';
const bike =
  '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/>' +
  '<circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>';
const target =
  '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>';
const footprints =
  '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/>' +
  '<path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/>' +
  '<path d="M16 17h4"/><path d="M4 13h4"/>';
// goal — a flag in a target: the generic "sport here" glyph.
const generic =
  '<path d="M12 13V2l8 4-8 4"/><path d="M20.561 10.222a9 9 0 1 1-12.55-5.29"/>' +
  '<path d="M8.002 9.997a5 5 0 1 0 8.9 2.02"/>';

const BY_SPORT = {
  soccer: football,
  basketball,
  tennis,
  table_tennis: tableTennis,
  skateboard,
  roller_skating: skateboard,
  inlinehockey: skateboard,
  volleyball,
  beachvolleyball: volleyball,
  equestrian: knight,
  chess: rook,
  cycling: bike,
  bmx: bike,
  archery: target,
  shooting: target,
  athletics: footprints,
  running: footprints,
};

/** Normalised glyph key for a pitch's `sport` tag (first value; `generic` if none). */
export function sportKey(sport) {
  const first = String(sport ?? '').split(';')[0].trim();
  return first in BY_SPORT ? first : 'generic';
}

/** SVG markup (24-unit viewBox, stroked with currentColor) for a sport key. */
export function sportGlyph(key) {
  return BY_SPORT[key] ?? generic;
}
