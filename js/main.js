import $ from 'jquery';

import 'bootstrap/dist/css/bootstrap.min.css';
import '../css/bootstrap_custom.css';

import { transformExtent } from 'ol/proj';

import map from './map.js';
import { getMapScale, mapExtent } from './map.js';

import { setCurrentDate } from './shadow.js';
import { showLocation, hideLocation } from './locate.js';
import { searchLocation } from './search.js';
import { regionName, regionPlaygroundWikiUrl, regionChatUrl, regionChatName,
         projectAuthorName, projectAuthorOsmUrl, projectRepoUrl } from './config.js';

// Seitenname aus Konfiguration setzen
const appTitle = `${regionName}er Spielplatzkarte`;
document.title = appTitle;
$('.navbar-brand b').text(appTitle);

// "Daten ergänzen"-Modal dynamisch befüllen
(function buildDatenErgaenzenModal() {
    const l = (text) => `<span class="info-label">${text}</span>`;

    let html = `
        ${l('OpenStreetMap')}
        <p>Die Daten stammen aus <a href="https://de.wikipedia.org/wiki/OpenStreetMap" class="link-secondary">OpenStreetMap</a> —
        einer freien, kollaborativen Weltkarte von Millionen Freiwilligen. Nur was eingetragen wurde, erscheint auch hier.</p>

        ${l('Spielplätze beitragen')}
        <p>Jede und jeder kann mitmachen. Einen Einstieg bietet <a href="https://learnosm.org/de/beginner/" class="link-secondary">LearnOSM.org</a>.
        Die relevanten Tags sind im <a href="https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground" class="link-secondary">OSM-Wiki</a>
        und auf der Seite zur <a href="https://wiki.openstreetmap.org/wiki/Key:playground" class="link-secondary">Erfassung einzelner Spielgeräte</a> dokumentiert.`;

    if (regionPlaygroundWikiUrl) {
        html += ` Informationen speziell zu Spielplätzen in ${regionName} gibt es <a href="${regionPlaygroundWikiUrl}" class="link-secondary" target="_blank" rel="noopener">im OSM-Wiki</a>.`;
    }

    html += `</p>

        ${l('Fotos hinzufügen')}
        <p>Fotos lassen sich direkt über <a href="https://mapcomplete.org/playgrounds" class="link-secondary" target="_blank" rel="noopener">MapComplete</a>
        hochladen — einfach einen Spielplatz öffnen und „Foto hinzufügen" klicken.
        Die Fotos werden über <a href="https://panoramax.xyz" class="link-secondary" target="_blank" rel="noopener">Panoramax</a> bereitgestellt.</p>`;

    if (regionChatUrl) {
        html += `
        ${l('Community')}
        <p>Fragen oder mitmachen? Die lokale OSM-Community ist erreichbar über den
        <a href="${regionChatUrl}" class="link-secondary" target="_blank" rel="noopener">${regionChatName}</a>.</p>`;
    }

    $('#modalDatenErgaenzen .modal-body').html(html);
}());

// "Über das Projekt"-Modal dynamisch befüllen
(function buildUeberModal() {
    const l = (text) => `<span class="info-label">${text}</span>`;
    const authorLink = `<a href="${projectAuthorOsmUrl}" class="link-secondary" target="_blank" rel="noopener">${projectAuthorName}</a>`;

    let html = `
        ${l('Geschichte')}
        <p>Die Spielplatzkarte wurde von ${authorLink} als Abschlussprojekt einer
        <a href="https://gis-trainer.com/de/gis_webmapping.php" class="link-secondary">GIS- und Webmapping-Weiterbildung</a>
        ins Leben gerufen — ursprünglich mit Fokus auf Berlin. Im Laufe der Zeit wurde sie zu einer
        generischen Spielplatzkarte weiterentwickelt, die für jede beliebige OSM-Region eingesetzt werden kann.</p>

        ${l('Das Projekt')}
        <p>Die Spielplatzkarte ist eine freie, interaktive Webkarte auf Basis von
        <a href="https://de.wikipedia.org/wiki/OpenStreetMap" class="link-secondary">OpenStreetMap</a>-Daten.
        Sie enthält keine proprietären Daten, erfordert keine Anmeldung und verfolgt keine Nutzer.
        Wer Spielplatzdaten in OSM verbessert, verbessert damit automatisch auch diese Karte.</p>`;

    if (projectRepoUrl) {
        html += `
        ${l('Quellcode')}
        <p>Das Projekt ist OpenSource und <a href="${projectRepoUrl}" class="link-secondary" target="_blank" rel="noopener">öffentlich verfügbar</a>.</p>`;
    }

    $('#modalUeberDasProjekt .modal-body').html(html);
}());

// Schieberegler der Schattenberechnung auf aktuelles Datum setzen
setCurrentDate();

// TODO Bekannte Bugs:
// - Sind nach Selektion eines Spielplatzes Spielplatzausstattungslayer geladen und bewegt man die Karte oder zoomt man heraus (auf einen Wert < Zoomstufe ~20,5), werden die Features mehrfach eingeladen
// - Überschneiden sich die bboxes zweier Spielplätze, werden im Spielgeräte-Layer auch Spielgeräte des benachbarten Spielplatzes angezeigt, solange sie in der bbox des selektierten Spielplatzes liegen (Beispiel: https://www.openstreetmap.org/way/61882759)