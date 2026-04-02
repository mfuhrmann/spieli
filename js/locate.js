//-----------------------------------//
// Standortverfolgung de-/aktivieren //
//-----------------------------------//

import $ from 'jquery';

import Feature from 'ol/Feature.js';
import Geolocation from 'ol/Geolocation.js';
import Point from 'ol/geom/Point.js';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js';
import { Vector as VectorSource } from 'ol/source.js';
import { Vector as VectorLayer } from 'ol/layer.js';

import map from './map.js';
import { showNearbyPlaygrounds } from './selectPlayground.js';
import { transform } from 'ol/proj';

// Einmalige Standortbestimmung: Karte zentrieren, Spielplätze in der Nähe anzeigen
$('#btn-location').on('click', function() {
    geolocation.setTracking(true);
    locatorLayer.setProperties({"visible": true});
});

export function showLocation() {
    geolocation.setTracking(true);
    locatorLayer.setProperties({"visible": true});
}

export function hideLocation() {
    geolocation.setTracking(false);
    locatorLayer.setProperties({"visible": false});
    locatorLayer.getSource().changed();
}

// Geolocation-Handling
const geolocation = new Geolocation({
    trackingOptions: {
        enableHighAccuracy: true,
    },
    projection: map.getView().getProjection(),
});

geolocation.on('error', function (error) {
    console.log("Standortverfolgung nicht möglich.");
});

const accuracyFeature = new Feature();

geolocation.on('change:accuracyGeometry', function () {
    accuracyFeature.setGeometry(geolocation.getAccuracyGeometry());
});

const positionFeature = new Feature();
positionFeature.setStyle(
    new Style({
        image: new CircleStyle({
            radius: 6,
            fill: new Fill({
                color: '#3399CC',
            }),
            stroke: new Stroke({
                color: '#fff',
                width: 2,
            }),
        }),
    }),
);

geolocation.once('change:position', function () {
    const coordinates = geolocation.getPosition();
    if (!coordinates) return;

    positionFeature.setGeometry(new Point(coordinates));
    map.getView().animate({ center: coordinates, zoom: Math.max(map.getView().getZoom(), 14) });

    // Tracking wieder stoppen — einmalige Positionsbestimmung
    geolocation.setTracking(false);

    const [lon, lat] = transform(coordinates, 'EPSG:3857', 'EPSG:4326');
    showNearbyPlaygrounds(lon, lat, 'deinem Standort');
});

const locatorLayer = new VectorLayer({
    map: map,
    title: 'Standort',
    type: 'location',
    visible: true,
    source: new VectorSource({
        features: [accuracyFeature, positionFeature],
    }),
});
