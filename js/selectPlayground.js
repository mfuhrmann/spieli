// =============================================================================
// selectPlayground.js — playground selection, info panel, and URL hash
// =============================================================================
//
// This is the largest module in the app. It owns three concerns:
//
//   1. SELECTION STATE
//      When a user clicks a playground polygon on the map, selectPlayground()
//      is called. It highlights the polygon, fetches equipment and POI data,
//      and updates the URL hash to #W<osmId> so the view can be bookmarked.
//      Clicking elsewhere calls clearSelection().
//
//   2. INFO PANEL DISPLAY
//      showAttributes(true)  — fills and shows the detail panel with all
//                              information about the selected playground.
//      showAttributes(false) — clears the detail content and either closes
//                              the panel (mobile) or shows the nearby list.
//      showNearbyPlaygrounds() — fills the panel with a list of the 5 nearest
//                                playgrounds to a given lat/lon.
//
//   3. MOBILE BOTTOM SHEET PANEL STATES
//      On mobile the info panel is a bottom sheet with three states:
//
//        hidden  — panel is off-screen (translateY(100%)), no class
//        peek    — panel peeks 108 px from the bottom (.panel-peek)
//                  triggered when a playground is selected
//        open    — panel covers the full screen (.panel-open)
//                  triggered by swiping up or tapping the drag handle
//
//      State transitions are animated via CSS transition on `transform`.
//      During a live drag, inline styles override the CSS classes; once the
//      finger lifts, transitionend cleans up the inline styles and applies
//      the correct class (setPanelOpen / setPanelPeek / clearSelection).
//
//   showAttributes contract:
//      Callers must pass true when showing a specific playground's details,
//      and false when returning to the empty/nearby state. Do not toggle the
//      panel classes directly from outside this module.
//
// =============================================================================

import { Modal, Collapse } from 'bootstrap';
import OpeningHours from 'opening_hours';
import { getArea } from 'ol/sphere.js';
import { transform } from 'ol/proj';
import { Vector as VectorLayer } from 'ol/layer.js';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style';
import Vector from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';

import Select from 'ol/interaction/Select.js';
import { pointerMove } from 'ol/events/condition.js';
import { bbox } from 'ol/loadingstrategy';
import { styleFunction } from '../style/VectorStyles.js';

import map from './map.js';
import { dataPlaygrounds } from './map.js';
import { addFilter, removeFilter } from './filter.js';
import { addShadowLayer, fillShadowMatrix } from './shadow.js';
import { objDevices, objFitnessStation } from './objPlaygroundEquipment.js';
import { objColors } from '../style/VectorStyles.js';

// TODO (GeoServer): hardcoded until GeoServer integration is restored
const geoServer = 'https://osmbln.uber.space/';
const geoServerWorkspace = 'spielplatzkarte';
import { fetchPlaygroundEquipment, fetchNearbyPOIs, fetchTrees } from './api.js';
import { playgroundCompleteness } from './completeness.js';
import { poiRadiusM } from './config.js';
import { panoramaxViewerUrl, panoramaxThumbUrl } from './panoramax.js';
import { getEquipmentAttributesFromProps } from './popup.js';
import { renderReviews } from './reviews.js';
import { t, language } from './i18n.js';

const el = id => document.getElementById(id);
const show = id => { el(id).style.display = ''; };
const hide = id => { el(id).style.display = 'none'; };

export var sourceSelected; // globale Variable, in der der jeweils ausgewählte Spielplatz enthalten ist
var lastSelectedFeature = null; // zuletzt angeklicktes OpenLayers-Feature (für Overpass-Nachfrage)
var currentArea = null; // Fläche des zuletzt ausgewählten Spielplatzes (für Ausstattungsanzeige)
var equipmentLoadGeneration = 0; // Zähler, um veraltete Overpass-Antworten zu verwerfen
var nearbyLoadGeneration = 0;    // Zähler für Umfeld-POIs
var panoramaxUuids = [];         // UUID-Liste für Modal-Navigation
var panoramaxModalIndex = 0;     // aktuell angezeigtes Foto im Modal

var targetZoom;
var nearbyListFeatures = []; // für Klick-Handler der Nähe-Liste
let nearbyClickController = null; // AbortController for nearby-item click delegation
let panoramaxEnlargeController = null; // AbortController for panoramax-preview click
let panoramaxThumbController = null;  // AbortController for panoramax-thumb click

export function showNearbyPlaygrounds(lon, lat, label = t('nearby.thisLocation')) {
    const source = dataPlaygrounds.getSource ? dataPlaygrounds.getSource() : null;
    if (!source) return;
    const features = source.getFeatures();
    if (!features.length) {
        // Overpass still loading — warten bis Daten wirklich da sind
        const retry = () => {
            if (source.getFeatures().length) {
                source.un('change', retry);
                showNearbyPlaygrounds(lon, lat, label);
            }
        };
        source.on('change', retry);
        return;
    }

    const withDist = features.map(f => {
        const ext = f.getGeometry().getExtent();
        const [fLon, fLat] = transform(
            [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2],
            'EPSG:3857', 'EPSG:4326'
        );
        return { feature: f, dist: haversineDistance(lat, lon, fLat, fLon) };
    });

    withDist.sort((a, b) => a.dist - b.dist);
    const nearest = withDist.slice(0, 5);
    nearbyListFeatures = nearest.map(x => x.feature);

    let html = `<div class="nearby-panel">
        <span class="info-label">${t('nearby.title', { label })}</span>`;

    for (let i = 0; i < nearest.length; i++) {
        const { feature, dist } = nearest[i];
        const attr = feature.getProperties();
        const name = getPlaygroundTitle(attr) || t('nearby.defaultName');
        html += `<div class="nearby-item" data-idx="${i}">
            <span class="nearby-name">${name}</span>
            <span class="nearby-dist">${formatDistance(dist)}</span>
        </div>`;
    }

    html += '</div>';
    el('info-more').innerHTML = html;
    el('info-more').style.display = 'block'; // override .info-more-hint { display:none } on mobile
    el('info').classList.add('panel-open');

    if (nearbyClickController) nearbyClickController.abort();
    nearbyClickController = new AbortController();
    el('info-more').addEventListener('click', function(e) {
        const item = e.target.closest('.nearby-item');
        if (!item) return;
        const feature = nearbyListFeatures[parseInt(item.dataset.idx)];
        const ext = feature.getGeometry().getExtent();
        const center = [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2];
        const mapCenter = map.getView().getCenter();
        const res = map.getView().getResolution();
        const distPx = Math.hypot(center[0] - mapCenter[0], center[1] - mapCenter[1]) / res;
        selectPlayground(center, distPx, false, feature);
    }, { signal: nearbyClickController.signal });
}

export function selectPlayground(coord, distance, multiSelect, feature = null) {
    // GeoJSON der selektierten Spielplatzgeometrie erzeugen, um zu dessen Extent zu zoomen und dessen Attribute in der Infobox anzuzeigen
    // TODO multiSelect
    if (feature !== undefined) lastSelectedFeature = feature;
    return getPlaygroundGeom(coord)
    .then((geojson) => {
        if (geojson) {
            // Spielplatzgeometrie in der source-Variable speichern
            sourceSelected = new Vector({
                features: new GeoJSON().readFeatures(geojson, {
                    dataProjection: 'EPSG:4326',
                    featureProjection: 'EPSG:3857'
                }),
            });

            // Spielplatzattribute in der Infobox anzeigen
            showPlaygroundInfo(geojson);

            // Animationsdauer ermittln (abhängig von Entfernung zwischen Klick und Kartenmitte sowie der Differenz der Vorher-Nachher-Zoomstufe)
            // Zoomstufendifferenz ermitteln
            var extent = getSelectionExtent(30);
            var resolution = map.getView().getResolutionForExtent(extent, map.getSize());
            targetZoom = map.getView().getZoomForResolution(resolution);
            var zoomDifference = Math.abs(map.getView().getZoom() - targetZoom);

            // Animationsdauer ermitteln: 0,1 Sek. pro 150 Pixel Entfernung + 0,1 Sek pro Zoomstufe
            var duration = (distance / 150) * 100 + zoomDifference * 100;
            duration = Math.min(Math.max(duration, 0), 3000); // sicherheitshalber Extremwerte abfangen

            // zum Spielplatz zoomen
            // Left padding accounts for the info panel (390px wide, 14px from left) on desktop.
            // On mobile the panel is a bottom sheet, so we pad the bottom instead.
            const isMobile = window.innerWidth <= 768;
            const padding = isMobile
                ? [20, 20, 118, 20]   // peek bar height at bottom
                : [40, 40, 40, 424];  // info panel: 390px width + 14px left offset + 20px margin
            map.getView().fit(extent, {
                duration: duration,
                padding,
                callback: function() {
                    // nach Abschluss der Zoom-Animation Spielplatzgeometrie anzeigen
                    showSelection(getSelectionCenter(), geojson);
                }
            });
            return geojson;
        } else {
            // Wenn nichts ausgewählt wird, Selektion entfernen und Infofenster leeren
            removeSelection(true);
            return false
        }
    });
}

// Spielplatz, Spielgeräte und Spielplatzdetails anzeigen (Aufruf üblicherweise nach dem zu diesem Spielplatz geflogen wurde)
function showSelection(coord, backupGeojson) {
    // Spielplatzgeometrie nochmal neu in aktueller Auflösung erzeugen
    // TODO: Spielplatz nach ID neu laden statt nach Position, da das Ergebnis theoretisch ein anderer Spielplatz sein könnte
    getPlaygroundGeom(coord)
    .then((geojson) => {
        // für den Fall, dass sich im Zentrum des (evtl. schlecht aufgelösten) geojsons gar keine Geometrie findet, die schlecht aufgelöste Vor-Variante zum Zeitpunkt des Klicks anzeigen
        var change = false;
        if (!geojson) {
            geojson = backupGeojson;
            change = true;
        }
        // Spielplatzgeometrie in der Source speichern
        sourceSelected = new Vector({
            features: new GeoJSON().readFeatures(geojson, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            }),
        });
        // bestehende Auswahl entfernen
        removeSelection(false);
        // Spielplatzgeometrie als Selektionsrahmen anzeigen
        showPlaygroundGeometry();
        // Spielgerätelayer anzeigen
        loadEquipmentFromOverpass(expandExtent(sourceSelected.getExtent(), 20));
        // Bäume anzeigen
        loadTreeLayer(expandExtent(sourceSelected.getExtent(), 15));
        // Umfeld-POIs laden
        const ext3857 = sourceSelected.getExtent();
        const [playLon, playLat] = transform(
            [(ext3857[0] + ext3857[2]) / 2, (ext3857[1] + ext3857[3]) / 2],
            'EPSG:3857', 'EPSG:4326'
        );
        loadNearbyPOIs(playLat, playLon, poiRadiusM, geojson.features[0].properties['osm_id']);
        // Schattenlayer anzeigen, falls aktiviert
        if (el('layer-switch-schattigkeit').checked) {
            addShadowLayer();
        }
        // den selektierten Spielplatz aus dem WMS-Layer herausfiltern
        var osm_id = geojson.features[0].properties["osm_id"];
        addFilter("playgrounds", "selection", `osm_id <> ${osm_id}`);
        // Spielplatzattribute erneuern, falls es doch ein anderes geojson sein sollte
        if (change) {
            showPlaygroundInfo(geojson);
        }
    });
}

// Einen Extent um einen Betrag vergrößern
function expandExtent(extent, amount) {
    var minX = extent[0]; var minY = extent[1];
    var maxX = extent[2]; var maxY = extent[3];
    minX -= amount; maxX += amount;
    minY -= amount; maxY += amount;
    return [minX, minY, maxX, maxY];
}

// Feature eines Kartenlayers an einer bestimmten Position als JSON zurückgeben
function getPlaygroundGeom(coord) {
    const feature = lastSelectedFeature;
    if (!feature) return Promise.resolve(false);

    const props = { ...feature.getProperties() };
    delete props.geometry; // OL geometry-Objekt entfernen

    // Fläche aus der Polygongeometrie berechnen (EPSG:3857 → geodätische m²)
    props.area = Math.round(getArea(feature.getGeometry()));
    currentArea = props.area;

    // Polygon-Geometrie aus dem bereits geladenen Feature verwenden (kein zweiter Overpass-Request)
    const olGeom = feature.getGeometry().clone().transform('EPSG:3857', 'EPSG:4326');
    const geojson = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: {
                type: olGeom.getType(),
                coordinates: olGeom.getCoordinates()
            },
            properties: props
        }]
    };
    return Promise.resolve(geojson);
}

// Spielgerätelayer anzeigen
function addEquipmentLayer(extent, typename) {
    var isPoint = false;
    if (typename.includes("_node")) {
        isPoint = true;
    }

    var source = new Vector({
        format: new GeoJSON(),
        url: geoServer + 'geoserver/ows?' +
            'service=WFS&' +
            'version=1.1.0&' +
            'request=GetFeature&' +
            'typename=' + typename + '&' +
            'outputFormat=application/json&' +
            'srsname=EPSG:3857&' +
            'bbox=' + extent.join(',') + ',EPSG:3857',
            strategy: bbox
    });
    var layer = new VectorLayer({
        title: 'Spielplatzausstattung',
        type: 'equipment',
        typename: typename,
        visible: true,
        source: source,
        zIndex: 50,
        style: styleFunctionWrapper("default", isPoint)
    });
    map.addLayer(layer);
    // TODO: Bei move über nodes, die auf Flächen liegen, wird auch die Fläche ausgewählt
    var interaction = new Select({
        condition: pointerMove,
        layers: [layer],
        style: styleFunctionWrapper("select", isPoint)
    });
    map.addInteraction(interaction);
    return layer;
}

// Spielgerätelayer per Overpass laden und anzeigen
async function loadEquipmentFromOverpass(extent) {
    const generation = ++equipmentLoadGeneration;
    const osmId = lastSelectedFeature ? lastSelectedFeature.get('osm_id') : null;
    let geojson;
    try {
        geojson = await fetchPlaygroundEquipment(extent, osmId);
    } catch (e) {
        console.warn('Spielgeräte konnten nicht von Overpass geladen werden:', e);
        return;
    }

    // Veraltete Antwort verwerfen, wenn zwischenzeitlich ein neuerer Load gestartet wurde
    if (generation !== equipmentLoadGeneration) return;

    const format = new GeoJSON();
    const projOpts = { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' };

    const polyFeatures = geojson.features.filter(f => f.geometry.type !== 'Point');
    const pointFeatures = geojson.features.filter(f => f.geometry.type === 'Point');

    if (polyFeatures.length) {
        const polyLayer = new VectorLayer({
            title: 'Spielplatzausstattung',
            type: 'equipment',
            visible: true,
            source: new Vector({
                features: format.readFeatures({ type: 'FeatureCollection', features: polyFeatures }, projOpts)
            }),
            zIndex: 50,
            style: styleFunctionWrapper('default', false)
        });
        map.addLayer(polyLayer);
        map.addInteraction(new Select({
            condition: pointerMove,
            layers: [polyLayer],
            style: styleFunctionWrapper('select', false)
        }));
    }

    if (pointFeatures.length) {
        const pointLayer = new VectorLayer({
            title: 'Spielplatzausstattung',
            type: 'equipment',
            visible: true,
            source: new Vector({
                features: format.readFeatures({ type: 'FeatureCollection', features: pointFeatures }, projOpts)
            }),
            zIndex: 51,
            style: styleFunctionWrapper('default', true)
        });
        map.addLayer(pointLayer);
        map.addInteraction(new Select({
            condition: pointerMove,
            layers: [pointLayer],
            style: styleFunctionWrapper('select', true)
        }));
    }

    const attr = lastSelectedFeature ? lastSelectedFeature.getProperties() : {};
    updateEquipmentPanel(geojson.features, attr);
}

async function loadTreeLayer(extent) {
    let geojson;
    try {
        geojson = await fetchTrees(extent);
    } catch (e) {
        console.warn('Bäume konnten nicht geladen werden:', e);
        return;
    }
    if (!geojson.features.length) return;

    const treeStyle = new Style({
        image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color: 'rgba(34, 139, 34, 0.5)' }),
            stroke: new Stroke({ color: '#155215', width: 1 })
        })
    });

    const treeLayer = new VectorLayer({
        title: 'Bäume',
        type: 'trees',
        visible: true,
        source: new Vector({
            features: new GeoJSON().readFeatures(geojson, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            })
        }),
        zIndex: 45,
        style: treeStyle
    });
    map.addLayer(treeLayer);
}

// Ausstattungsinfo im Infofenster aus Overpass-Daten befüllen
function updateEquipmentPanel(features, playgroundAttr = {}) {
    // playground=yes ist ein generisches Tag ohne konkreten Gerätetyp — ignorieren
    const deviceFeatures = features.filter(f => f.properties.playground && f.properties.playground !== 'yes');
    const deviceCount = deviceFeatures.length;
    const benchCount = features.filter(f => f.properties.amenity === 'bench').length;
    const shelterCount = features.filter(f => f.properties.amenity === 'shelter').length;
    const picnicCount = features.filter(f => f.properties.leisure === 'picnic_table').length;
    const fitnessCount = features.filter(f => f.properties.leisure === 'fitness_station').length;

    // Sportfeldnamen nach sport=* — Singular und Plural
    const pitchLabels = {
        soccer:          ['Bolzplatz',               'Bolzplätze'],
        basketball:      ['Basketballfeld',           'Basketballfelder'],
        table_tennis:    ['Tischtennisplatte',        'Tischtennisplatten'],
        volleyball:      ['Volleyballfeld',           'Volleyballfelder'],
        tennis:          ['Tennisfeld',               'Tennisfelder'],
        handball:        ['Handballfeld',             'Handballfelder'],
        badminton:       ['Badmintonfeld',            'Badmintonfelder'],
        hockey:          ['Hockeyfeld',               'Hockeyfelder'],
        field_hockey:    ['Hockeyfeld',               'Hockeyfelder'],
        boules:          ['Boulesbahn',               'Boulesanlagen'],
        petanque:        ['Pétanquebahn',             'Pétanqueanlagen'],
        bocce:           ['Bocciabahn',               'Bocciabahnen'],
        multi:           ['Mehrzweckspielfeld',       'Mehrzweckspielfelder'],
        athletics:       ['Leichtathletikanlage',     'Leichtathletikanlagen'],
        skateboard:      ['Skatepark',                'Skateparks'],
        bmx:             ['BMX-Bahn',                 'BMX-Bahnen'],
        climbing:        ['Kletteranlage',            'Kletteranlagen'],
        beachvolleyball: ['Beachvolleyballfeld',      'Beachvolleyballfelder'],
        fitness:         ['Fitnessbereich',           'Fitnessbereiche'],
        archery:         ['Bogenschießanlage',        'Bogenschießanlagen'],
        cycling:         ['Radsportanlage',           'Radsportanlagen'],
        running:         ['Laufbahn',                 'Laufbahnen'],
        gymnastics:      ['Turnanlage',               'Turnanlagen'],
        chess:           ['Schachfeld',               'Schachfelder'],
        nine_mens_morris:['Mühlespielfeld',           'Mühlespielfelder'],
    };

    const pitchFeatures = features.filter(f => f.properties.leisure === 'pitch');

    let equipment_str = '<ul>';
    if (deviceCount)  equipment_str += `<li>${t('equipment.devices',  { count: deviceCount  })}</li>`;
    if (fitnessCount) equipment_str += `<li>${t('equipment.fitness',  { count: fitnessCount })}</li>`;
    if (benchCount)   equipment_str += `<li>${t('equipment.benches',  { count: benchCount   })}</li>`;
    if (shelterCount) equipment_str += `<li>${t('equipment.shelters', { count: shelterCount })}</li>`;
    if (picnicCount)  equipment_str += `<li>${t('equipment.picnic',   { count: picnicCount  })}</li>`;
    equipment_str += '</ul>';
    el('info-equipment').innerHTML = equipment_str;

    el('info-device-note').innerHTML = ''; // no longer used; cleared for safety

    // Einzelne Spielgeräte auflisten — jedes als aufklappbares Element mit Details
    let device_string = '<ul class="mb-0 device-list">';
    for (const f of deviceFeatures) {
        const key = f.properties.playground;
        const name = objDevices[key]?.name_de ?? key;
        const category = objDevices[key]?.category ?? 'fallback';
        const color = objColors[category] ?? objColors['fallback'];
        const detail = getEquipmentAttributesFromProps(f.properties);
        const uid = `dev-${f.properties.osm_id ?? Math.random().toString(36).slice(2)}`;
        if (detail) {
            device_string += `<li>` +
                `<div class="device-toggle" data-bs-toggle="collapse" data-bs-target="#${uid}" role="button">` +
                `<span style="color:${color}">●</span> ${name}` +
                ` <span class="bi bi-chevron-down device-chevron"></span></div>` +
                `<div id="${uid}" class="collapse device-detail">${detail}</div></li>`;
        } else {
            device_string += `<li><span style="color:${color}">●</span> ${name}</li>`;
        }
    }
    // Fitnessgeräte (leisure=fitness_station) einzeln auflisten
    const fitnessColor = objColors['activity'] ?? objColors['fallback'];
    for (const f of features.filter(f => f.properties.leisure === 'fitness_station')) {
        const fsType = f.properties.fitness_station;
        const name = (fsType && fsType in objFitnessStation) ? objFitnessStation[fsType] : t('equipment.fitnessDefault');
        const detail = getEquipmentAttributesFromProps(f.properties);
        const uid = `dev-${f.properties.osm_id ?? Math.random().toString(36).slice(2)}`;
        if (detail) {
            device_string += `<li>` +
                `<div class="device-toggle" data-bs-toggle="collapse" data-bs-target="#${uid}" role="button">` +
                `<span style="color:${fitnessColor}">●</span> ${name}` +
                ` <span class="bi bi-chevron-down device-chevron"></span></div>` +
                `<div id="${uid}" class="collapse device-detail">${detail}</div></li>`;
        } else {
            device_string += `<li><span style="color:${fitnessColor}">●</span> ${name}</li>`;
        }
    }
    // Sportfelder (pitches) einzeln auflisten — jedes als aufklappbares Element mit Details
    const pitchColor = objColors['fallback'];
    for (const f of pitchFeatures) {
        const sport = f.properties.sport ?? '';
        const [singular] = pitchLabels[sport]
            ?? (sport ? [`Sportfeld (${sport})`, `Sportfelder (${sport})`] : ['Sportfeld', 'Sportfelder']);
        const detail = getEquipmentAttributesFromProps(f.properties);
        const uid = `dev-${f.properties.osm_id ?? Math.random().toString(36).slice(2)}`;
        if (detail) {
            device_string += `<li>` +
                `<div class="device-toggle" data-bs-toggle="collapse" data-bs-target="#${uid}" role="button">` +
                `<span style="color:${pitchColor}">●</span> ${singular}` +
                ` <span class="bi bi-chevron-down device-chevron"></span></div>` +
                `<div id="${uid}" class="collapse device-detail">${detail}</div></li>`;
        } else {
            device_string += `<li><span style="color:${pitchColor}">●</span> ${singular}</li>`;
        }
    }
    device_string += '</ul>';

    // Fallback: playground:<key>=<count|yes> Tags am Spielplatz-Polygon selbst auswerten,
    // falls keine einzelnen Objekte erfasst wurden
    if (!deviceFeatures.length) {
        const fallbackCounts = {};
        for (const [tag, val] of Object.entries(playgroundAttr)) {
            if (!tag.startsWith('playground:')) continue;
            const key = tag.replace('playground:', '');
            const count = parseInt(val) || (val === 'yes' ? 1 : 0);
            if (count > 0) fallbackCounts[key] = count;
        }
        if (Object.keys(fallbackCounts).length > 0) {
            let fallback_string = '<ul class="mb-0">';
            for (const [key, count] of Object.entries(fallbackCounts)) {
                const name = objDevices[key]?.name_de ?? key;
                const category = objDevices[key]?.category ?? 'fallback';
                const color = objColors[category] ?? objColors['fallback'];
                const countStr = count > 1 ? `${count}× ` : '';
                fallback_string += `<li><span style="color:${color}">●</span> ${countStr}${name}</li>`;
            }
            fallback_string += '</ul>';
            el('info-device-list').innerHTML = fallback_string;
        } else {
            el('info-device-list').innerHTML = '';
        }
    } else {
        el('info-device-list').innerHTML = device_string;
    }

    // "Hilf mit"-Hinweis — nur wenn keine separat gemappten Geräte vorhanden
    if (!deviceFeatures.length) {
        el('info-device-list').insertAdjacentHTML('beforeend',
            `<p class="text-muted mt-2 mb-0" style="font-size:smaller">${t('equipment.addHint')}</p>`
        );
    }

    // MapComplete-Link zum Hinzufügen von Spielgeräten
    const extent = lastSelectedFeature ? lastSelectedFeature.getGeometry().getExtent() : null;
    if (extent) {
        const [lon, lat] = transform(
            [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2],
            'EPSG:3857', 'EPSG:4326'
        );
        const mapcompleteUrl = `https://mapcomplete.org/playgrounds.html?z=19&lat=${lat.toFixed(7)}&lon=${lon.toFixed(7)}#new_point_dialog_0`;
        el('info-device-list').insertAdjacentHTML('beforeend',
            `<div class="mt-1"><a href="${mapcompleteUrl}" target="_blank" rel="noopener" class="mc-add-link"><span class="bi bi-plus-circle"></span> ${t('equipment.addLink')}</a></div>`
        );
    }
}

// Panoramax-Fotos aus OSM-Tags des Spielplatzes anzeigen
// Tags: panoramax=<uuid>, panoramax:0=<uuid>, panoramax:1=<uuid>, …
function showPanoramaxFromTags(attr) {
    const uuids = [];
    if (attr['panoramax']) uuids.push(attr['panoramax']);
    for (let i = 0; i <= 9; i++) {
        const val = attr[`panoramax:${i}`];
        if (val) uuids.push(val);
    }

    const osmTypeMap = { W: 'way', R: 'relation', N: 'node' };
    const osmType = osmTypeMap[attr['osm_type']] ?? 'way';
    const osmId = attr['osm_id'];
    const mapcompletePhotoUrl = `https://mapcomplete.org/playgrounds.html#${osmType}/${osmId}`;
    const addPhotoLink = `<a href="${mapcompletePhotoUrl}" target="_blank" rel="noopener" class="mc-add-link"><span class="bi bi-camera"></span> ${t('photos.addLink')}</a>`;

    if (!uuids.length) {
        el('info-panoramax').innerHTML =
            `<div class="text-center py-2">` +
            `<span class="bi bi-camera" style="font-size:1.8rem; color:#d1d5db;"></span>` +
            `<p class="text-muted mt-1 mb-2" style="font-size:smaller;">${t('photos.none')}</p>` +
            addPhotoLink +
            `</div>`;
        return;
    }

    // Inline-Viewer mit klickbarem Overlay für Vollbild
    let html = `<div style="position:relative; cursor:pointer;" id="panoramax-preview" data-uuid="${uuids[0]}" title="${t('photos.enlarge')}">
        <iframe id="panoramax-iframe"
            src="${panoramaxViewerUrl(uuids[0])}"
            style="width:100%; height:260px; border:none; border-radius:4px; pointer-events:none;"
            allowfullscreen></iframe>
        <div style="position:absolute; inset:0; z-index:1; border-radius:4px;"></div>
        <span class="bi bi-fullscreen" style="position:absolute; bottom:8px; right:8px; z-index:2; background:rgba(255,255,255,0.8); border-radius:3px; padding:4px 5px; font-size:13px; pointer-events:none;"></span>
    </div>`;

    // Thumbnail-Leiste bei mehreren Fotos
    if (uuids.length > 1) {
        html += '<div class="d-flex gap-1 mt-1 flex-wrap">';
        for (let i = 0; i < uuids.length; i++) {
            const opacity = i === 0 ? '1' : '0.55';
            html += `<img src="${panoramaxThumbUrl(uuids[i])}"
                data-uuid="${uuids[i]}"
                class="panoramax-thumb"
                alt="${t('photos.thumbnail', { n: i + 1 })}"
                style="height:52px; width:72px; border-radius:3px; cursor:pointer; object-fit:cover; opacity:${opacity};">`;
        }
        html += '</div>';
    }

    html += `<p class="mt-1 mb-0">${addPhotoLink}</p>`;
    el('info-panoramax').innerHTML = html;

    // Klick auf Vorschau öffnet Modal
    if (panoramaxEnlargeController) panoramaxEnlargeController.abort();
    panoramaxEnlargeController = new AbortController();
    el('info-panoramax').addEventListener('click', function(e) {
        const preview = e.target.closest('#panoramax-preview');
        if (!preview) return;
        const uuid = preview.dataset.uuid;
        panoramaxUuids = uuids;
        panoramaxModalIndex = uuids.indexOf(uuid);
        openPanoramaxModal(panoramaxModalIndex);
    }, { signal: panoramaxEnlargeController.signal });

    // Thumbnail-Klick wechselt Vorschau-UUID und iframe
    if (panoramaxThumbController) panoramaxThumbController.abort();
    panoramaxThumbController = new AbortController();
    el('info-panoramax').addEventListener('click', function(e) {
        const thumb = e.target.closest('.panoramax-thumb');
        if (!thumb) return;
        const uuid = thumb.dataset.uuid;
        el('panoramax-iframe').src = panoramaxViewerUrl(uuid);
        el('panoramax-preview').dataset.uuid = uuid;
        document.querySelectorAll('.panoramax-thumb').forEach(thumb => { thumb.style.opacity = '0.55'; });
        thumb.style.opacity = '1';
    }, { signal: panoramaxThumbController.signal });
}

// Nahegelegene POIs laden und im Umfeld-Panel anzeigen
async function loadNearbyPOIs(lat, lon, radiusM, osmId) {
    const generation = ++nearbyLoadGeneration;
    let pois;
    try {
        pois = await fetchNearbyPOIs(lat, lon, radiusM, osmId);
    } catch (e) {
        console.warn('Umfeld-Daten konnten nicht geladen werden:', e);
        if (generation !== nearbyLoadGeneration) return;
        el('info-umfeld').innerHTML = `<small class="text-muted"><i>${t('poi.errorLoad')}</i></small>`;
        return;
    }
    if (generation !== nearbyLoadGeneration) return;
    updateUmfeldPanel(pois, lat, lon);
}

const POI_CATEGORIES = [
    {
        icon: '🚻', get label() { return t('poi.categories.toilets'); },
        match: f => f.amenity === 'toilets',
        get fallback() { return t('poi.fallbacks.toilets'); }
    },
    {
        icon: '🚌', get label() { return t('poi.categories.busStops'); },
        match: f => f.highway === 'bus_stop',
        get fallback() { return t('poi.fallbacks.busStops'); },
        hint: (poi, playLat, playLon) => poi.tags.towards
            ? `→ ${poi.tags.towards}`
            : bearingToDir(bearingDeg(playLat, playLon, poi.lat, poi.lon))
    },
    {
        icon: '🍦', get label() { return t('poi.categories.iceCream'); },
        match: f => f.amenity === 'ice_cream' || (f.cuisine && f.cuisine.includes('ice_cream')),
        get fallback() { return t('poi.fallbacks.iceCream'); }
    },
    {
        icon: '🛒', get label() { return t('poi.categories.shopping'); },
        match: f => f.shop === 'supermarket' || f.shop === 'convenience',
        get fallback() { return t('poi.fallbacks.shopping'); }
    },
    {
        icon: '🧴', get label() { return t('poi.categories.drugstore'); },
        match: f => f.shop === 'chemist',
        get fallback() { return t('poi.fallbacks.drugstore'); }
    },
    {
        icon: '🏥', get label() { return t('poi.categories.emergency'); },
        match: f => f.emergency === 'yes' || f['healthcare:speciality'] === 'emergency',
        get fallback() { return t('poi.fallbacks.emergency'); }
    }
];

function formatOpeningHours(ohStr) {
    const fmt = date => date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' });

    // Returns a human-readable day label for a future date.
    const dayLabel = (d, now) => {
        const diffDays = Math.round((d - now) / 86400000);
        if (d.toDateString() === now.toDateString()) return t('poi.today');
        const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
        if (d.toDateString() === tomorrow.toDateString()) return t('poi.tomorrow');
        if (diffDays <= 6) return d.toLocaleDateString(language, { weekday: 'long' });
        return d.toLocaleDateString(language, { weekday: 'short', day: '2-digit', month: '2-digit' });
    };

    try {
        const oh = new OpeningHours(ohStr, { address: { country_code: 'de' } });
        const now = new Date();
        const isOpen = oh.getState(now);
        const nextChange = oh.getNextChange(now);

        let statusHtml;
        if (ohStr.trim() === '24/7') {
            statusHtml = `<span style="color:#16a34a;">● ${t('poi.alwaysOpen')}</span>`;
        } else if (isOpen) {
            const label = nextChange
                ? t('poi.openUntil', { time: fmt(nextChange) })
                : t('poi.open');
            statusHtml = `<span style="color:#16a34a;">● ${label}</span>`;
        } else {
            if (nextChange) {
                statusHtml = `<span style="color:#dc2626;">● ${t('poi.closed')}</span> · ${t('poi.opensAt', { day: dayLabel(nextChange, now), time: fmt(nextChange) })}`;
            } else {
                statusHtml = `<span style="color:#dc2626;">● ${t('poi.closed')}</span>`;
            }
        }

        return `<span class="info-label">${t('poi.openingHours')}</span> ${statusHtml}`;
    } catch {
        // Fallback für unbekannte Formate
        return `<span class="info-label">${t('poi.openingHours')}</span> <code style="font-size:smaller;">${ohStr}</code>`;
    }
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(m) {
    if (m < 1000) return `~${Math.round(m / 10) * 10} m`;
    const km = (m / 1000).toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `~${km} km`;
}

function bearingDeg(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function bearingToDir(deg) {
    return ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}

function updateUmfeldPanel(pois, playLat, playLon) {
    const poisWithDist = pois.map(p => ({ ...p, dist: haversineDistance(playLat, playLon, p.lat, p.lon) }));

    let html = '';
    for (const cat of POI_CATEGORIES) {
        const seen = new Set();
        const matches = poisWithDist
            .filter(p => cat.match(p.tags))
            .sort((a, b) => a.dist - b.dist)
            .filter(p => {
                const key = (p.tags.name || cat.fallback).toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 2);
        if (!matches.length) continue;

        html += `<div class="mb-2"><small class="text-muted fw-bold text-uppercase" style="font-size:0.7rem;">${cat.icon} ${cat.label}</small>`;
        for (const poi of matches) {
            const name = poi.tags.name || cat.fallback;
            const hint = cat.hint ? `<span class="text-muted ms-1" style="font-size:0.7rem;">(${cat.hint(poi, playLat, playLon)})</span>` : '';
            const geoUrl = `geo:${poi.lat},${poi.lon}?q=${poi.lat},${poi.lon}(${encodeURIComponent(name)})`;
            const osmUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${playLat},${playLon};${poi.lat},${poi.lon}`;
            html += `<div class="d-flex justify-content-between align-items-baseline mt-1">
                <span style="font-size:smaller;">${name}${hint}</span>
                <span class="ms-2 text-nowrap">
                    <a href="${geoUrl}" class="text-muted text-decoration-none" style="font-size:smaller;" title="In Navigations-App öffnen">${formatDistance(poi.dist)} ↗</a>
                    <a href="${osmUrl}" target="_blank" rel="noopener" class="text-muted text-decoration-none ms-1" style="font-size:smaller;" title="Im Browser navigieren">🗺</a>
                </span>
            </div>`;
        }
        html += '</div>';
    }

    el('info-umfeld').innerHTML = html ||
        `<small class="text-muted">Keine nahegelegenen Einrichtungen im Umkreis von ${(poiRadiusM / 1000).toFixed(0)} km gefunden.</small>`;
}

// Panoramax-Modal mit einem bestimmten Foto-Index öffnen / aktualisieren
function openPanoramaxModal(index) {
    panoramaxModalIndex = ((index % panoramaxUuids.length) + panoramaxUuids.length) % panoramaxUuids.length;
    const uuid = panoramaxUuids[panoramaxModalIndex];
    el('panoramax-modal-iframe').src = panoramaxViewerUrl(uuid);
    const multiPhoto = panoramaxUuids.length > 1;
    el('panoramax-modal-counter').textContent =
        multiPhoto ? `${panoramaxModalIndex + 1} / ${panoramaxUuids.length}` : '';
    el('panoramax-modal-prev').style.display = multiPhoto ? '' : 'none';
    el('panoramax-modal-next').style.display = multiPhoto ? '' : 'none';
    Modal.getOrCreateInstance('#modalPanoramax').show();
}

el('panoramax-modal-prev').addEventListener('click', () => openPanoramaxModal(panoramaxModalIndex - 1));
el('panoramax-modal-next').addEventListener('click', () => openPanoramaxModal(panoramaxModalIndex + 1));

document.addEventListener('keydown', function(e) {
    if (!el('modalPanoramax').classList.contains('show')) return;
    if (e.key === 'ArrowLeft')  openPanoramaxModal(panoramaxModalIndex - 1);
    if (e.key === 'ArrowRight') openPanoramaxModal(panoramaxModalIndex + 1);
});

// das bei der Interaktion übergebene Feature mit an die Style-Funktion übergeben
var styleFunctionWrapper = function(mode, isPoint) {
    return function(feature) {
        return styleFunction(feature, mode, isPoint);
    };
};

// Auswahl aufheben, wenn herausgezoomt wird
export function checkZoomDeselection() {
    // zunächst Spielgerätelayer ausblenden, wenn etwas herausgezoomt wird
    if (sourceSelected && map.getView().getZoom() < targetZoom - 2) {
        removeSelection(true);
        // TODO Popup entfernen, falls es eins geben sollte, und Mauszeiger zurücksetzen
    }
}

// Spielplatz abwählen (z. B. per ESC) und URL-Hash leeren
export function clearSelection() {
    removeSelection(true);
    history.replaceState(null, '', window.location.pathname + window.location.search);
}

// Spielplatzauswahl aufheben und seine Attribute im Infofenster ausblenden
function removeSelection(clearSource) {
    removeLayer('equipment');
    removeLayer('trees');
    removeLayer('shadow');
    removeLayer('selection');
    removeFilter("playgrounds", 'selection');
    if (clearSource) {
        showAttributes(false);
        sourceSelected = null;
    }
}

export function removeLayer(type) {
    var selectionLayers = map.getLayers().getArray().filter(layer => (layer.getProperties()["type"] == type));
    selectionLayers.forEach(layer => {
        map.removeLayer(layer)
    });
}

// Mittelpunkt des ausgewählten Spielplatzes abfragen
function getSelectionCenter() {
    if (sourceSelected) {
        var extent = sourceSelected.getExtent()
        var center_x = extent[0] + (extent[2] - extent[0]) / 2
        var center_y = extent[1] + (extent[3] - extent[1]) / 2
        return [center_x, center_y];
    } else {
        return false;
    }
}

// Ausdehnung des ausgewählten Spielplatzes abfragen
export function getSelectionExtent(padding) {
    if (sourceSelected) {
        var extent = sourceSelected.getExtent();

        // als Parameter kann ein Wert in Metern übergeben werden, der um die Spielplatzgeometrie herum zum Kartenrand den Extent vergrößert
        // (um die Auswahl mittig zu halten/nicht die ganze Karte auszufüllen)
        if (padding) {
            extent = [extent[0] - padding, extent[1] - padding, extent[2] + padding, extent[3] + padding];
        }
        return extent;
    } else {
        return false;
    }
}

// angeklickten Spielplatz in der Karte sichtbar machen
var layerSelectedPlayground = null;
function showPlaygroundGeometry() {
    const style = [
        new Style({ stroke: new Stroke({ color: 'rgba(237, 112, 20, 0.15)', width: 24 }) }),
        new Style({ stroke: new Stroke({ color: 'rgba(237, 112, 20, 0.35)', width: 14 }) }),
        new Style({ stroke: new Stroke({ color: 'rgba(237, 112, 20, 0.85)', width: 3 }) }),
        new Style({ fill: new Fill({ color: 'rgba(237, 112, 20, 0.1)' }) }),
    ];

    layerSelectedPlayground = new VectorLayer({
        title: 'Ausgewählter Spielplatz',
        type: 'selection',
        visible: true,
        source: sourceSelected,
        zIndex: 40,
        style: style
    });
    map.addLayer(layerSelectedPlayground);
}

export function getSelectedPlaygroundSource() {
    return sourceSelected;
}

function showPlaygroundInfo(json) {
    if (!json) {
        showAttributes(false);
        return false;
    }

    // Attribute in der Spielplatzinfo anzeigen
    var attr = json.features[0].properties;
    //console.log(attr);

    // Attribut-Elemente sichtbar machen und zu Beginn immer Ausstattung aufklappen
    showAttributes(true);

    // Permalink: URL-Hash auf diesen Spielplatz setzen
    if (attr.osm_id) history.replaceState(null, '', `#${attr.osm_type ?? 'W'}${attr.osm_id}`);

    Collapse.getOrCreateInstance(document.getElementById('accordion-panoramax')).show();
    Collapse.getOrCreateInstance(document.getElementById('accordion-ausstattung')).show();
    Collapse.getOrCreateInstance(document.getElementById('accordion-umfeld')).show();
    Collapse.getOrCreateInstance(document.getElementById('accordion-reviews')).show();

    // Datenvollständigkeit — Badge
    {
        const c = playgroundCompleteness(attr);
        let cls, label;
        if (c === 'complete') {
            cls = 'completeness-badge--complete'; label = 'Daten vollständig';
        } else if (c === 'partial') {
            cls = 'completeness-badge--partial';  label = 'Daten teilweise erfasst';
        } else {
            cls = 'completeness-badge--missing';  label = 'Daten fehlen';
        }
        const badge = el('info-completeness-badge');
        badge.classList.remove('completeness-badge--complete', 'completeness-badge--partial', 'completeness-badge--missing');
        badge.classList.add(cls);
        badge.textContent = label;
    }

    // Spielplatzname (aus verschiedenen Attributen zusammengesetzt)
    var playgroundName = getPlaygroundTitle(attr);
    el('info-name').textContent = playgroundName;

    // Lagebeschreibung
    var location_str = getPlaygroundLocation(attr);
    el('info-location').innerHTML = `<i>${location_str}</i>`;

    // Beschreibung / Bemerkungen
    var description = attr["description"];
    var description_de = attr["description:de"];
    var note = attr["note"];
    var fixme = attr["fixme"];
    var playgroundDescription = "";
    if (description_de) {
        if (!description) {
            playgroundDescription = description_de;
        } else if (description != description_de) {
            playgroundDescription = description + ' | ' + description_de;
        }
    } else if (description) {
        playgroundDescription = description;
    }
    if (note) {
        if (playgroundDescription) { playgroundDescription += "<br>"; }
        playgroundDescription += `<span class="bi bi-pencil-square"> ${note}`
    }
    if (fixme) {
        if (playgroundDescription) { playgroundDescription += "<br>"; }
        playgroundDescription += `<span class="bi bi-tools"> ${fixme}`
    }
    if (playgroundDescription) {
        playgroundDescription = `<i>${playgroundDescription}</i>`
    }
    el('info-description').innerHTML = playgroundDescription;

    // Größe (m², gerundet auf 10m²)
    var area = attr["area"];
    var playgroundArea;
    if (area) {
        playgroundArea = `<span class="info-label">Größe</span> ${Math.round(area / 10) * 10}m²`;
    } else {
        playgroundArea = '<span class="info-label">Größe</span> unbekannt';
    }
    el('info-area').innerHTML = playgroundArea;

    // Bodenbelag
    const surfaceLabels = {
        sand: 'Sand', grass: 'Rasen', wood_chips: 'Holzschnitzel',
        bark_mulch: 'Rindenmulch', rubber: 'Gummigranulat',
        asphalt: 'Asphalt', concrete: 'Beton', paving_stones: 'Pflastersteine',
        tartan: 'Tartan', artificial_turf: 'Kunstgras',
        gravel: 'Kies', fine_gravel: 'Feinkies', dirt: 'Erde', compacted: 'verdichtet',
    };
    var surface = attr["surface"];
    if (surface) {
        const surfaceLabel = surfaceLabels[surface] ?? surface;
        el('info-surface').innerHTML = `<span class="info-label">Bodenbelag</span> ${surfaceLabel}`;
        show('info-surface');
    } else {
        hide('info-surface');
    }

    // Bäume (innerhalb + 15 m Puffer, aus PostGIS)
    const treeCount = attr["tree_count"];
    if (treeCount > 0) {
        el('info-trees').innerHTML = `<span class="info-label">Bäume mind.</span> ${treeCount}`;
        show('info-trees');
    } else {
        hide('info-trees');
    }

    // Zugänglichkeit
    var access = attr["access"];
    var priv = attr["private"];
    var accessDict = {
        yes: "öffentlich",
        private: "privat",
        customers: "nur für Gäste",
        no: "nicht zugänglich",
        permissive: "öffentlich geduldet",
        destination: "nur für Anlieger",
        residents: "nur für Anwohnende",
    };
    var privateDict = {
        residents: "nur für Anwohnende",
        students: "nur für Schule",
        employees: "nur für Mitarbeitende"
    };
    var playgroundAccess = "unbekannt";
    if (access in accessDict) {
        playgroundAccess = accessDict[access];
    }
    playgroundAccess = `<span class="info-label">Zugänglichkeit</span> ${playgroundAccess}`;
    if (priv in privateDict) {
        playgroundAccess = `<span class="info-label">Zugänglichkeit</span> ${privateDict[priv]}`;
    }
    el('info-access').innerHTML = playgroundAccess;

    // Altersbeschränkung
    var minAge = attr["min_age"];
    var maxAge = attr["max_age"];
    if (minAge || maxAge) {
        var ageStr = minAge && maxAge ? `${minAge}–${maxAge} Jahre`
                   : minAge ? `ab ${minAge} Jahren`
                   : `bis ${maxAge} Jahre`;
        el('info-age').innerHTML = `<span class="info-label">Alter</span> ${ageStr}`;
        show('info-age');
    } else {
        hide('info-age');
    }

    // Betreiber — operator:wikidata hat Vorrang als Link-Ziel; operator als Anzeigetext
    var operator = attr["operator"];
    var operatorWikidata = attr["operator:wikidata"];
    if (operatorWikidata) {
        const wikidataUrl = `https://www.wikidata.org/wiki/${operatorWikidata}`;
        if (operator) {
            el('info-operator').innerHTML =
                `<span class="info-label">Betreiber</span> <a href="${wikidataUrl}" target="_blank" rel="noopener" class="link-secondary">${operator}</a>`;
            show('info-operator');
        } else {
            // Zeige Q-Nummer als Platzhalter, bis der Name von Wikidata geladen ist
            el('info-operator').innerHTML =
                `<span class="info-label">Betreiber</span> <a href="${wikidataUrl}" target="_blank" rel="noopener" class="link-secondary" id="operator-wikidata-label">${operatorWikidata}</a>`;
            show('info-operator');
            fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(operatorWikidata)}&props=labels&languages=de%7Cen&format=json&origin=*`)
                .then(r => r.json())
                .then(data => {
                    const entity = data.entities?.[operatorWikidata];
                    const label = entity?.labels?.de?.value ?? entity?.labels?.en?.value;
                    const labelEl = document.getElementById('operator-wikidata-label');
                    if (label && labelEl) labelEl.textContent = label;
                })
                .catch(() => { /* Platzhalter (Q-Nummer) bleibt stehen */ });
        }
    } else if (operator) {
        el('info-operator').innerHTML = `<span class="info-label">Betreiber</span> ${operator}`;
        show('info-operator');
    } else {
        hide('info-operator');
    }

    // Öffnungszeiten
    var openingHours = attr["opening_hours"];
    if (openingHours) {
        el('info-opening-hours').innerHTML = formatOpeningHours(openingHours);
        show('info-opening-hours');
    } else {
        hide('info-opening-hours');
    }

    // Kontakt (E-Mail und Telefon) + MapComplete-Link
    var email = attr["contact:email"] || attr["email"];
    var phone = attr["contact:phone"] || attr["phone"];
    const mcOsmType = ({ W: 'way', R: 'relation', N: 'node' })[attr['osm_type']] ?? 'way';
    const mcOsmId = attr['osm_id'];
    const mcUrl = `https://mapcomplete.org/playgrounds.html#${mcOsmType}/${mcOsmId}`;
    var contactParts = [];
    if (phone) contactParts.push(`<a href="tel:${phone}" class="link-secondary">${phone}</a>`);
    if (email) contactParts.push(`<a href="mailto:${email}" class="link-secondary">${email}</a>`);
    const mcLink = `<div class="mt-1"><a href="${mcUrl}" target="_blank" rel="noopener" class="mc-add-link"><span class="bi bi-pencil"></span> Bei MapComplete bearbeiten</a></div>`;
    el('info-contact').innerHTML = (contactParts.length ? contactParts.join(' · ') : '') + mcLink;
    show('info-contact');

    // Spielgeräte: werden async per Overpass geladen (updateEquipmentPanel befüllt das nach dem Laden)
    el('info-equipment').innerHTML = '<ul><li><i>Wird geladen …</i></li></ul>';
    el('info-device-note').innerHTML = '';
    el('info-device-list').innerHTML = '';
    // Umfeld: wird async per Overpass geladen
    el('info-umfeld').innerHTML = '<small class="text-muted"><i>Wird geladen …</i></small>';

    // Straßenfotos aus Panoramax-Tags des OSM-Objekts
    showPanoramaxFromTags(attr);

    // Bewertungen (Mangrove.reviews)
    {
        const extent = lastSelectedFeature ? lastSelectedFeature.getGeometry().getExtent() : null;
        if (extent) {
            const [revLon, revLat] = transform(
                [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2],
                'EPSG:3857', 'EPSG:4326'
            );
            renderReviews(revLat, revLon);
        }
    }

    // Schattigkeit
    fillShadowMatrix(attr);

    // Link zum OSM-Objekt
    var osm_id = attr["osm_id"];
    var osm_type = attr["osm_type"];
    var url;
    var typeDict = {
        N: "node",
        W: "way",
        R: "relation"
    };
    if (osm_type in typeDict) {
        osm_type = typeDict[osm_type];
        url = `https://www.openstreetmap.org/${osm_type}/${osm_id}`;
        el('info-osm-url').href = url;
    } else {
        hide('info-osm-url');
    }
}

// Spielplatzname (bei Bedarf alternative Namen in Klammern ergänzen)
export function getPlaygroundTitle(attr) {
    var name = attr["name"];
    var alt_name = attr["alt_name"];
    var loc_name = attr["loc_name"];
    var official_name = attr["official_name"];
    var old_name = attr["old_name"];
    var short_name = attr["short_name"];

    var playgroundName = 'Spielplatz';
    var nameCount = 0;
    for (const n of [name, alt_name, loc_name, official_name, old_name, short_name]) {
        if (n) {
            if (!nameCount) {
                    playgroundName = n;
                } else if (nameCount == 1) {
                    playgroundName += ` (${n}`;
                } else {
                    playgroundName += `, ${n}`;
                }
            nameCount ++;
        }
    }
    if (nameCount > 1) {
        playgroundName += ")";
    }

    return playgroundName;
}

// Lagebeschreibung
export function getPlaygroundLocation(attr) {
    var site = attr["in_site"];
    var location_str = '';
    if (site) {
        location_str = site;
    } else {
        var highway = attr["nearest_highway"];
        if (!highway) return location_str;
        var prefix = 'in der Nähe von';

        // Straßennamen nach Möglichkeit um eine Präposition ergänzen ("am XY-Platz", "an der XY-Straße" etc.)
        const am_list = ['weg', 'platz', 'damm', 'ring', 'ufer', 'steg', 'steig', 'pfad', 'gestell', 'park', 'garten', 'bogen'];
        for (var str of am_list) {
            if ((highway.toLowerCase().endsWith(str) | highway.toLowerCase().startsWith(str)) && !highway.startsWith('Am ')) {
                prefix = 'am';
                break;
            }
        }
        if (prefix == 'in der Nähe von') {
            const an_der_list = ['straße', 'allee', 'chaussee', 'promenade', 'gasse', 'brücke', 'zeile', 'achse', 'schleife', 'aue', 'insel'];
            for (var str of an_der_list) {
                if ((highway.toLowerCase().endsWith(str) | highway.toLowerCase().startsWith(str)) && !highway.startsWith('An der ')) {
                    prefix = 'an der';
                    break;
                }
            }
        }
        location_str = `${prefix} ${highway}`;
    }
    return location_str;
}

function parseDevices(equipment) {
    if (!equipment) {
        return null;
    } else {
        var equipmentList = equipment.split(";").filter(element => element != "");
        return equipmentList;
    }
}

// Bildergalerie für Spielplatz erstellen und anzeigen
function showGalery(imageURL) {
    if (!imageURL.length) {
        imageURL = ['./img/image_missing.png'];
        show('info-image-missing');
    } else {
        hide('info-image-missing');
    }
    // Bildergalerie leeren, falls er bereits ausgewählt war
    el('info-galery-items').innerHTML = '';
    el('info-galery-indicators').innerHTML = '';

    // Duplikate aus dem Array entfernen (durch Umwandlung in ein Set/Rückumwandlung in Array)
    imageURL = [...new Set(imageURL)];

    // Bilder zur Galerie hinzufügen
    const items = el('info-galery-items');
    const indicators = el('info-galery-indicators');
    for (var i = 0; i < imageURL.length; i++) {
        items.insertAdjacentHTML('beforeend', `<div class="carousel-item"><img src="${imageURL[i]}" class="d-block w-100" alt="Spielplatzfoto"></div>`);
        indicators.insertAdjacentHTML('beforeend', `<button type="button" data-bs-target="#info-galery" data-bs-slide-to="${i}"></button>`);
    }

    // Galerie initialisieren / sichtbare Elemente aktiv setzen
    items.querySelector('.carousel-item')?.classList.add('active');
    indicators.querySelector('button')?.classList.add('active');

    // Galerie-Controls ausblenden, wenn sich nur ein (oder kein) Bild in der Galerie befindet
    if (imageURL.length < 2) {
        hide('info-galery-prev');
        hide('info-galery-next');
        hide('info-galery-indicators');
    } else {
        show('info-galery-prev');
        show('info-galery-next');
        show('info-galery-indicators');
    }

    // Galerie sichtbar machen
    show('info-galery');
}

// Attributfenster leeren, z.B. wenn ins "nichts" geklickt wird
function showAttributes(visibility) {
    if (visibility) {
        // "Klicke, um mehr zu erfahren" ausblenden
        hide('info-more');

        // Attribut-Elemente einblenden
        show('info-base');
        show('info-accordion');

        // Bottom sheet auf mobil als Peek öffnen, auf Desktop vollständig
        if (window.innerWidth <= 768) {
            setPanelPeek();
        } else {
            el('info').classList.add('panel-open');
        }
    } else {
        show('info-more');

        hide('info-base');
        hide('info-accordion');

        // Bottom sheet auf mobil einfahren; offen lassen nur wenn die Nähe-Liste aktiv ist
        if (window.innerWidth <= 768) {
            const hasNearbyList = el('info-more').querySelector('.nearby-panel');
            if (!hasNearbyList) setPanelClosed();
        } else {
            el('info').classList.remove('panel-open');
        }

        // Bildergalerie leeren und ausblenden (falls vorhanden)
        const galeryItems = el('info-galery-items');
        const galeryIndicators = el('info-galery-indicators');
        if (galeryItems) galeryItems.innerHTML = '';
        if (galeryIndicators) galeryIndicators.innerHTML = '';
        if (el('info-galery')) hide('info-galery');
        if (el('info-image-missing')) hide('info-image-missing');
    }
}

// Layer über Switch an-/abwählen

el('layer-switch-schattigkeit').addEventListener('change', function() {
    if (this.checked) {
        addShadowLayer();
    } else {
        removeLayer('shadow');
    }
});

// Beim ersten Klick auf die Schattigkeitsansicht den Schattenlayer in jedem Fall togglen/anzeigen
var shadowFirstActivated = false;
el('accordion-btn-schattigkeit').addEventListener('click', function() {
    if (!shadowFirstActivated) {
        const sw = el('layer-switch-schattigkeit');
        sw.checked = true;
        sw.dispatchEvent(new Event('change'));
        shadowFirstActivated = true;
    }
});

// Mobile: Panel-Zustand wechseln (Peek ↔ Vollbild ↔ Geschlossen)
function setPanelOpen() {
    el('info').classList.remove('panel-peek');
    el('info').classList.add('panel-open');
    document.body.classList.add('sheet-expanded');
}

function setPanelPeek() {
    el('info').classList.remove('panel-open');
    el('info').classList.add('panel-peek');
    document.body.classList.remove('sheet-expanded');
}

function setPanelClosed() {
    el('info').classList.remove('panel-open', 'panel-peek');
    document.body.classList.remove('sheet-expanded');
}

// ── Live-Drag mit Finger-Tracking ────────────────────────────────────────────
//
// The drag system works entirely with inline `transform: translateY(Npx)` during
// the gesture, and replaces those inline styles with CSS classes once the finger
// lifts. This lets us animate freely without fighting CSS specificity.
//
// Why window.innerHeight instead of info.offsetHeight?
//   In peek mode the panel's CSS height is capped at 75vh. If we used
//   offsetHeight as the "full travel" distance, the drag could only move the
//   panel 75vh upward — it would stop half-way. Using window.innerHeight gives
//   us the real screen height so the panel can reach the very top.
//
// Why expand to 100dvh on drag start (peek mode)?
//   The panel's CSS constrains its height to 75vh while in .panel-peek. If we
//   started dragging without overriding that, the panel element would be shorter
//   than the screen, and translateY(0) would leave a gap at the top. Setting
//   height/maxHeight to 100dvh before the first touchmove ensures the panel
//   fills the screen correctly at the end of an upward drag.
//
// Why document-level touchmove/touchend listeners?
//   If the finger moves outside the panel element during a fast swipe, a
//   listener attached to the panel element would miss those events and the drag
//   would "stick". Attaching to document captures all touches regardless of
//   where the finger ends up, and we remove the listeners as soon as the finger
//   lifts (see onDragEnd).

const PEEK_HEIGHT = 108; // px — must match CSS translateY(calc(100% - 108px))
const PANEL_TRANSITION = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)';

let dragActive = false;
let dragStartY = 0;
let dragMode = null; // 'peek' | 'open'
const VH = () => window.innerHeight; // always full viewport height, not element height

function startPanelDrag(touchY, mode) {
    const info = el('info');
    dragStartY = touchY;
    dragMode = mode;
    dragActive = true;
    info.style.transition = 'none'; // disable CSS transition during live drag

    if (mode === 'peek') {
        // Expand to full height so the panel can reach the top during drag
        info.style.height = '100dvh';
        info.style.maxHeight = '100dvh';
        info.style.overflow = 'hidden';
        // Lock the starting transform to the correct pixel position so the
        // panel doesn't jump when we switch from CSS class to inline style.
        info.style.transform = `translateY(${VH() - PEEK_HEIGHT}px)`;
    } else {
        info.style.transform = 'translateY(0)';
    }
}

function movePanelDrag(touchY) {
    if (!dragActive) return;
    const dy = touchY - dragStartY;
    const startT = dragMode === 'peek' ? VH() - PEEK_HEIGHT : 0;
    const T = Math.max(0, Math.min(VH(), startT + dy));
    el('info').style.transform = `translateY(${T}px)`;
}

function endPanelDrag(touchY) {
    if (!dragActive) return;
    dragActive = false;
    const info = el('info');
    const dy = touchY - dragStartY;

    let finalT, action;
    if (dragMode === 'peek') {
        if (dy < -40)     { finalT = 0;               action = 'open';  }
        else if (dy > 40) { finalT = VH();             action = 'close'; }
        else              { finalT = VH() - PEEK_HEIGHT; action = 'peek'; }
    } else {
        if (dy > 40)  { finalT = VH() - PEEK_HEIGHT; action = 'peek'; }
        else          { finalT = 0;                   action = 'open'; }
    }

    info.style.transition = PANEL_TRANSITION;
    info.style.transform = `translateY(${finalT}px)`;

    // Wait for the CSS transition to finish before switching back to CSS
    // classes. If we applied the class immediately, the class rules would
    // conflict with the inline transform and the animation would jump.
    info.addEventListener('transitionend', function onEnd() {
        info.removeEventListener('transitionend', onEnd);
        // Remove all inline styles — let the CSS class take over completely.
        info.style.transition = '';
        info.style.transform = '';
        info.style.height = '';
        info.style.maxHeight = '';
        info.style.overflow = '';
        if (action === 'open')      setPanelOpen();
        else if (action === 'peek') setPanelPeek();
        else                        clearSelection();
    }, { once: true });
}

function onDragMove(e) { movePanelDrag(e.touches[0].clientY); }
function onDragEnd(e)  {
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend',  onDragEnd);
    endPanelDrag(e.changedTouches[0].clientY);
}

function attachDragListeners() {
    document.addEventListener('touchmove', onDragMove, { passive: true });
    document.addEventListener('touchend',  onDragEnd);
}

// Peek: ganzes Panel als Drag-Fläche
el('info').addEventListener('touchstart', e => {
    if (!el('info').classList.contains('panel-peek')) return;
    startPanelDrag(e.touches[0].clientY, 'peek');
    attachDragListeners();
}, { passive: true });

// Vollbild: Drag Handle und blauer Header als Drag-Fläche
[el('info-drag-handle'), el('info-base')].forEach(target => {
    target.addEventListener('touchstart', e => {
        if (!el('info').classList.contains('panel-open')) return;
        e.preventDefault();
        startPanelDrag(e.touches[0].clientY, 'open');
        attachDragListeners();
    }, { passive: false });
});

// Tap auf Drag Handle: Peek → Vollbild; Vollbild → Peek
el('info-drag-handle').addEventListener('click', () => {
    const info = el('info');
    if (info.classList.contains('panel-peek')) setPanelOpen();
    else if (info.classList.contains('panel-open')) setPanelPeek();
});


// Schließen-Button: Spielplatzauswahl aufheben
el('info-close-btn').addEventListener('click', clearSelection);

// Spielplatz teilen: Web Share API (mobil) oder URL in Zwischenablage kopieren
el('info-share-btn').addEventListener('click', () => {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({ url });
    } else {
        navigator.clipboard.writeText(url).then(() => {
            const btn = document.getElementById('info-share-btn');
            const icon = btn.querySelector('span');
            icon.className = 'bi bi-check';
            setTimeout(() => { icon.className = 'bi bi-share'; }, 1500);
        });
    }
});

// Permalink aus URL-Hash wiederherstellen (z.B. nach Teilen eines Links)
export function restoreFromHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const match = hash.match(/^([WNR])(\d+)$/i);
    if (!match) return;
    const osmId = parseInt(match[2], 10);

    const source = dataPlaygrounds.getSource();
    const doSelect = () => {
        if (!source.getFeatures().length) {
            // Features not loaded yet — wait for the first feature to arrive
            source.once('addfeature', doSelect);
            return;
        }
        const feature = source.getFeatures().find(f => parseInt(f.getProperties().osm_id) === osmId);
        if (!feature) return;
        const ext = feature.getGeometry().getExtent();
        const center = [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2];
        selectPlayground(center, 0, false, feature);
    };

    doSelect();
}