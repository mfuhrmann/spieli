//---------------------------------------------------------------//
// Spielplatzinformationen für ein ausgewähltes Feature anzeigen //
//---------------------------------------------------------------//

import $ from 'jquery';
import { Modal, Collapse } from 'bootstrap';
import OpeningHours from 'opening_hours';
import { getArea } from 'ol/sphere.js';
import { transform } from 'ol/proj';
import { Vector as VectorLayer } from 'ol/layer.js';
import { Style, Stroke, Fill } from 'ol/style';
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
import { objDevices } from './objPlaygroundEquipment.js';
import { objColors } from '../style/VectorStyles.js';

// TODO (GeoServer): hardcoded until GeoServer integration is restored
const geoServer = 'https://osmbln.uber.space/';
const geoServerWorkspace = 'spielplatzkarte';
import { fetchPlaygroundEquipment, fetchNearbyPOIs } from './overpass.js';
import { panoramaxViewerUrl, panoramaxThumbUrl } from './panoramax.js';

export var sourceSelected; // globale Variable, in der der jeweils ausgewählte Spielplatz enthalten ist
var lastSelectedFeature = null; // zuletzt angeklicktes OpenLayers-Feature (für Overpass-Nachfrage)
var currentArea = null; // Fläche des zuletzt ausgewählten Spielplatzes (für Ausstattungsanzeige)
var equipmentLoadGeneration = 0; // Zähler, um veraltete Overpass-Antworten zu verwerfen
var nearbyLoadGeneration = 0;    // Zähler für Umfeld-POIs
var panoramaxUuids = [];         // UUID-Liste für Modal-Navigation
var panoramaxModalIndex = 0;     // aktuell angezeigtes Foto im Modal

var targetZoom;
var nearbyListFeatures = []; // für Klick-Handler der Nähe-Liste

export function showNearbyPlaygrounds(lon, lat, label = 'diesem Ort') {
    const source = dataPlaygrounds.getSource ? dataPlaygrounds.getSource() : null;
    if (!source) return;
    const features = source.getFeatures();
    if (!features.length) {
        // Overpass still loading — retry once it's done
        source.once('change', () => showNearbyPlaygrounds(lon, lat, label));
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
        <span class="info-label">In der Nähe von ${label}</span>`;

    for (let i = 0; i < nearest.length; i++) {
        const { feature, dist } = nearest[i];
        const attr = feature.getProperties();
        const name = getPlaygroundTitle(attr) || 'Spielplatz';
        html += `<div class="nearby-item" data-idx="${i}">
            <span class="nearby-name">${name}</span>
            <span class="nearby-dist">${formatDistance(dist)}</span>
        </div>`;
    }

    html += '</div>';
    $('#info-more').html(html);
    $('#info').addClass('panel-open');

    $('#info-more').off('click.nearby').on('click.nearby', '.nearby-item', function() {
        const feature = nearbyListFeatures[$(this).data('idx')];
        const ext = feature.getGeometry().getExtent();
        const center = [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2];
        const mapCenter = map.getView().getCenter();
        const res = map.getView().getResolution();
        const distPx = Math.hypot(center[0] - mapCenter[0], center[1] - mapCenter[1]) / res;
        selectPlayground(center, distPx, false, feature);
    });
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
            map.getView().fit(extent, {
                size: map.getSize(),
                duration: duration,
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
        // Umfeld-POIs laden
        const ext3857 = sourceSelected.getExtent();
        const [playLon, playLat] = transform(
            [(ext3857[0] + ext3857[2]) / 2, (ext3857[1] + ext3857[3]) / 2],
            'EPSG:3857', 'EPSG:4326'
        );
        loadNearbyPOIs(playLat, playLon, 1000, geojson.features[0].properties['osm_id']);
        // Schattenlayer anzeigen, falls aktiviert
        if ($('#layer-switch-schattigkeit').prop('checked')) {
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

// Ausstattungsinfo im Infofenster aus Overpass-Daten befüllen
function updateEquipmentPanel(features, playgroundAttr = {}) {
    // playground=yes ist ein generisches Tag ohne konkreten Gerätetyp — ignorieren
    const deviceFeatures = features.filter(f => f.properties.playground && f.properties.playground !== 'yes');
    const deviceCount = deviceFeatures.length;
    const benchCount = features.filter(f => f.properties.amenity === 'bench').length;
    const shelterCount = features.filter(f => f.properties.amenity === 'shelter').length;
    const picnicCount = features.filter(f => f.properties.leisure === 'picnic_table').length;

    let equipment_str = '<ul>';
    equipment_str += deviceCount
        ? `<li>${deviceCount} Spielgerät${deviceCount !== 1 ? 'e' : ''}</li>`
        : '<li>noch keine Spielgeräte erfasst</li>';
    if (benchCount) {
        equipment_str += benchCount === 1 ? '<li>1 Sitzbank</li>' : `<li>${benchCount} Sitzbänke</li>`;
    }
    if (shelterCount) {
        equipment_str += shelterCount === 1 ? '<li>1 Unterstand</li>' : `<li>${shelterCount} Unterstände</li>`;
    }
    if (picnicCount) {
        equipment_str += picnicCount === 1 ? '<li>1 Picknicktisch</li>' : `<li>${picnicCount} Picknicktische</li>`;
    }
    equipment_str += '</ul>';
    $('#info-equipment').html(equipment_str);

    $('#info-device-note').html('');

    // Einzelne Spielgeräte zählen und mit deutschen Namen auflisten
    const deviceCounts = {};
    for (const f of deviceFeatures) {
        const key = f.properties.playground;
        deviceCounts[key] = (deviceCounts[key] || 0) + 1;
    }

    let device_string = '<ul class="mb-0">';
    for (const [key, count] of Object.entries(deviceCounts)) {
        const name = objDevices[key]?.name_de ?? key;
        const category = objDevices[key]?.category ?? 'fallback';
        const color = objColors[category] ?? objColors['fallback'];
        const countStr = count > 1 ? `${count}× ` : '';
        device_string += `<li><span style="color:${color}">●</span> ${countStr}${name}</li>`;
    }
    device_string += '</ul>';

    // Fallback: playground:<key>=<count|yes> Tags am Spielplatz-Polygon selbst auswerten,
    // falls keine einzelnen Objekte per Overpass gefunden wurden
    if (Object.keys(deviceCounts).length === 0) {
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
            $('#info-device-list').html(fallback_string);
            $('#info-device-note').html('<i>Geräte aus Spielplatz-Tags (keine einzelnen Objekte erfasst)</i>');
            return;
        }
    }

    $('#info-device-list').html(Object.keys(deviceCounts).length ? device_string : '');

    // MapComplete-Link zum Hinzufügen von Spielgeräten
    const extent = lastSelectedFeature ? lastSelectedFeature.getGeometry().getExtent() : null;
    if (extent) {
        const [lon, lat] = transform(
            [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2],
            'EPSG:3857', 'EPSG:4326'
        );
        const mapcompleteUrl = `https://mapcomplete.org/playgrounds.html?z=19&lat=${lat.toFixed(7)}&lon=${lon.toFixed(7)}#new_point_dialog_0`;
        $('#info-device-list').append(
            `<div class="mt-1"><a href="${mapcompleteUrl}" target="_blank" rel="noopener" class="mc-add-link"><span class="bi bi-plus-circle"></span> Spielgerät hinzufügen</a></div>`
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
    const addPhotoLink = `<a href="${mapcompletePhotoUrl}" target="_blank" rel="noopener" class="mc-add-link"><span class="bi bi-camera"></span> Foto hinzufügen</a>`;

    if (!uuids.length) {
        $('#info-panoramax').html(`<small class="text-muted">Keine Fotos verknüpft.</small> ${addPhotoLink}`);
        return;
    }

    // Inline-Viewer mit klickbarem Overlay für Vollbild
    let html = `<div style="position:relative; cursor:pointer;" id="panoramax-preview" data-uuid="${uuids[0]}" title="Klicken zum Vergrößern">
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
                alt="Foto ${i + 1}"
                style="height:52px; width:72px; border-radius:3px; cursor:pointer; object-fit:cover; opacity:${opacity};">`;
        }
        html += '</div>';
    }

    html += `<p class="mt-1 mb-0"><small class="text-muted">Fotos: <a href="https://panoramax.xyz" target="_blank" rel="noopener">Panoramax</a></small> ${addPhotoLink}</p>`;
    $('#info-panoramax').html(html);

    // Klick auf Vorschau öffnet Modal
    $('#info-panoramax').off('click.panoramax-enlarge').on('click.panoramax-enlarge', '#panoramax-preview', function() {
        const uuid = $(this).data('uuid');
        panoramaxUuids = uuids;
        panoramaxModalIndex = uuids.indexOf(uuid);
        openPanoramaxModal(panoramaxModalIndex);
    });

    // Thumbnail-Klick wechselt Vorschau-UUID und iframe
    $('#info-panoramax').off('click.panoramax').on('click.panoramax', '.panoramax-thumb', function() {
        const uuid = $(this).data('uuid');
        $('#panoramax-iframe').attr('src', panoramaxViewerUrl(uuid));
        $('#panoramax-preview').data('uuid', uuid);
        $('.panoramax-thumb').css('opacity', '0.55');
        $(this).css('opacity', '1');
    });
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
        $('#info-umfeld').html('<small class="text-muted"><i>Umfeld-Daten konnten nicht geladen werden.</i></small>');
        return;
    }
    if (generation !== nearbyLoadGeneration) return;
    updateUmfeldPanel(pois, lat, lon);
}

const POI_CATEGORIES = [
    {
        icon: '🚻', label: 'Toiletten',
        match: t => t.amenity === 'toilets',
        fallback: 'Öffentliche Toilette'
    },
    {
        icon: '🚌', label: 'Bushaltestellen',
        match: t => t.highway === 'bus_stop',
        fallback: 'Bushaltestelle',
        hint: (poi, playLat, playLon) => poi.tags.towards
            ? `→ ${poi.tags.towards}`
            : bearingToDir(bearingDeg(playLat, playLon, poi.lat, poi.lon))
    },
    {
        icon: '🍦', label: 'Eis',
        match: t => t.amenity === 'ice_cream' || (t.cuisine && t.cuisine.includes('ice_cream')),
        fallback: 'Eisdiele'
    },
    {
        icon: '🧴', label: 'Drogerie',
        match: t => t.shop === 'chemist',
        fallback: 'Drogerie'
    },
    {
        icon: '🏥', label: 'Notaufnahme',
        match: t => t.amenity === 'hospital' || t.emergency === 'yes' || (t.amenity === 'doctors' && t.emergency === 'yes'),
        fallback: 'Krankenhaus'
    }
];

function formatOpeningHours(ohStr) {
    const fmt = t => t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const today = d => d.toLocaleDateString('de-DE', { weekday: 'long' });

    try {
        const oh = new OpeningHours(ohStr, { address: { country_code: 'de' } });
        const now = new Date();
        const isOpen = oh.getState(now);
        const nextChange = oh.getNextChange(now);

        let statusHtml;
        if (ohStr.trim() === '24/7') {
            statusHtml = `<span style="color:#16a34a;">● Immer geöffnet</span>`;
        } else if (isOpen) {
            const until = nextChange ? ` bis ${fmt(nextChange)}` : '';
            statusHtml = `<span style="color:#16a34a;">● Geöffnet${until}</span>`;
        } else {
            if (nextChange) {
                const isToday = nextChange.toDateString() === now.toDateString();
                const dayStr = isToday ? 'Heute' : today(nextChange);
                statusHtml = `<span style="color:#dc2626;">● Geschlossen</span> · Öffnet ${dayStr} um ${fmt(nextChange)}`;
            } else {
                statusHtml = `<span style="color:#dc2626;">● Geschlossen</span>`;
            }
        }

        return `<span class="info-label">Öffnungszeiten</span> ${statusHtml}`;
    } catch {
        // Fallback für unbekannte Formate
        return `<span class="info-label">Öffnungszeiten</span> <code style="font-size:smaller;">${ohStr}</code>`;
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
    return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
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

    $('#info-umfeld').html(html || '<small class="text-muted"><i>Keine nahegelegenen Einrichtungen gefunden.</i></small>');
}

// Panoramax-Modal mit einem bestimmten Foto-Index öffnen / aktualisieren
function openPanoramaxModal(index) {
    panoramaxModalIndex = ((index % panoramaxUuids.length) + panoramaxUuids.length) % panoramaxUuids.length;
    const uuid = panoramaxUuids[panoramaxModalIndex];
    $('#panoramax-modal-iframe').attr('src', panoramaxViewerUrl(uuid));
    $('#panoramax-modal-counter').text(
        panoramaxUuids.length > 1 ? `${panoramaxModalIndex + 1} / ${panoramaxUuids.length}` : ''
    );
    $('#panoramax-modal-prev').prop('disabled', false);
    $('#panoramax-modal-next').prop('disabled', false);
    Modal.getOrCreateInstance('#modalPanoramax').show();
}

$('#panoramax-modal-prev').on('click', () => openPanoramaxModal(panoramaxModalIndex - 1));
$('#panoramax-modal-next').on('click', () => openPanoramaxModal(panoramaxModalIndex + 1));

$(document).on('keydown', function(e) {
    if (!$('#modalPanoramax').hasClass('show')) return;
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

// Spielplatzauswahl aufheben und seine Attribute im Infofenster ausblenden
function removeSelection(clearSource) {
    removeLayer('equipment');
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

        // Hinter dem Infobereich ist ebenfalls noch Karte – Selektion soll jedoch im Bereich neben dem Infofenster zentriert werden
        // also Extent rechts um den relativen Anteil des Infofensters an der Kartengröße erweitern
        // TODO Responsiv gestalten/an schmale Bildschirme anpassen
        var mapWidth = map.getSize()[0];
        var infoWidth = $('#info')[0].offsetWidth;
        var overhangPercent = infoWidth / mapWidth;
        var overhangExtent = (extent[2] - extent[0]) * overhangPercent;
        extent = [extent[0] + overhangExtent / 2, extent[1], extent[2] + overhangExtent, extent[3]];

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
    Collapse.getOrCreateInstance(document.getElementById('accordion-panoramax')).show();
    Collapse.getOrCreateInstance(document.getElementById('accordion-ausstattung')).show();

    // Spielplatzname (aus verschiedenen Attributen zusammengesetzt)
    var playgroundName = getPlaygroundTitle(attr);
    $("#info-name").text(playgroundName);

    // Lagebeschreibung
    var location_str = getPlaygroundLocation(attr);
    $("#info-location").html(`<i>${location_str}</i>`);

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
    $("#info-description").html(playgroundDescription);

    // Größe (m², gerundet auf 10m²)
    var area = attr["area"];
    var playgroundArea;
    if (area) {
        playgroundArea = `<span class="info-label">Größe</span> ${Math.round(area / 10) * 10}m²`;
    } else {
        playgroundArea = '<span class="info-label">Größe</span> unbekannt';
    }
    $("#info-area").html(playgroundArea);

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
    $("#info-access").html(playgroundAccess);

    // Altersbeschränkung
    var minAge = attr["min_age"];
    var maxAge = attr["max_age"];
    if (minAge || maxAge) {
        var ageStr = minAge && maxAge ? `${minAge}–${maxAge} Jahre`
                   : minAge ? `ab ${minAge} Jahren`
                   : `bis ${maxAge} Jahre`;
        $("#info-age").html(`<span class="info-label">Alter</span> ${ageStr}`).show();
    } else {
        $("#info-age").hide();
    }

    // Betreiber
    var operator = attr["operator"];
    var operatorWikidata = attr["operator:wikidata"];
    if (operator) {
        var operatorHtml = operatorWikidata
            ? `<span class="info-label">Betreiber</span> <a href="https://www.wikidata.org/wiki/${operatorWikidata}" target="_blank" rel="noopener" class="link-secondary">${operator}</a>`
            : `<span class="info-label">Betreiber</span> ${operator}`;
        $("#info-operator").html(operatorHtml).show();
    } else {
        $("#info-operator").hide();
    }

    // Öffnungszeiten
    var openingHours = attr["opening_hours"];
    if (openingHours) {
        $("#info-opening-hours").html(formatOpeningHours(openingHours)).show();
    } else {
        $("#info-opening-hours").hide();
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
    contactParts.push(`<a href="${mcUrl}" target="_blank" rel="noopener" class="mc-add-link"><span class="bi bi-pencil"></span> MapComplete</a>`);
    $("#info-contact").html(contactParts.join(' · ')).show();

    // Spielgeräte: werden async per Overpass geladen (updateEquipmentPanel befüllt das nach dem Laden)
    $("#info-equipment").html('<ul><li><i>Wird geladen …</i></li></ul>');
    $("#info-device-note").html('');
    $("#info-device-list").html('');
    // Umfeld: wird async per Overpass geladen
    $("#info-umfeld").html('<small class="text-muted"><i>Wird geladen …</i></small>');

    // Straßenfotos aus Panoramax-Tags des OSM-Objekts
    showPanoramaxFromTags(attr);

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
        $("#info-osm-url").attr("href", url);
    } else {
        $("#info-osm-url").hide();
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
        $("#info-image-missing").show();
    } else {
        $("#info-image-missing").hide();
    }
    // Bildergalerie leeren, falls er bereits ausgewählt war
    $('#info-galery-items').empty();
    $('#info-galery-indicators').empty();

    // Duplikate aus dem Array entfernen (durch Umwandlung in ein Set/Rückumwandlung in Array)
    imageURL = [...new Set(imageURL)];
                
    // Bilder zur Galerie hinzufügen
    for (var i = 0; i < imageURL.length; i++) {
        $(`<div class="carousel-item"><img src="${imageURL[i]}" class="d-block w-100" alt="Spielplatzfoto"></div>`).appendTo('#info-galery-items');
        $(`<button type="button" data-bs-target="#info-galery" data-bs-slide-to="${i}"></button>`).appendTo('#info-galery-indicators');
    }

    // Galerie initialisieren / sichtbare Elemente aktiv setzen
    $('.carousel-item').first().addClass('active');
    $('.carousel-indicators > button').first().addClass('active');

    // Galerie-Controls ausblenden, wenn sich nur ein (oder kein) Bild in der Galerie befindet
    // TODO: Falls sich nur ein Bild in der Galerie befindet und das im Breitformat ist, sollte sich der Bilderrahmen an dessen Größe anpassen
    if (imageURL.length < 2) {
        $('#info-galery-prev').hide();
        $('#info-galery-next').hide();
        $('#info-galery-indicators').hide();
    } else {
        $('#info-galery-prev').show();
        $('#info-galery-next').show();
        $('#info-galery-indicators').show();
    }

    // Galerie sichtbar machen
    $("#info-galery").show();
}

// Attributfenster leeren, z.B. wenn ins "nichts" geklickt wird
function showAttributes(visibility) {
    if (visibility) {
        // "Klicke, um mehr zu erfahren" ausblenden
        $("#info-more").hide();

        // Attribut-Elemente einblenden
        $("#info-base").show();
        $("#info-accordion").show();

        // Bottom sheet auf mobil hochfahren
        $("#info").addClass("panel-open");
    } else {
        $("#info-more").show();

        $("#info-base").hide();
        $("#info-accordion").hide();

        // Bottom sheet auf mobil wieder einfahren — aber offen lassen wenn die Nähe-Liste noch Inhalt hat
        if ($('#info-more').is(':empty')) {
            $("#info").removeClass("panel-open");
        }
    
        // Bildergalerie leeren und ausblenden
        $('#info-galery-items').empty();
        $('#info-galery-indicators').empty();
        $("#info-galery").hide();
        $("#info-image-missing").hide();
    }
}

// Layer über Switch an-/abwählen

$('#layer-switch-schattigkeit').on('change', function() {
    if ($(this).is(':checked')) {
        addShadowLayer();
    } else {
        removeLayer('shadow');
    }
});

// Beim ersten Klick auf die Schattigkeitsansicht den Schattenlayer in jedem Fall togglen/anzeigen
var shadowFirstActivated = false
$('#accordion-btn-schattigkeit').on('click', function() {
    if (!shadowFirstActivated) {
        $('#layer-switch-schattigkeit').prop('checked', true).trigger('change');
        shadowFirstActivated = true;
    }
});