// Finder rendering — the map with mapping detail off (#924).
//
// One neutral emerald at every tier instead of completeness colours:
//
//   cluster tier   filled disc with the count, same size scale as the
//                  completeness rings; a cluster of one is a pin
//   polygon tier   a pin per playground at its interior point, no polygon
//   selection      the selected playground's polygon outlined under its pin
//   not public     a lock badge on the pin (access=private/customers) — the
//                  same rule as mapping detail's hatched polygons
//
// The pin is the disc with a pointer merged into its bottom, anchored at the
// pointer's tip, so a single playground looks the same on both sides of the
// cluster/polygon zoom boundary. Bitmaps are cached like clusterStyle's rings.
//
// Renderers draw in CSS pixels through hidpiStyleOptions (see
// hidpiRenderer.js), which also supplies the 1:1 hit-detection renderer, so a
// click on the pin selects the playground through the existing
// forEachFeatureAtPixel path. A click inside the (undrawn) polygon
// off the pin does not — in finder mode the pin is the target.

import Style from 'ol/style/Style.js';
import Icon from 'ol/style/Icon.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import { radiusForCount, countBucket } from './clusterStyle.js';
import { hasPhotoSignal } from './completeness.js';
import { accessKind } from './access.js';
import { sportKey, sportGlyph } from './sportGlyphs.js';
import { FINDER } from './completenessPalette.js';
import { hidpiStyleOptions } from './hidpiRenderer.js';

// Disc outer radius matches the completeness ring's outer edge (radius + half
// its 8 px stroke), so toggling mapping detail does not resize the clusters.
const RING_HALF   = 4;
const COUNT_FONT  = 'bold 16px ui-monospace, "SF Mono", Menlo, system-ui, -apple-system, sans-serif';
const PIN_RADIUS  = 11;
const PIN_POINTER = 8;     // tip distance below the disc's edge
const PIN_SPREAD  = 0.55;  // half-angle (rad) where the pointer leaves the disc
const PAD         = 3;     // room for the casing outside the shape

// Casing, then border, then fill: the fill covers the inner half of both
// strokes, leaving ~1 px of casing outside ~1.5 px of border.
const SOLID   = { casing: FINDER.casing, border: FINDER.border, fill: FINDER.fill };
// Pitches invert it — white body, emerald rim — so they read as "something
// else to play on", secondary to the solid playground pins.
const OUTLINE = { casing: FINDER.casing, border: FINDER.fill, fill: FINDER.border };

function paintShape(ctx, tracePath, colors = SOLID) {
  ctx.lineJoin = 'round';
  tracePath(); ctx.strokeStyle = colors.casing; ctx.lineWidth = 5; ctx.stroke();
  tracePath(); ctx.strokeStyle = colors.border; ctx.lineWidth = 3; ctx.stroke();
  tracePath(); ctx.fillStyle   = colors.fill;   ctx.fill();
}

function prepareCanvas(canvas, w, h, pixelRatio) {
  canvas.width  = Math.ceil(w * pixelRatio);
  canvas.height = Math.ceil(h * pixelRatio);
  const ctx = canvas.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio);
  return ctx;
}

// ── Cluster disc ─────────────────────────────────────────────────────────────

const discCache = new Map();

function drawDisc(canvas, count, pixelRatio) {
  const r = radiusForCount(count) + RING_HALF;
  const c = r + PAD;
  const ctx = prepareCanvas(canvas, c * 2, c * 2, pixelRatio);
  paintShape(ctx, () => { ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); });

  // White count with a casing halo — white on the fill alone is 3.56:1,
  // see FINDER in completenessPalette.js.
  ctx.font         = COUNT_FONT;
  if ('fontFeatureSettings' in ctx) ctx.fontFeatureSettings = '"tnum" 1';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth    = 3;
  ctx.strokeStyle  = FINDER.casing;
  ctx.strokeText(String(count), c, c + 0.5);
  ctx.fillStyle    = FINDER.text;
  ctx.fillText(String(count), c, c + 0.5);
}

function discBitmap(count, pixelRatio) {
  // Same bucketing as the completeness rings, so both modes show one number.
  const bucket = countBucket(count);
  const key = `${bucket}@${pixelRatio}`;
  let canvas = discCache.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    drawDisc(canvas, bucket, pixelRatio);
    discCache.set(key, canvas);
  }
  return canvas;
}

// ── Pin ──────────────────────────────────────────────────────────────────────

const pinCache = new Map();
const BADGE_PAD = 5;  // room above and right of the disc for the lock badge
const PIN_CX = PIN_RADIUS + PAD;
const PIN_CY = BADGE_PAD + PIN_RADIUS + PAD;
const PIN_W = PIN_CX + PIN_RADIUS + PAD + BADGE_PAD;
const PIN_H = PIN_CY + PIN_RADIUS + PIN_POINTER + PAD;
const PIN_TIP_Y = PIN_CY + PIN_RADIUS + PIN_POINTER;

// Same camera outline as the mapping-detail glyph (vectorStyles CAMERA_SVG),
// in its 24-unit viewBox.
const CAMERA_BODY = 'M9 3.5h6L16.5 6H21a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5L9 3.5z';

// Access badges (#1002): a disc overlapping the pin's upper right, so it
// reads without hiding the photo glyph. BADGE_PAD gives it room in the
// bitmap; the anchor still sits on the pointer's tip.
//   private   — lock on a dark disc, and the whole pin greyed: not for you
//   customers — cup on an amber disc, pin stays green: usable as a guest
const LOCK_BADGE = '#374151';     // gray-700 — neutral, not a mapping-detail colour
const CUSTOMERS_BADGE = '#b45309'; // amber-700 — "conditional", white glyph ≥ 4.5:1
// The private pin: same shape, emerald swapped for grey, so "closed to you"
// is visible from the pin itself and not only from a 15 px badge.
const MUTED = { casing: '#4b5563', border: '#ffffff', fill: '#9ca3af' };

const BADGE_X = PIN_CX + 9, BADGE_Y = PIN_CY - 9, BADGE_R = 7.5;

function drawBadgeDisc(ctx, colour) {
  ctx.beginPath();
  ctx.arc(BADGE_X, BADGE_Y, BADGE_R, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = FINDER.border;
  ctx.stroke();
}

function drawLockBadge(ctx) {
  const bx = BADGE_X, by = BADGE_Y;
  drawBadgeDisc(ctx, LOCK_BADGE);
  // Shackle, then body.
  ctx.beginPath();
  ctx.arc(bx, by - 1, 2.4, Math.PI, 0);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = FINDER.border;
  ctx.fillRect(bx - 3.5, by - 1, 7, 5);
}

function drawCupBadge(ctx) {
  const bx = BADGE_X, by = BADGE_Y;
  drawBadgeDisc(ctx, CUSTOMERS_BADGE);
  // Cup body, then handle.
  ctx.fillStyle = FINDER.border;
  ctx.fillRect(bx - 4, by - 2.5, 6, 5.5);
  ctx.beginPath();
  ctx.arc(bx + 2.2, by + 0.2, 1.9, -Math.PI / 2, Math.PI / 2);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = FINDER.border;
  ctx.stroke();
}

function drawPin(canvas, photo, kind, pixelRatio) {
  const ctx = prepareCanvas(canvas, PIN_W, PIN_H, pixelRatio);
  const colors = kind === 'private' ? MUTED : SOLID;
  paintShape(ctx, () => tracePinPath(ctx), colors);

  if (photo) {
    const s = 0.58; // 24-unit glyph → ~14 px
    ctx.save();
    ctx.translate(PIN_CX - 12 * s, PIN_CY - 12.5 * s);
    ctx.scale(s, s);
    ctx.fillStyle = FINDER.border;
    ctx.fill(new Path2D(CAMERA_BODY));
    ctx.beginPath();
    ctx.arc(12, 13, 3.6, 0, Math.PI * 2);
    ctx.fillStyle = colors.fill;
    ctx.fill();
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(PIN_CX, PIN_CY, 4, 0, Math.PI * 2);
    ctx.fillStyle = FINDER.border;
    ctx.fill();
  }

  if (kind === 'private') drawLockBadge(ctx);
  else if (kind === 'customers') drawCupBadge(ctx);
}

function pinBitmap(photo, kind, pixelRatio) {
  const key = `${photo ? 1 : 0}${kind}@${pixelRatio}`;
  let canvas = pinCache.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    drawPin(canvas, photo, kind, pixelRatio);
    pinCache.set(key, canvas);
  }
  return canvas;
}

// ── Pitch pin ────────────────────────────────────────────────────────────────
// Standalone pitches (the optional "pitches outside playgrounds" layer) get
// the playground pin's outline inverted — white body, emerald rim — with a
// glyph for their sport (sportGlyphs.js), so they read as secondary to the
// solid playground pins and say what kind of pitch they are.
//
// An SVG Icon rather than a canvas renderer: the glyphs are SVG path data,
// which canvas would have to re-implement. Drawn at 3x and scaled down so it
// stays crisp on high-DPI screens.

function tracePinPath(ctx) {
  const down = Math.PI / 2;
  ctx.beginPath();
  ctx.arc(PIN_CX, PIN_CY, PIN_RADIUS, down + PIN_SPREAD, down - PIN_SPREAD + Math.PI * 2);
  ctx.lineTo(PIN_CX, PIN_TIP_Y);
  ctx.closePath();
}

function pinPathData() {
  const a0 = Math.PI / 2 + PIN_SPREAD, a1 = Math.PI / 2 - PIN_SPREAD;
  const p = a => `${(PIN_CX + PIN_RADIUS * Math.cos(a)).toFixed(2)} ${(PIN_CY + PIN_RADIUS * Math.sin(a)).toFixed(2)}`;
  return `M${p(a0)}A${PIN_RADIUS} ${PIN_RADIUS} 0 1 1 ${p(a1)}L${PIN_CX} ${PIN_TIP_Y}Z`;
}

const PITCH_ICON_SCALE = 3;
const GLYPH_SCALE = 0.6; // 24-unit glyph → ~14 px inside the 22 px disc

function pitchPinSvg(glyph) {
  const d = pinPathData();
  const g0 = 12 * GLYPH_SCALE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_W * PITCH_ICON_SCALE}" height="${PIN_H * PITCH_ICON_SCALE}" viewBox="0 0 ${PIN_W} ${PIN_H}">`
    + `<path d="${d}" fill="none" stroke="${OUTLINE.casing}" stroke-width="5" stroke-linejoin="round"/>`
    + `<path d="${d}" fill="none" stroke="${OUTLINE.border}" stroke-width="3" stroke-linejoin="round"/>`
    + `<path d="${d}" fill="${OUTLINE.fill}"/>`
    + `<g transform="translate(${PIN_CX - g0} ${PIN_CY - g0}) scale(${GLYPH_SCALE})" color="${FINDER.fill}" fill="none" `
    + `stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>`
    + '</svg>';
}

const pitchStyles = new Map();

function pitchPinStyle(key) {
  let style = pitchStyles.get(key);
  if (!style) {
    style = new Style({
      geometry: interiorPoints,
      image: new Icon({
        src: 'data:image/svg+xml;utf8,' + encodeURIComponent(pitchPinSvg(sportGlyph(key))),
        anchor: [PIN_CX / PIN_W, PIN_TIP_Y / PIN_H],
        scale: 1 / PITCH_ICON_SCALE,
      }),
      zIndex: 2,
    });
    pitchStyles.set(key, style);
  }
  return style;
}

/** Pin for a standalone pitch, by sport; null for anything that is not a pitch. */
export function pitchPinFor(feature) {
  return feature.get('leisure') === 'pitch' ? pitchPinStyle(sportKey(feature.get('sport'))) : null;
}

function drawPinAt(ctx, [x, y], photo, kind, pixelRatio) {
  // Anchor the pointer's tip on the coordinate.
  ctx.drawImage(pinBitmap(photo, kind, pixelRatio), x - PIN_CX, y - PIN_TIP_Y, PIN_W, PIN_H);
}

// ── Styles ───────────────────────────────────────────────────────────────────

function renderFinderCluster(pixelCoords, state) {
  const pixelRatio = state.pixelRatio || 1;
  const count = state.feature.get('count') ?? 0;
  // Cluster buckets carry no access information, so a cluster of one cannot
  // show the access badge; it appears once the polygon tier draws the playground.
  if (count <= 1) {
    drawPinAt(state.context, pixelCoords, false, 'public', pixelRatio);
    return;
  }
  const bitmap = discBitmap(count, pixelRatio);
  const w = bitmap.width / pixelRatio;
  const h = bitmap.height / pixelRatio;
  state.context.drawImage(bitmap, pixelCoords[0] - w / 2, pixelCoords[1] - h / 2, w, h);
}

const finderClusterStyle = new Style(hidpiStyleOptions(renderFinderCluster));

/** Cluster-tier style with mapping detail off. */
export function finderClusterStyleFn(_feature) {
  return finderClusterStyle;
}

function interiorPoints(feature) {
  const g = feature.getGeometry();
  if (!g) return null;
  const type = g.getType();
  if (type === 'Polygon')      return g.getInteriorPoint();
  if (type === 'MultiPolygon') return g.getInteriorPoints();
  return g;
}

function renderPlaygroundPin(pixelCoords, state) {
  const pixelRatio = state.pixelRatio || 1;
  const props = state.feature.getProperties();
  const photo = hasPhotoSignal(props);
  const kind = accessKind(props);
  // A MultiPolygon yields a MultiPoint: one pin per part, as the photo glyph
  // already does in mapping-detail mode.
  const points = Array.isArray(pixelCoords[0]) ? pixelCoords : [pixelCoords];
  for (const p of points) drawPinAt(state.context, p, photo, kind, pixelRatio);
}

const pinStyle = new Style({ geometry: interiorPoints, ...hidpiStyleOptions(renderPlaygroundPin), zIndex: 2 });

const selectedOutlineStyle = new Style({
  fill:   new Fill({ color: FINDER.selectedFill }),
  stroke: new Stroke({ color: FINDER.fill, width: 3 }),
  zIndex: 1,
});

/**
 * Polygon-tier style with mapping detail off: a pin per playground, plus the
 * outline of the selected one. Matched by osm_id, not identity — the tier
 * refetch replaces the source's features, so the selected object goes stale.
 */
export function finderPlaygroundStyle(feature, selectedOsmId) {
  return selectedOsmId != null && feature.get('osm_id') === selectedOsmId
    ? [selectedOutlineStyle, pinStyle]
    : pinStyle;
}

// Exposed for tests / bitmap-pool diagnostics.
export function _finderCacheSizes() {
  return { discs: discCache.size, pins: pinCache.size };
}
