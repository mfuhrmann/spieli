import 'bootstrap/dist/css/bootstrap.min.css';
import '../css/bootstrap_custom.css';
import { Modal } from 'bootstrap';
import { t, applyTranslations } from './i18n.js';

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
import { restoreFromHash, clearSelection } from './selectPlayground.js';
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

    applyTranslations();

    // Seitenname aus Konfiguration setzen
    const appTitle = t('appTitle', { regionName: region.name });
    document.title = appTitle;
    document.getElementById('app-version').textContent = `v${version}`;

    buildDatenErgaenzenModal();
    buildUeberModal();
}());

// "Daten ergänzen"-Modal dynamisch befüllen
function buildDatenErgaenzenModal() {
    const l = text => `<span class="info-label">${text}</span>`;
    const p = text => `<p>${text}</p>`;
    const a = (href, text, extra = '') => `<a href="${href}" class="link-secondary" ${extra}>${text}</a>`;
    const wikiUrl = regionPlaygroundWikiUrl || DEFAULT_PLAYGROUND_WIKI_URL;

    const osmWikiLink   = a(t('modal.addData.osm.wikiUrl'), 'OpenStreetMap');
    const learnOsmLink  = a(t('modal.addData.contribute.learnOsmUrl'), 'LearnOSM.org');
    const wikiLink      = a(wikiUrl, t('modal.addData.contribute.wikiLabel'), 'target="_blank" rel="noopener"');
    const equipmentLink = a('https://wiki.openstreetmap.org/wiki/Key:playground', t('modal.addData.contribute.equipmentLabel'));
    const mapcompleteLink = a('https://mapcomplete.org/playgrounds', 'MapComplete', 'target="_blank" rel="noopener"');
    const panoramaxLink = a('https://panoramax.xyz', 'Panoramax', 'target="_blank" rel="noopener"');

    let html = `
        ${l(t('modal.addData.osm.label'))}
        ${p(t('modal.addData.osm.text', { osmLink: osmWikiLink }))}

        ${l(t('modal.addData.contribute.label'))}
        ${p(t('modal.addData.contribute.text', { learnOsmLink, wikiLink, equipmentLink }))}

        ${l(t('modal.addData.photos.label'))}
        ${p(t('modal.addData.photos.text', { mapcompleteLink, panoramaxLink }))}`;

    if (regionChatUrl) {
        const chatLink = a(regionChatUrl, t('modal.addData.community.chatLabel'), 'target="_blank" rel="noopener"');
        html += `
        ${l(t('modal.addData.community.label'))}
        ${p(t('modal.addData.community.text', { chatLink }))}`;
    }

    document.querySelector('#modalDatenErgaenzen .modal-body').innerHTML = html;
}

// "Über das Projekt"-Modal dynamisch befüllen
function buildUeberModal() {
    const l = text => `<span class="info-label">${text}</span>`;
    const p = text => `<p>${text}</p>`;
    const a = (href, text, extra = '') => `<a href="${href}" class="link-secondary" ${extra}>${text}</a>`;

    const authorLink = a(projectAuthorOsmUrl, 'Alex Seidel (Supaplex030)', 'target="_blank" rel="noopener"');
    const courseLink = a(t('modal.about.history.courseUrl'), t('modal.about.history.courseLabel'));
    const osmLink    = a(t('modal.about.project.osmWikiUrl'), 'OpenStreetMap');

    let html = `
        ${l(t('modal.about.history.label'))}
        ${p(t('modal.about.history.text', { authorLink, courseLink }))}

        ${l(t('modal.about.project.label'))}
        ${p(t('modal.about.project.text', { osmLink }))}`;

    if (projectRepoUrl) {
        const repoLink = a(projectRepoUrl, t('modal.about.source.repoLabel'), 'target="_blank" rel="noopener"');
        html += `
        ${l(t('modal.about.source.label'))}
        ${p(t('modal.about.source.text', { repoLink }))}`;
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

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        clearSelection();
        // Forward ESC to parent frame (e.g. Spielplatzkarte Hub) so it can close the modal.
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'spielplatzkarte:escape' }, '*');
        }
    }
});

// Double-Shift → focus search box
let lastShift = 0;
document.addEventListener('keydown', e => {
    if (e.key !== 'Shift') { lastShift = 0; return; }
    const now = Date.now();
    if (now - lastShift < 500) {
        document.getElementById('inputSearch').select();
        lastShift = 0;
    } else {
        lastShift = now;
    }
});

// TODO Bekannte Bugs:
// - Sind nach Selektion eines Spielplatzes Spielplatzausstattungslayer geladen und bewegt man die Karte oder zoomt man heraus (auf einen Wert < Zoomstufe ~20,5), werden die Features mehrfach eingeladen
// - Überschneiden sich die bboxes zweier Spielplätze, werden im Spielgeräte-Layer auch Spielgeräte des benachbarten Spielplatzes angezeigt, solange sie in der bbox des selektierten Spielplatzes liegen (Beispiel: https://www.openstreetmap.org/way/61882759)
