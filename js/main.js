// =============================================================================
// main.js — application entry point
// =============================================================================
//
// This is the first JS file Vite loads. Everything the app needs on startup
// is either imported here or triggered from here.
//
// Module wiring (what lives where):
//
//   map.js             — OpenLayers map setup, layer management, region fit
//   selectPlayground.js — playground selection state, info panel, URL hash
//   search.js          — Nominatim location search
//   locate.js          — geolocation (location button)
//   shadow.js          — sun/shadow simulation
//   config.js          — runtime config values from window.APP_CONFIG
//   region.js          — fetch region name/extent from Nominatim
//   i18n.js            — i18next setup, t() helper, applyTranslations()
//
// Initialisation order:
//   1. Bootstrap modal triggers wired (must happen before any modal is opened)
//   2. fetchRegionInfo() — async, fetches the region name from Nominatim
//   3. applyTranslations() — fills data-i18n attributes in the HTML
//   4. buildDatenErgaenzenModal() / buildUeberModal() — fills modal content
//   5. setCurrentDate() — sets the shadow slider to today
//   6. restoreFromHash() — selects a playground if the URL has a #W<id> hash
//   7. Event listeners registered (keydown, hashchange, search icon click)
//
// =============================================================================

import 'bootstrap/dist/css/bootstrap.min.css';
import '../css/bootstrap_custom.css';
import { Modal } from 'bootstrap';
import { t, applyTranslations } from './i18n.js';

// Bootstrap's data-api (automatic modal wiring via HTML attributes) is
// tree-shaken away when using ES module imports — wire up modal triggers
// manually so clicking [data-bs-toggle="modal"] buttons still works.
document.querySelectorAll('[data-bs-toggle="modal"]').forEach(trigger => {
    trigger.addEventListener('click', e => {
        e.preventDefault();
        const target = document.querySelector(trigger.dataset.bsTarget);
        if (target) Modal.getOrCreateInstance(target).show();
    });
});


// Side-effect imports: these modules register their own event listeners and
// layer setup on import. They don't export anything used directly here.
import map from './map.js';
import { applyRegionInfo } from './map.js';

import { setCurrentDate } from './shadow.js';
import { showLocation, hideLocation } from './locate.js';
import { searchLocation } from './search.js';
import { osmRelationId, regionPlaygroundWikiUrl, regionChatUrl, parentOrigin } from './config.js';
import { fetchRegionInfo } from './region.js';
import { restoreFromHash, clearSelection } from './selectPlayground.js';
import { version } from '../package.json';

const projectAuthorOsmUrl = 'https://www.openstreetmap.org/user/Supaplex030/';
const projectRepoUrl = 'https://github.com/mfuhrmann/spielplatzkarte';

const DEFAULT_PLAYGROUND_WIKI_URL = 'https://wiki.openstreetmap.org/wiki/DE:Tag:leisure%3Dplayground';

// Async IIFE so we can await the Nominatim request before applying translations.
// Everything that depends on the region name (page title, modal content) runs
// inside this function.
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

// Builds the "Daten ergänzen" (contribute data) modal content from config
// values and i18n strings. Done in JS rather than static HTML so the links
// (wiki URL, chat URL) can be injected from the runtime config.
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

// Builds the "Über das Projekt" (about) modal content. Same pattern as above —
// links and the app version are injected at runtime.
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

// Initialise the shadow/sun simulation slider to today's date so it shows
// realistic shadows when the user first opens the shadow layer.
setCurrentDate();

// Restore a direct link to a playground from the URL hash (e.g. #W123456).
// Also re-runs on hashchange so the Hub iframe can navigate between playgrounds
// by changing the parent URL without a full page reload.
restoreFromHash();
window.addEventListener('hashchange', restoreFromHash);

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        clearSelection();
        // Forward ESC to parent frame (e.g. Spielplatzkarte Hub) so it can close the modal.
        // Only forward when no Bootstrap modal is open — if one is, ESC is consumed by Bootstrap
        // and should not propagate to the hub (e.g. closing the Panoramax photo enlargement).
        if (window.parent !== window && !document.querySelector('.modal.show')) {
            window.parent.postMessage({ type: 'spielplatzkarte:escape' }, parentOrigin);
        }
    }
});

// On mobile the search input placeholder is hidden to save space, so tapping
// the magnifier icon is the primary way to open the search box.
document.getElementById('inputSearchIcon').addEventListener('click', () => {
    document.getElementById('inputSearch').focus();
});

// Double-Shift is a discoverable keyboard shortcut for power users on desktop —
// pressing Shift twice quickly focuses and selects the search input.
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
