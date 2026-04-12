//----------------------------//
// Hauptkarte und deren Layer //
//----------------------------//

import 'bootstrap/dist/css/bootstrap.min.css';
import { Popover, Toast } from 'bootstrap';

import '../css/style.css';
import { Map, View } from 'ol';
import { Image as ImageLayer, Tile as TileLayer, Vector as VectorLayer } from 'ol/layer.js';
import ImageWMS from 'ol/source/ImageWMS.js';
import VectorSource from 'ol/source/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import SourceOSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON.js';
import { Fill, Stroke, Style } from 'ol/style.js';
import { transform, transformExtent } from 'ol/proj';
import { getArea } from 'ol/sphere.js';
import MousePosition from 'ol/control/MousePosition.js';
import { ScaleLine, defaults as defaultControls } from 'ol/control.js';
import Overlay from 'ol/Overlay.js';
import {defaults} from 'ol/interaction/defaults';

import { getFilter } from './filter.js';
import { selectPlayground, getSelectedPlaygroundSource, getSelectionExtent, checkZoomDeselection } from './selectPlayground.js';
import { showPopup } from './popup.js';

import { mapZoom, mapMinZoom } from './config.js';

// TODO (GeoServer): hardcoded until GeoServer integration is restored
const geoServer = 'https://osmbln.uber.space/';
const geoServerWorkspace = 'spielplatzkarte';

// Region extent in EPSG:4326 — updated after Nominatim fetch via applyRegionInfo()
let regionExtent = [5.87, 47.27, 15.04, 55.06]; // Germany fallback
export function getRegionExtent() { return regionExtent; }

// Called from main.js after fetchRegionInfo() resolves
export function applyRegionInfo({ center, extent }) {
    regionExtent = extent;
    view.fit(transformExtent(extent, 'EPSG:4326', 'EPSG:3857'), {
        padding: [20, 20, 20, 390], // leave room for info panel on desktop (left side)
        duration: 0
    });
}

import { fetchPlaygrounds } from './api.js';
import { playgroundCompleteness } from './completeness.js';

// Basemaps
//----------

// Datenstand an die Attribution anhängen
import dataDate from '../data/data_date.js';
const dataDateStr = ` | Datenstand Spielplätze: ${dataDate}`;

// TODO: Mit einer LayerGroup arbeiten, die alle Basemaps gruppiert?
let basemapCartoDBVoyager = new TileLayer({
    title: 'CartoDB Voyager',
    type: 'base',
    visible: true,
    source: new XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | &copy; <a href="https://carto.com/attributions">CARTO</a>' + dataDateStr,
    })
});

// Daten-Layer
//-------------

// Spielplatzblasen (Overpass API)
// Three cached styles for data-completeness colouring:
//   green  = photos + name + detail info
//   yellow = at least one of the above
//   red    = bare polygon (nothing tagged)
// Private / customers playgrounds get a diagonal hatch overlay instead of a solid fill.

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

const _hatchComplete = makeHatchPattern('rgba(34,139,34,0.55)',  'rgba(34,139,34,0.08)');
const _hatchPartial  = makeHatchPattern('rgba(180,130,0,0.55)',  'rgba(234,179,8,0.08)');
const _hatchMissing  = makeHatchPattern('rgba(200,50,50,0.55)',  'rgba(239,68,68,0.06)');

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
const _styleCompleteHatch = new Style({
    fill: new Fill({ color: _hatchComplete }),
    stroke: new Stroke({ color: '#155215', width: 1.5, lineDash: [6, 3] })
});
const _stylePartialHatch = new Style({
    fill: new Fill({ color: _hatchPartial }),
    stroke: new Stroke({ color: '#92400e', width: 1.5, lineDash: [6, 3] })
});
const _styleMissingHatch = new Style({
    fill: new Fill({ color: _hatchMissing }),
    stroke: new Stroke({ color: '#991b1b', width: 1.5, lineDash: [6, 3] })
});

function isRestrictedAccess(props) {
    return props.access === 'private' || props.access === 'customers';
}

function playgroundStyleFn(feature) {
    const props = feature.getProperties();
    const c = playgroundCompleteness(props);
    if (isRestrictedAccess(props)) {
        if (c === 'complete') return _styleCompleteHatch;
        if (c === 'partial')  return _stylePartialHatch;
        return _styleMissingHatch;
    }
    if (c === 'complete') return _styleComplete;
    if (c === 'partial')  return _stylePartial;
    return _styleMissing;
}

const playgroundSource = new VectorSource();
export var dataPlaygrounds = new VectorLayer({
    title: 'Spielplätze',
    type: 'playgrounds',
    visible: true,
    source: playgroundSource,
    zIndex: 10,
    style: playgroundStyleFn
});

fetchPlaygrounds()
    .then(geojson => {
        const features = new GeoJSON().readFeatures(geojson, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
        playgroundSource.addFeatures(features);
    })
    .catch(err => console.error('Overpass: Spielplätze konnten nicht geladen werden:', err));

// Datenprobleme
var sourceIssues = new ImageWMS({
    url: geoServer + 'geoserver/wms',
    params: {
        'LAYERS': `${geoServerWorkspace}:completeness`,
        'CQL_FILTER': ""
    },
    ratio: 1,
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
});

export var dataIssues = new ImageLayer({
    title: 'Datenprobleme',
    type: 'issues',
    visible: false,
    source: sourceIssues,
    zIndex: 100,
});

// Gerätefinder
export var sourceFilteredEquipment = new ImageWMS({
    url: geoServer + 'geoserver/wms',
    params: {
        'LAYERS': `${geoServerWorkspace}:playground_equipment`,
        'CQL_FILTER': ""
    },
    ratio: 1,
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
});

export var dataFilteredEquipment = new ImageLayer({
    title: 'Spielgerätefinder',
    type: 'equipment_filter',
    visible: false,
    source: sourceFilteredEquipment,
    zIndex: 200,
});

// Controls
//----------
// Control für Mausposition
const mousePositionControl = new MousePosition({
    coordinateFormat: customCoordinateFormat,
    projection: 'EPSG:4326',
    className: 'custom-mouse-position',
    target: document.getElementById('mouse-position'),
});

function customCoordinateFormat(coordinate) {
    // Koordinaten umkehren (Y, X) und auf 5 Dezimalstellen runden
    const y = coordinate[1].toFixed(5);
    const x = coordinate[0].toFixed(5);
    return y + ', ' + x;
}

// Control für Maßstab
const scaleControl = new ScaleLine({
    units: 'metric',
    bar: false,
    text: false,
    minWidth: 100
});

// Karte im DOM erzeugen
//-----------------------
var map = null;
const view = new View({
    // Germany center as initial fallback — applyRegionInfo() will fit to the actual region
    center: transform([10.5, 51.2], 'EPSG:4326', 'EPSG:3857'),
    zoom: mapZoom,
    minZoom: mapMinZoom,
});

var popup = new Overlay({
    element: document.getElementById('popup')
});

map = new Map({
    target: 'map',
    controls: defaultControls().extend([mousePositionControl, scaleControl]),
    layers: [basemapCartoDBVoyager, dataPlaygrounds, dataIssues, dataFilteredEquipment],
    overlays: [popup],
    view: view,
    // keine Kartenrotation erlauben
    interactions: defaults({
        altShiftDragRotate: false,
        pinchRotate: false,
    }),
});

export default map;

const mapEl = document.getElementById('map');

// Push notifications
//--------------------
const toast = document.getElementById('toast');
const toastBootstrap = Toast.getOrCreateInstance(toast);

export function showNotification(message) {
    document.getElementById('toast-text').textContent = message;
    toastBootstrap.show();
}

// Funktionen
//------------

// Spielplatzinfos bei Klick anzeigen
map.on('click', function(evt) {
    // Selektion des Spielplatzes auslösen, wenn der Klick nicht innerhalb eines selektierten Spielplatzes stattfindet
    var coordinate = evt.coordinate;
    if (!cursorInSelection(coordinate)) {
        // Entfernung in Pixeln zwischen Bildschirmmitte und Klickposition ermitteln (beeinfusst Dauer der Fluganimation)
        var mapSize = map.getSize();
        var centerX = mapSize[0] / 2;
        var centerY = mapSize[1] / 2;
        var clickPos = evt.pixel;
        var dX = Math.abs(centerX - clickPos[0]);
        var dY = Math.abs(centerY - clickPos[1]);
        var distance = Math.sqrt(dX * dX + dY * dY);

        // TODO: Bei gedrückter Strg-Taste eine Mehrfachauswahl erzeugen
        const multiSelect = evt.originalEvent.ctrlKey;

        // Spielplatz-Feature am Klickpunkt ermitteln (Vector Layer)
        let playgroundFeature = null;
        map.forEachFeatureAtPixel(evt.pixel, function(feature, layer) {
            if (layer === dataPlaygrounds) {
                playgroundFeature = feature;
                return true;
            }
        }, { hitTolerance: 8 });

        selectPlayground(coordinate, distance, multiSelect, playgroundFeature);

        // Popovers ausblenden
        const element = popup.getElement();
        var popover = Popover.getInstance(element);
        if (popover) {
            popover.hide();
        }
    }
});

// Mouse-Move-Events (Popups anzeigen, Cursor ändern)
var pixel_last, coordinate_last;
var timer;
map.on('pointermove', function(evt) {

    // aktuelle Mausposition
    const pixel = evt.pixel;
    const coordinate = evt.coordinate;
    
    // Timer aktivieren, damit WMS-Popup-Datenabfragen an den Mapserver erst nach einer Verzögerung ohne Mausbewegung erfolgt
    if (timer) {
        clearTimeout(timer);
    }

    // Prüfen, ob sich Mauszeiger innerhalb eines selektierten Spielplatzes befindet, um Cursor zu ändern
    if (cursorInSelection(coordinate) && !evt.dragging && !mapEl.classList.contains('grabbing')) {
        mapEl.classList.remove('grab');
        mapEl.classList.remove('grabbing');
        mapEl.classList.add('info');
    } else {
        mapEl.classList.remove('info');
        if (evt.dragging) {
            mapEl.classList.add('grabbing');
        } else {
            mapEl.classList.add('grab');
        }
    }

    const element = popup.getElement();
    var popover = Popover.getInstance(element);
    var popupFeature = null;

    // Prüfen, ob sich an Mausposition ein Datenproblem befindet
    const data_issues = dataIssues.getData(pixel);
    const hit_issues = data_issues && data_issues[3] > 0; // transparent pixels have zero for data[3]

    // falls nicht, dann Popup mit Infos zu Spielgeräten anzeigen
    if (!hit_issues) {
        var features = [];
        var equipmentLayers = map.getLayers().getArray().filter(layer => layer.getProperties()["type"] == 'equipment');
        if (equipmentLayers) {
            map.forEachFeatureAtPixel(pixel, function(feature, layer) {
                if (!equipmentLayers.includes(layer)) {
                    return;
                }
                features.push(feature);
            });
            if (features.length) {
                const feature = features[0];
                popupFeature = feature;
            }  
        }

        // Gibt es an der Mausposition Spielplatzequipment, dann Popup erzeugen (und in jedem Fall den Cursor ändern)
        if (popupFeature) {
            map.getTargetElement().style.cursor = 'help';
            showPopup('equipment', popup, coordinate, popupFeature);
        }
    }

    // falls an Mausposition kein Spielplatzequipment vorhanden ist (oder ein Datenproblem vorhanden ist), Spielplatz oder Datenproblem prüfen
    if (!popupFeature) {
        // Spielplatz-Feature am Mauszeiger ermitteln (Vector Layer)
        let hoveredPlayground = null;
        map.forEachFeatureAtPixel(pixel, function(feature, layer) {
            if (layer === dataPlaygrounds) {
                hoveredPlayground = feature;
                return true;
            }
        }, { hitTolerance: 5 });

        const hit_playgrounds = !!hoveredPlayground;

        if (hit_playgrounds) {
            map.getTargetElement().style.cursor = 'pointer';
            const playgroundProps = {
                ...hoveredPlayground.getProperties(),
                area: Math.round(getArea(hoveredPlayground.getGeometry()))
            };
            showPopup('playground', popup, coordinate, { properties: playgroundProps });
        }
        if (hit_issues) {
            map.getTargetElement().style.cursor = 'help';
        }
        if (!hit_playgrounds && hit_issues) {
            // WMS-Popup für Datenprobleme (verzögert, da Server-Request)
            var delay = 200;
            timer = setTimeout(() => {
                if (pixel == pixel_last && coordinate == coordinate_last) {
                    const url = sourceIssues.getFeatureInfoUrl(
                        coordinate, map.getView().getResolution(), 'EPSG:3857',
                        { 'INFO_FORMAT': 'application/json' }
                    );
                    if (url) {
                        fetch(url)
                            .then(response => response.json())
                            .then(data => {
                                if (data.features.length > 0) {
                                    const feature = data.features[0];
                                    var extent = new GeoJSON().readFeature(feature).getGeometry().getExtent();
                                    var x = extent[0] + (extent[2] - extent[0]) / 2;
                                    var y = extent[3] - (extent[3] - extent[1]) / 5;
                                    showPopup('issues', popup, [x, y], feature);
                                }
                            })
                            .catch(error => console.error('Error fetching feature info:', error));
                    }
                }
            }, delay);
        }
        if (!hit_playgrounds && !hit_issues) {
            map.getTargetElement().style.cursor = '';
            if (popover) {
                popover.hide();
            }
        }
    }

    // Aktualisiere letzte Mausposition
    pixel_last = pixel;
    coordinate_last = coordinate;
});

// beim Rauszoomen prüfen, ob die Auswahl entfernt werden kann, wenn man zu weit vom selektierten Spielplatz wegzoomt
map.on('moveend', function() {
    checkZoomDeselection();
});

// Steuerung der Maus-Cursor auf der Hauptkarte
map.on('pointerdown', function() {
    mapEl.classList.remove('grab');
    mapEl.classList.remove('info');
    mapEl.classList.add('grabbing');
});
  
map.on('pointerup', function(evt) {
    mapEl.classList.remove('grabbing');
    if (cursorInSelection(evt.coordinate)) {
        mapEl.classList.add('info');
    } else {
        mapEl.classList.add('grab');
    }
});

map.on('pointerout', function() {
    mapEl.classList.remove('grabbing');
    mapEl.classList.add('grab');
});

// Prüfen, ob sich Mauszeiger innerhalb eines selektierten Spielplatzes befindet
function cursorInSelection(coord) {
    var selectedPlaygroundSource = getSelectedPlaygroundSource();
    if (selectedPlaygroundSource) {
        return selectedPlaygroundSource.forEachFeature(function(feature) {
            const geometry = feature.getGeometry();
            if (geometry.intersectsCoordinate(coord)) {
                return true;
            }
            return false;
        });
    }
    return false;
}

// Kartenmaßstab ermitteln
export function getMapScale() {
    const resolution = map.getView().getResolution();
    const scale = resolution * 96 * 39.37 // merkwürdiger Faktor aus DPI und Darstellungsbreite eines Meters, grob angenähert
    return scale;
}

// Layerauswahl - Dropdown mit verfügbaren Basemaps füllen

// Klick auf Koordinaten dient als Debugging-Testbutton
document.getElementById('mouse-position').addEventListener('click', function() {
    console.log(`Zoomstufe: ${map.getView().getZoom()}\nKartenmaßstab: ${getMapScale()}\nKartengröße: ${map.getSize()} Pixel\nAusdehnung der Auswahl: ${getSelectionExtent()} (${transformExtent(getSelectionExtent(), 'EPSG:3857', 'EPSG:4326')})`);
});