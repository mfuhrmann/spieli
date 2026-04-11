import 'bootstrap/dist/css/bootstrap.min.css';
import '../css/bootstrap_custom.css';
import { Modal } from 'bootstrap';

// Bootstrap's data-api may be tree-shaken away — wire up modal triggers explicitly
document.querySelectorAll('[data-bs-toggle="modal"]').forEach(trigger => {
    trigger.addEventListener('click', e => {
        e.preventDefault();
        const target = document.querySelector(trigger.dataset.bsTarget);
        if (target) Modal.getOrCreateInstance(target).show();
    });
});


import map from './map.js';
import { applyRegionInfo } from './map.js';

import { setCurrentDate } from './shadow.js';
import { showLocation, hideLocation } from './locate.js';
import { searchLocation } from './search.js';
import { osmRelationId, regionPlaygroundWikiUrl, regionChatUrl } from './config.js';
import { fetchRegionInfo } from './region.js';
import { restoreFromHash } from './selectPlayground.js';
import { version } from '../package.json';

const projectAuthorOsmUrl = 'https://www.openstreetmap.org/user/Supaplex030/';
const projectRepoUrl = 'https://github.com/mfuhrmann/spielplatzkarte';

const DEFAULT_PLAYGROUND_WIKI_URL = 'https://wiki.openstreetmap.org/wiki/DE:Tag:leisure%3Dplayground';

// Async init — fetch region info from Nominatim, then set up the app
(async function init() {
    let region = { name: 'Spielplatzkarte', extent: null, center: null };
    try {
        region = await fetchRegionInfo(osmRelationId);
        applyRegionInfo(region);
    } catch (e) {
        console.warn('Region info could not be fetched from Nominatim:', e);
    }

    // Seitenname aus Konfiguration setzen
    const appTitle = `${region.name}er Spielplatzkarte`;
    document.title = appTitle;
    document.getElementById('app-version').textContent = `v${version}`;

    buildDatenErgaenzenModal(region.name);
    buildUeberModal();
}());

// "Daten ergänzen"-Modal dynamisch befüllen
function buildDatenErgaenzenModal(regionName) {
    const l = (text) => `<span class="info-label">${text}</span>`;
    const wikiUrl = regionPlaygroundWikiUrl || DEFAULT_PLAYGROUND_WIKI_URL;

    let html = `
        ${l('OpenStreetMap')}
        <p>Die Daten stammen aus <a href="https://de.wikipedia.org/wiki/OpenStreetMap" class="link-secondary">OpenStreetMap</a> —
        einer freien, kollaborativen Weltkarte von Millionen Freiwilligen. Nur was eingetragen wurde, erscheint auch hier.</p>

        ${l('Spielplätze beitragen')}
        <p>Jede und jeder kann mitmachen. Einen Einstieg bietet <a href="https://learnosm.org/de/beginner/" class="link-secondary">LearnOSM.org</a>.
        Die relevanten Tags sind im <a href="${wikiUrl}" class="link-secondary" target="_blank" rel="noopener">OSM-Wiki</a>
        und auf der Seite zur <a href="https://wiki.openstreetmap.org/wiki/Key:playground" class="link-secondary">Erfassung einzelner Spielgeräte</a> dokumentiert.</p>

        ${l('Fotos hinzufügen')}
        <p>Fotos lassen sich direkt über <a href="https://mapcomplete.org/playgrounds" class="link-secondary" target="_blank" rel="noopener">MapComplete</a>
        hochladen — einfach einen Spielplatz öffnen und „Foto hinzufügen" klicken.
        Die Fotos werden über <a href="https://panoramax.xyz" class="link-secondary" target="_blank" rel="noopener">Panoramax</a> bereitgestellt.</p>`;

    if (regionChatUrl) {
        html += `
        ${l('Community')}
        <p>Fragen oder mitmachen? Die lokale OSM-Community ist erreichbar über den
        <a href="${regionChatUrl}" class="link-secondary" target="_blank" rel="noopener">lokalen OSM-Community-Chat</a>.</p>`;
    }

    document.querySelector('#modalDatenErgaenzen .modal-body').innerHTML = html;
}

// "Über das Projekt"-Modal dynamisch befüllen
function buildUeberModal() {
    const l = (text) => `<span class="info-label">${text}</span>`;
    const authorLink = `<a href="${projectAuthorOsmUrl}" class="link-secondary" target="_blank" rel="noopener">Alex Seidel (Supaplex030)</a>`;

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

    html += `<p class="mt-3 mb-0" style="font-size:11px; color:#9ca3af;">Version ${version}</p>`;

    document.querySelector('#modalUeberDasProjekt .modal-body').innerHTML = html;
}

// Schieberegler der Schattenberechnung auf aktuelles Datum setzen
setCurrentDate();

// Direktlink zu einem Spielplatz wiederherstellen (URL-Hash wie #W123456)
// Also handles hash changes when embedded as iframe in Spielplatzkarte Hub.
restoreFromHash();
window.addEventListener('hashchange', restoreFromHash);

// TODO Bekannte Bugs:
// - Sind nach Selektion eines Spielplatzes Spielplatzausstattungslayer geladen und bewegt man die Karte oder zoomt man heraus (auf einen Wert < Zoomstufe ~20,5), werden die Features mehrfach eingeladen
// - Überschneiden sich die bboxes zweier Spielplätze, werden im Spielgeräte-Layer auch Spielgeräte des benachbarten Spielplatzes angezeigt, solange sie in der bbox des selektierten Spielplatzes liegen (Beispiel: https://www.openstreetmap.org/way/61882759)
