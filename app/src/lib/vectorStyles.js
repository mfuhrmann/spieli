// OL vector styles for playground polygons and equipment points.
// Ported from style/VectorStyles.js; import path updated for the new app layout.

import { Icon, Style } from 'ol/style.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Circle from 'ol/style/Circle.js';

import { objDevices, objFeatures } from './objPlaygroundEquipment.js';
import { playgroundCompleteness, hasPhotoSignal } from './completeness.js';
import { COMPLETENESS_PALETTE, COMPLETENESS_ORDER } from './completenessPalette.js';

// ── Playground completeness colours ──────────────────────────────────────────

function makeHatchPattern(color, bgColor) {
    const size = 10;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.stroke();
    return ctx.createPattern(canvas, 'repeat');
}

// Lazily initialised — canvas only available in browser context
let _hatchCache = null;
function getHatch(type) {
    if (!_hatchCache) {
        _hatchCache = {};
        for (const key of COMPLETENESS_ORDER) {
            const { hatch } = COMPLETENESS_PALETTE[key];
            _hatchCache[key] = makeHatchPattern(hatch.stroke, hatch.bg);
        }
    }
    return _hatchCache[type] ?? _hatchCache.missing;
}

const _polygonStyles = Object.fromEntries(
    COMPLETENESS_ORDER.map(key => [key, new Style({
        fill: new Fill({ color: COMPLETENESS_PALETTE[key].fill }),
        stroke: new Stroke({ color: COMPLETENESS_PALETTE[key].stroke, width: 1.5 })
    })])
);

function makeHatchStyle(type) {
    return new Style({
        fill: new Fill({ color: getHatch(type) }),
        stroke: new Stroke({
            color: (COMPLETENESS_PALETTE[type] ?? COMPLETENESS_PALETTE.missing).stroke,
            width: 1.5,
            lineDash: [6, 3]
        })
    });
}

function isRestrictedAccess(props) {
    return props.access === 'private' || props.access === 'customers';
}

// ── Photo marker ─────────────────────────────────────────────────────────────
//
// A photo is additive information, so it gets an additive glyph rather than a
// place in the mapping-detail ramp. Rendered on top of the polygon style; OL
// places image styles at a polygon's interior point.

const CAMERA_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24">' +
    '<path d="M9 3.5h6L16.5 6H21a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5L9 3.5z" ' +
    'fill="#ffffff" stroke="#14532d" stroke-width="2" stroke-linejoin="round"/>' +
    '<circle cx="12" cy="13" r="3.6" fill="none" stroke="#14532d" stroke-width="2"/>' +
    '</svg>';

let _photoStyle = null;
function getPhotoStyle() {
    if (!_photoStyle) {
        _photoStyle = new Style({
            image: new Icon({
                src: 'data:image/svg+xml;utf8,' + encodeURIComponent(CAMERA_SVG),
                scale: 0.8,
                opacity: 0.95,
            }),
            // Above the polygon fill, below selection.
            zIndex: 1,
        });
    }
    return _photoStyle;
}

/** Style function for the playground polygon layer. */
export function playgroundStyleFn(feature) {
    const props = feature.getProperties();
    const c = playgroundCompleteness(props);
    const base = isRestrictedAccess(props)
        ? makeHatchStyle(c)
        : (_polygonStyles[c] ?? _polygonStyles.missing);
    return hasPhotoSignal(props) ? [base, getPhotoStyle()] : base;
}

// ── Selected playground highlight ────────────────────────────────────────────

export const selectionStyle = new Style({
    fill: new Fill({ color: 'rgba(255, 0, 0, 0.15)' }),
    stroke: new Stroke({ color: '#ff0000', width: 3 })
});

// ── Equipment point / polygon styles ─────────────────────────────────────────

const circleRadius = 3.5;
const strokeWidth  = 3.5;
const fillAlpha    = 0.4;
const strokeAlpha  = 1;
const featureColor = '#394240';

// Colours by equipment category
export const objColors = {
    stationary:       '#825c46',
    structure_parts:  '#825c46',
    sand:             '#d6a52c',
    water:            '#0fa1fb',
    swing:            '#ee4b9e',
    motion:           '#ee4b9e',
    balance:          '#5ab2ae',
    climbing:         '#5ab2ae',
    rotating:         '#5ab2ae',
    activity:         '#5ab2ae',
    fallback:         '#40474a',
};

const objOpacity = { sandpit: 0.3 };

function hexToRgb(hex) {
    hex = hex.replace('#', '');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ── Tree style ────────────────────────────────────────────────────────────────

export const treeStyle = new Style({
    image: new Circle({
        radius: 4,
        fill: new Fill({ color: 'rgba(34, 139, 34, 0.5)' }),
        stroke: new Stroke({ color: '#155215', width: 1.5 })
    })
});

const treeRowStyle = new Style({
    stroke: new Stroke({ color: '#155215', width: 2 })
});

export function treeStyleFn(feature) {
    const type = feature.getGeometry()?.getType();
    return type === 'LineString' || type === 'MultiLineString' ? treeRowStyle : treeStyle;
}

// ── Tiered-delivery styles (P1 §3 / §4) ───────────────────────────────────────

// Cluster tier (zoom ≤ clusterMaxZoom) — canvas-rendered ring with
// complete/partial/missing segments and the count in the centre.
// Single-child clusters (count === 1) render as a solid completeness dot.
// See app/src/lib/clusterStyle.js for the renderer + bitmap cache.
export { clusterRingStyleFn as clusterTierStyleFn } from './clusterStyle.js';

/** Style function for the equipment overlay layer. Never uses icon image files. */
export function equipmentLayerStyleFn(feature) {
    const geomType = feature.getGeometry()?.getType();
    // Suppress only the *point* dots of grouped child devices — the structure
    // polygon itself still renders, and any non-Point child (e.g. a sandpit
    // polygon contained inside a structure) keeps its visible geometry.
    if (feature.get('_groupId') && geomType === 'Point') return null;
    const playground = feature.get('playground');
    const leisure    = feature.get('leisure');

    let color;
    if (playground && playground !== 'yes' && playground in objDevices) {
        const cat = objDevices[playground].category;
        color = objColors[cat] ?? objColors.fallback;
    } else if (leisure === 'fitness_station') {
        color = objColors.activity;
    } else if (leisure === 'pitch') {
        color = '#4a7c3f';
    } else {
        color = objColors.stationary;
    }

    const [r, g, b] = hexToRgb(color);
    const fillColor   = `rgba(${r},${g},${b},0.5)`;
    const strokeColor = `rgba(${r},${g},${b},1)`;

    const radius = (leisure === 'pitch') ? 8 : (leisure === 'fitness_station') ? 7 : 5;
    if (geomType === 'Point' || geomType === 'MultiPoint') {
        return new Style({
            image: new Circle({
                radius,
                fill: new Fill({ color: fillColor }),
                stroke: new Stroke({ color: strokeColor, width: 2 })
            })
        });
    }
    if (geomType === 'LineString' || geomType === 'MultiLineString') {
        return new Style({ stroke: new Stroke({ color: strokeColor, width: 3 }) });
    }
    return new Style({
        fill: new Fill({ color: fillColor }),
        stroke: new Stroke({ color: strokeColor, width: 2 })
    });
}

/** Style function for equipment vector features (points and polygons). */
export function styleFunction(feature, mode, isPoint) {
    const playground = feature.get('playground');
    let color = objColors.fallback;
    let icon = null;
    let icon_size = null;

    if (mode === 'select') {
        color = '#ff0000';
    } else if (playground in objDevices) {
        const cat = objDevices[playground].category;
        if (cat in objColors) color = objColors[cat];
    } else {
        color = featureColor;
        outer: for (const feat in objFeatures) {
            const tags = objFeatures[feat].tags;
            for (const key in tags) {
                if (feature.get(key) !== tags[key]) continue outer;
            }
            icon = objFeatures[feat].icon;
            icon_size = objFeatures[feat].size;
            break;
        }
    }

    const alpha = playground in objOpacity ? objOpacity[playground] : fillAlpha;
    const [r, g, b] = hexToRgb(color);
    const fill   = `rgba(${r},${g},${b},${alpha})`;
    const stroke = `rgba(${r},${g},${b},${strokeAlpha})`;

    let radius = circleRadius;
    let width  = strokeWidth;
    if (mode === 'select') { radius += 2; width += 2; }
    if (playground === 'sandpit') width -= 1;

    if (isPoint) {
        if (icon) {
            return new Style({
                image: new Icon({ src: `/img/icons/${icon}.png`, width: icon_size })
            });
        }
        return new Style({
            image: new Circle({
                radius,
                fill: new Fill({ color: fill }),
                stroke: new Stroke({ color: stroke, width })
            })
        });
    }
    return new Style({
        fill: new Fill({ color: fill }),
        stroke: new Stroke({ color: stroke, width })
    });
}

// ── Location marker style (user's GPS position) ────────────────────────────

const locationWhiteRing = new Style({
  image: new Circle({
    radius: 9,
    fill: new Fill({ color: '#ffffff' }),
  }),
});

const PULSE_STEPS = 60;
const pulseStyles = Array.from({ length: PULSE_STEPS }, (_, i) => {
  const phase = Math.sin((i / PULSE_STEPS) * Math.PI * 2) * 0.5 + 0.5;
  return [
    locationWhiteRing,
    new Style({
      image: new Circle({
        radius: 4 + phase * 4,
        fill: new Fill({ color: '#007aff' }),
      }),
    }),
  ];
});

export function locationDotStyleFn() {
  const step = Math.floor((Date.now() % 2000) / (2000 / PULSE_STEPS));
  return pulseStyles[step];
}

export const locationAccuracyStyle = new Style({
  fill: new Fill({ color: 'rgba(0, 122, 255, 0.15)' }),
  stroke: new Stroke({ color: '#ffffff', width: 2 }),
});
