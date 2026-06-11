// OL vector styles for playground polygons and equipment points.
// Ported from style/VectorStyles.js; import path updated for the new app layout.

import { Icon, Style } from 'ol/style.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Circle from 'ol/style/Circle.js';
import Point from 'ol/geom/Point.js';
import MultiPoint from 'ol/geom/MultiPoint.js';

import { objDevices, objFeatures } from './objPlaygroundEquipment.js';
import { playgroundCompleteness } from './completeness.js';

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
let _hatchComplete, _hatchPartial, _hatchMissing;
function getHatch(type) {
    if (!_hatchComplete) {
        _hatchComplete = makeHatchPattern('rgba(34,139,34,0.55)',  'rgba(34,139,34,0.08)');
        _hatchPartial  = makeHatchPattern('rgba(180,130,0,0.55)',  'rgba(234,179,8,0.08)');
        _hatchMissing  = makeHatchPattern('rgba(200,50,50,0.55)',  'rgba(239,68,68,0.06)');
    }
    return type === 'complete' ? _hatchComplete
         : type === 'partial'  ? _hatchPartial
         : _hatchMissing;
}

const _styleComplete = new Style({
    fill: new Fill({ color: 'rgba(34, 139, 34, 0.22)' }),
    stroke: new Stroke({ color: '#155215', width: 1.5 })
});
const _stylePartial = new Style({
    fill: new Fill({ color: 'rgba(234, 179, 8, 0.22)' }),
    stroke: new Stroke({ color: '#92400e', width: 1.5 })
});
const _styleMissing = new Style({
    fill: new Fill({ color: 'rgba(239, 68, 68, 0.18)' }),
    stroke: new Stroke({ color: '#991b1b', width: 1.5 })
});

function makeHatchStyle(type) {
    const colors = {
        complete: { stroke: '#155215' },
        partial:  { stroke: '#92400e' },
        missing:  { stroke: '#991b1b' },
    };
    return new Style({
        fill: new Fill({ color: getHatch(type) }),
        stroke: new Stroke({ color: colors[type].stroke, width: 1.5, lineDash: [6, 3] })
    });
}

function isRestrictedAccess(props) {
    return props.access === 'private' || props.access === 'customers';
}

/** Style function for the playground polygon layer. */
export function playgroundStyleFn(feature) {
    const props = feature.getProperties();
    const c = playgroundCompleteness(props);
    if (isRestrictedAccess(props)) return makeHatchStyle(c);
    if (c === 'complete') return _styleComplete;
    if (c === 'partial')  return _stylePartial;
    return _styleMissing;
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
    image: new Icon({
        src: '/img/icons/temaki/tree_broadleaved.svg',
        width: 40,
        height: 40,
        anchor: [0.5, 0.5],
        color: '#155215',
        displacement: [0, 0]
    })
});

const treeNeedleStyle = new Style({
    image: new Icon({
        src: '/img/icons/temaki/tree_needleleaved.svg',
        width: 40,
        height: 40,
        anchor: [0.5, 0.5],
        color: '#155215',
        displacement: [0, 0]
    })
});

const treeRowStyle = new Style({
    stroke: new Stroke({ color: '#155215', width: 2 })
});

export function treeStyleFn(feature) {
    const type = feature.getGeometry()?.getType();
    const leafType = feature.get('leaf_type');
    const isNeedle = leafType === 'needleleaved' || leafType === 'evergreen';
    const icon = isNeedle ? treeNeedleStyle : treeStyle;
    
    if (type === 'LineString' || type === 'MultiLineString') {
        // For tree rows (lines), show tree icons at each vertex
        const geometry = feature.getGeometry();
        const iconStyle = icon.clone();
        
        // Create points at each vertex of the line
        const coords = geometry.getCoordinates();
        if (coords.length > 0) {
            // For LineString, coords is an array of points
            // For MultiLineString, coords is an array of LineString coordinates
            const points = [];
            
            if (type === 'LineString') {
                points.push(...coords);
            } else {
                // MultiLineString: flatten all line strings
                for (const lineCoords of coords) {
                    points.push(...lineCoords);
                }
            }
            
            if (points.length > 0) {
                // Return a multi-geometry style with points
                const multiGeom = new MultiPoint(points);
                iconStyle.setGeometry(multiGeom);
                return iconStyle;
            }
        }
        // Fallback to line style if we can't create points
        return treeRowStyle;
    }
    
    return isNeedle ? treeNeedleStyle : treeStyle;
}

// ── Tiered-delivery styles (P1 §3 / §4) ───────────────────────────────────────

// Cluster tier (zoom ≤ clusterMaxZoom) — canvas-rendered ring with
// complete/partial/missing segments and the count in the centre.
// Single-child clusters (count === 1) render as a solid completeness dot.
// See app/src/lib/clusterStyle.js for the renderer + bitmap cache.
export { clusterRingStyleFn as clusterTierStyleFn } from './clusterStyle.js';

/** Style function for the equipment overlay layer. Uses Temaki icons for points (SPEC-636). */
export function equipmentLayerStyleFn(feature) {
    const geomType = feature.getGeometry()?.getType();
    // Suppress all child devices of grouped structures (they're shown as one device)
    if (feature.get('_groupId')) return null;
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

    // Device-specific Temaki icon mapping (takes precedence over category)
    const deviceIconMap = {
        slide: 'slide',
        seesaw: 'seesaw',
        swing: 'swing',
        baby_swing: 'swing',
        basketswing: 'swing',
        tire_swing: 'swing',
        rope_swing: 'swing',
        climbingframe: 'climbing_frame',
        climbingwall: 'climbing_frame',
        balancebeam: 'balance_beam',
        trampoline: 'trampoline',
        playhouse: 'playhouse',
        zipwire: 'zip_wire',
        sandbox: 'sandbox',
        sandpit: 'sandbox',
        springy: 'spring_rider',
        water_wheel: 'water_device',
        pump: 'water_device',
        splash_pad: 'water',
        water_channel: 'water_device',
        water_stream: 'water_device',
        water_seesaw: 'water_device',
        water_basin: 'water_device',
        water_barrier: 'water_device',
        archimedes_screw: 'water_device',
        water_cannon: 'water_device',
        water_sprayer: 'water_device',
        marble_run: 'play_structure',
        table: 'table_soccer',
        hammock: 'play_structure',
    };

    // Category to Temaki icon mapping (fallback for devices without specific mapping)
    const iconMap = {
        swing: 'swing',
        climbing: 'climbing_frame',
        balance: 'balance_beam',
        sand: 'sandbox',
        water: 'water',
        motion: 'zip_wire',
        rotating: 'play_structure',
        activity: 'gym',
        structure_parts: 'play_structure',
        stationary: 'play_structure',
        other: 'play_structure',
        topographical: 'play_structure',
    };

    // For Point geometries, use Temaki icons instead of circles (SPEC-636)
    const radius = (leisure === 'pitch') ? 8 : (leisure === 'fitness_station') ? 7 : 5;
    if (geomType === 'Point' || geomType === 'MultiPoint') {
        // First, check if feature matches any objFeatures entry (benches, waste, etc.)
        let iconName = null;
        let iconSizePx = 40; // Default size for Temaki icons
        
        // Check objFeatures for specific OSM tag matches (benches, waste, etc.)
        outer: for (const featKey in objFeatures) {
            const feat = objFeatures[featKey];
            if (feat.icon) {
                const tags = feat.tags;
                let matches = true;
                for (const key in tags) {
                    // Try both direct property and nested tags property
                    const value = feature.get(key) ?? feature.get('tags')?.[key];
                    if (value !== tags[key]) {
                        matches = false;
                        break;
                    }
                }
                if (matches) {
                    // Map objFeatures PNG icons to Temaki SVG icons
                    const pngToTemaki = {
                        bench_backrest_yes: 'bench',
                        bench_backrest_no: 'bench',
                        waste_basket: 'waste',
                        tree_needleleaved: 'tree_needleleaved',
                        tree_broadleaved: 'tree_broadleaved',
                        gate: 'gate',
                        shelter: 'shelter',
                        shelter_building: 'shelter',
                        picnic_shelter: 'shelter',
                        shrub: 'shrub',
                        picnic_table: 'table_soccer',
                        pitch: 'table_soccer',
                        soccer: 'table_soccer',
                        basketball: 'table_soccer',
                        table_tennis: 'table_soccer',
                        artwork: 'play_structure',
                        bicycle_parking: 'play_structure',
                    };
                    iconName = pngToTemaki[feat.icon] ?? feat.icon.replace('.png', '');
                    iconSizePx = (feat.size || 12) * 3.33; // ~40px for size 12
                    break;
                }
            }
        }
        
        // If no objFeatures match, use device-specific or category-based mapping for playground equipment
        if (!iconName && playground && playground !== 'yes' && playground in objDevices) {
            iconName = deviceIconMap[playground] ?? iconMap[objDevices[playground].category] ?? 'play_structure';
            iconSizePx = 40; // Match cluster single playground icon size
        } else if (!iconName && leisure === 'fitness_station') {
            iconName = 'gym';
            iconSizePx = 40; // Standard size
        } else if (!iconName && leisure === 'pitch') {
            iconName = 'table_soccer';
            iconSizePx = 40; // Standard size
        }
        
        if (iconName) {
            // Check if we have this Temaki icon, otherwise use play_structure
            const iconPath = `/img/icons/temaki/${iconName}.svg`;
            return new Style({
                image: new Icon({
                    src: iconPath,
                    width: iconSizePx,
                    height: iconSizePx,
                    anchor: [0.5, 0.5],
                    color: strokeColor,
                    displacement: [0, 0]
                })
            });
        }
        
        // Fallback to circle if no icon found
        return new Style({
            image: new Circle({
                radius,
                fill: new Fill({ color: fillColor }),
                stroke: new Stroke({ color: strokeColor, width: 2 })
            })
        });
    }
    if (geomType === 'LineString' || geomType === 'MultiLineString') {
        // For way objects (zipwire, benches, etc.), show icon at midpoint
        let iconName = null;
        let iconSizePx = 40;
        
        // First check objFeatures for LineString features (benches, shelters, etc. that are ways)
        outer: for (const featKey in objFeatures) {
            const feat = objFeatures[featKey];
            if (feat.icon) {
                const tags = feat.tags;
                let matches = true;
                for (const key in tags) {
                    // Try both direct property and nested tags property
                    const value = feature.get(key) ?? feature.get('tags')?.[key];
                    if (value !== tags[key]) {
                        matches = false;
                        break;
                    }
                }
                if (matches) {
                    const pngToTemaki = {
                        bench_backrest_yes: 'bench',
                        bench_backrest_no: 'bench',
                        waste_basket: 'waste',
                        tree_needleleaved: 'tree_needleleaved',
                        tree_broadleaved: 'tree_broadleaved',
                        gate: 'gate',
                        shelter: 'shelter',
                        shelter_building: 'shelter',
                        picnic_shelter: 'shelter',
                        shrub: 'shrub',
                        picnic_table: 'table_soccer',
                        pitch: 'table_soccer',
                        soccer: 'table_soccer',
                        basketball: 'table_soccer',
                        table_tennis: 'table_soccer',
                        artwork: 'play_structure',
                        bicycle_parking: 'play_structure',
                    };
                    iconName = pngToTemaki[feat.icon] ?? feat.icon.replace('.png', '');
                    iconSizePx = (feat.size || 12) * 3.33;
                    break;
                }
            }
        }
        
        // If no objFeatures match, check playground equipment (zipwire, etc.)
        if (!iconName && playground && playground !== 'yes' && playground in objDevices) {
            iconName = deviceIconMap[playground] ?? iconMap[objDevices[playground].category] ?? 'play_structure';
            iconSizePx = 40;
        } else if (!iconName && leisure === 'fitness_station') {
            iconName = 'gym';
            iconSizePx = 40;
        } else if (!iconName && leisure === 'pitch') {
            iconName = 'table_soccer';
            iconSizePx = 40;
        }
        
        if (iconName) {
            const geometry = feature.getGeometry();
            // Create a point at the midpoint of the line
            let pointGeom;
            if (geomType === 'LineString') {
                const coords = geometry.getCoordinates();
                const midIndex = Math.floor(coords.length / 2);
                pointGeom = new Point(coords[midIndex]);
            } else {
                // MultiLineString - use first line's midpoint
                const lines = geometry.getLineStrings();
                if (lines.length > 0) {
                    const coords = lines[0].getCoordinates();
                    const midIndex = Math.floor(coords.length / 2);
                    pointGeom = new Point(coords[midIndex]);
                }
            }
            if (pointGeom) {
                return new Style({
                    image: new Icon({
                        src: `/img/icons/temaki/${iconName}.svg`,
                        width: iconSizePx,
                        height: iconSizePx,
                        anchor: [0.5, 0.5],
                        color: strokeColor,
                        displacement: [0, 0]
                    }),
                    geometry: pointGeom
                });
            }
        }
        return new Style({ stroke: new Stroke({ color: strokeColor, width: 3 }) });
    }
    // For structure polygons, show icon at centroid instead of filled polygon
    if (playground === 'structure' && (geomType === 'Polygon' || geomType === 'MultiPolygon')) {
        const geometry = feature.getGeometry();
        const extent = geometry.getExtent();
        // Calculate center from extent [minX, minY, maxX, maxY]
        const center = [
            (extent[0] + extent[2]) / 2,
            (extent[1] + extent[3]) / 2
        ];
        const pointGeom = new Point(center);
        return new Style({
            image: new Icon({
                src: '/img/icons/temaki/play_structure.svg',
                width: 40,
                height: 40,
                anchor: [0.5, 0.5],
                color: strokeColor,
                displacement: [0, 0]
            }),
            geometry: pointGeom
        });
    }
    
    // For fitness station polygons, show icon at centroid
    if (leisure === 'fitness_station' && (geomType === 'Polygon' || geomType === 'MultiPolygon')) {
        const geometry = feature.getGeometry();
        const extent = geometry.getExtent();
        const center = [
            (extent[0] + extent[2]) / 2,
            (extent[1] + extent[3]) / 2
        ];
        const pointGeom = new Point(center);
        return new Style({
            image: new Icon({
                src: '/img/icons/temaki/gym.svg',
                width: 40,
                height: 40,
                anchor: [0.5, 0.5],
                color: objColors.activity,
                displacement: [0, 0]
            }),
            geometry: pointGeom
        });
    }
    
    // For playground device polygons (sandpits, structures, water devices as areas), show icon at centroid
    if (playground && playground !== 'yes' && playground in objDevices && (geomType === 'Polygon' || geomType === 'MultiPolygon')) {
        let iconName = deviceIconMap[playground] ?? iconMap[objDevices[playground].category] ?? 'play_structure';
        let iconSizePx = 40;
        const geometry = feature.getGeometry();
        const extent = geometry.getExtent();
        const center = [
            (extent[0] + extent[2]) / 2,
            (extent[1] + extent[3]) / 2
        ];
        const pointGeom = new Point(center);
        return new Style({
            image: new Icon({
                src: `/img/icons/temaki/${iconName}.svg`,
                width: iconSizePx,
                height: iconSizePx,
                anchor: [0.5, 0.5],
                color: strokeColor,
                displacement: [0, 0]
            }),
            geometry: pointGeom
        });
    }
    
    // For objFeatures polygons (shelters, benches, etc. mapped as areas), show icon at centroid
    if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
        let iconName = null;
        let iconSizePx = 40;
        
        // Check objFeatures for polygon features
        outer: for (const featKey in objFeatures) {
            const feat = objFeatures[featKey];
            if (feat.icon) {
                const tags = feat.tags;
                let matches = true;
                for (const key in tags) {
                    // Try both direct property and nested tags property
                    const value = feature.get(key) ?? feature.get('tags')?.[key];
                    if (value !== tags[key]) {
                        matches = false;
                        break;
                    }
                }
                if (matches) {
                    const pngToTemaki = {
                        bench_backrest_yes: 'bench',
                        bench_backrest_no: 'bench',
                        waste_basket: 'waste',
                        tree_needleleaved: 'tree_needleleaved',
                        tree_broadleaved: 'tree_broadleaved',
                        gate: 'gate',
                        shelter: 'shelter',
                        shelter_building: 'shelter',
                        picnic_shelter: 'shelter',
                        shrub: 'shrub',
                        picnic_table: 'table_soccer',
                        pitch: 'table_soccer',
                        soccer: 'table_soccer',
                        basketball: 'table_soccer',
                        table_tennis: 'table_soccer',
                        artwork: 'play_structure',
                        bicycle_parking: 'play_structure',
                    };
                    iconName = pngToTemaki[feat.icon] ?? feat.icon.replace('.png', '');
                    iconSizePx = (feat.size || 12) * 3.33;
                    break;
                }
            }
        }
        
        if (iconName) {
            const geometry = feature.getGeometry();
            const extent = geometry.getExtent();
            const center = [
                (extent[0] + extent[2]) / 2,
                (extent[1] + extent[3]) / 2
            ];
            const pointGeom = new Point(center);
            return new Style({
                image: new Icon({
                    src: `/img/icons/temaki/${iconName}.svg`,
                    width: iconSizePx,
                    height: iconSizePx,
                    anchor: [0.5, 0.5],
                    color: strokeColor,
                    displacement: [0, 0]
                }),
                geometry: pointGeom
            });
        }
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
