// Finder rendering — the map with mapping detail off (#924).
//
// One neutral emerald at every tier instead of completeness colours:
//
//   cluster tier   filled disc with the count, same size scale as the
//                  completeness rings; a cluster of one is a pin
//   polygon tier   a pin per playground at its interior point, no polygon
//   selection      the selected playground's polygon outlined under its pin
//
// The pin is the disc with a pointer merged into its bottom, anchored at the
// pointer's tip, so a single playground looks the same on both sides of the
// cluster/polygon zoom boundary. Bitmaps are cached like clusterStyle's rings.
//
// Hit detection needs nothing special: OL hit-tests renderer styles by
// drawing them, so a click on the pin selects the playground through the
// existing forEachFeatureAtPixel path. A click inside the (undrawn) polygon
// off the pin does not — in finder mode the pin is the target.

import Style from 'ol/style/Style.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import { radiusForCount, countBucket } from './clusterStyle.js';
import { hasPhotoSignal } from './completeness.js';
import { FINDER } from './completenessPalette.js';

// Disc outer radius matches the completeness ring's outer edge (radius + half
// its 8 px stroke), so toggling mapping detail does not resize the clusters.
const RING_HALF   = 4;
const COUNT_FONT  = 'bold 16px ui-monospace, "SF Mono", Menlo, system-ui, -apple-system, sans-serif';
const PIN_RADIUS  = 11;
const PIN_POINTER = 8;     // tip distance below the disc's edge
const PIN_SPREAD  = 0.55;  // half-angle (rad) where the pointer leaves the disc
const PAD         = 3;     // room for the casing outside the shape

// Casing, then white border, then fill: the fill covers the inner half of
// both strokes, leaving ~1 px of casing outside ~1.5 px of white.
function paintShape(ctx, tracePath) {
  ctx.lineJoin = 'round';
  tracePath(); ctx.strokeStyle = FINDER.casing; ctx.lineWidth = 5; ctx.stroke();
  tracePath(); ctx.strokeStyle = FINDER.border; ctx.lineWidth = 3; ctx.stroke();
  tracePath(); ctx.fillStyle   = FINDER.fill;   ctx.fill();
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
const PIN_W = (PIN_RADIUS + PAD) * 2;
const PIN_H = PAD + PIN_RADIUS * 2 + PIN_POINTER + PAD;
const PIN_CX = PIN_RADIUS + PAD;
const PIN_CY = PIN_RADIUS + PAD;
const PIN_TIP_Y = PIN_CY + PIN_RADIUS + PIN_POINTER;

// Same camera outline as the mapping-detail glyph (vectorStyles CAMERA_SVG),
// in its 24-unit viewBox.
const CAMERA_BODY = 'M9 3.5h6L16.5 6H21a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5L9 3.5z';

function drawPin(canvas, photo, pixelRatio) {
  const ctx = prepareCanvas(canvas, PIN_W, PIN_H, pixelRatio);
  const down = Math.PI / 2;
  paintShape(ctx, () => {
    ctx.beginPath();
    ctx.arc(PIN_CX, PIN_CY, PIN_RADIUS, down + PIN_SPREAD, down - PIN_SPREAD + Math.PI * 2);
    ctx.lineTo(PIN_CX, PIN_TIP_Y);
    ctx.closePath();
  });

  if (photo) {
    const s = 0.58; // 24-unit glyph → ~14 px
    ctx.save();
    ctx.translate(PIN_CX - 12 * s, PIN_CY - 12.5 * s);
    ctx.scale(s, s);
    ctx.fillStyle = FINDER.border;
    ctx.fill(new Path2D(CAMERA_BODY));
    ctx.beginPath();
    ctx.arc(12, 13, 3.6, 0, Math.PI * 2);
    ctx.fillStyle = FINDER.fill;
    ctx.fill();
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(PIN_CX, PIN_CY, 4, 0, Math.PI * 2);
    ctx.fillStyle = FINDER.border;
    ctx.fill();
  }
}

function pinBitmap(photo, pixelRatio) {
  const key = `${photo ? 1 : 0}@${pixelRatio}`;
  let canvas = pinCache.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    drawPin(canvas, photo, pixelRatio);
    pinCache.set(key, canvas);
  }
  return canvas;
}

function drawPinAt(ctx, [x, y], photo, pixelRatio) {
  // Anchor the pointer's tip on the coordinate.
  ctx.drawImage(pinBitmap(photo, pixelRatio), x - PIN_CX, y - PIN_TIP_Y, PIN_W, PIN_H);
}

// ── Styles ───────────────────────────────────────────────────────────────────

function renderFinderCluster(pixelCoords, state) {
  const pixelRatio = state.pixelRatio || 1;
  const count = state.feature.get('count') ?? 0;
  if (count <= 1) {
    drawPinAt(state.context, pixelCoords, false, pixelRatio);
    return;
  }
  const bitmap = discBitmap(count, pixelRatio);
  const w = bitmap.width / pixelRatio;
  const h = bitmap.height / pixelRatio;
  state.context.drawImage(bitmap, pixelCoords[0] - w / 2, pixelCoords[1] - h / 2, w, h);
}

const finderClusterStyle = new Style({ renderer: renderFinderCluster });

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
  const photo = hasPhotoSignal(state.feature.getProperties());
  // A MultiPolygon yields a MultiPoint: one pin per part, as the photo glyph
  // already does in mapping-detail mode.
  const points = Array.isArray(pixelCoords[0]) ? pixelCoords : [pixelCoords];
  for (const p of points) drawPinAt(state.context, p, photo, pixelRatio);
}

const pinStyle = new Style({ geometry: interiorPoints, renderer: renderPlaygroundPin, zIndex: 2 });

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
