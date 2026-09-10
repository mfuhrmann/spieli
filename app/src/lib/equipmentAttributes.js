// Generates an HTML detail string for a single equipment feature.
// Ported from js/popup.js → getEquipmentAttributes / getEquipmentAttributesFromProps.

import { objDevices } from './objPlaygroundEquipment.js';
import { proxiedImageUrl } from './commons.js';
// `with { type: 'json' }` is required by Node, which refuses a bare JSON
// import, and accepted by Vite — so this module stays unit-testable outside a
// bundler instead of only being reachable through the browser build.
import equipmentImages from './equipmentImages.generated.json' with { type: 'json' };
import { escapeHtml, tl } from './utils.js';

// Resolve a `File:` name to a same-origin image URL, or null.
//
// The names come from our own device and pitch tables, and the map is built by
// tools/build-equipment-images.py, which follows the Special:FilePath redirect
// chain ONCE at build time. Doing it here at runtime is what forced the
// browser to contact commons.wikimedia.org directly, then fall back to
// wiki.openstreetmap.org on a 404 — a host no disclosure named and no CSP
// allowed — and to make two failing requests for the 14 names that exist on
// neither wiki.
//
// Returning null for an unknown name is the point: nothing is rendered, so a
// missing illustration costs no request and shows no broken image. The build
// fails on a name that resolves nowhere, so the map cannot silently rot.
// Author and licence, when the wiki exposes them. Serving these bytes through
// our own origin makes us the distributor, so the CC attribution obligation is
// ours rather than Commons'. The OSM wiki returns no extmetadata, so its 14
// files carry no credit and this renders nothing for them.
function imageCredit(img) {
    const parts = [img.artist, img.license].filter(Boolean);
    return parts.length ? ` · ${escapeHtml(parts.join(', '))}` : '';
}

function resolvedImage(fileName) {
    const entry = equipmentImages.images[fileName];
    if (!entry) return null;
    const url = proxiedImageUrl(`https://${entry.host}${entry.path}`);
    return { url, license: entry.license, artist: entry.artist };
}

const pitchImages = {
    soccer:'File:Association football pitch imperial.svg',
    basketball:'File:Basketball court dimensions in meters.svg',
    table_tennis:'File:Table tennis table blue.jpg',
    volleyball:'File:Volleyball court with dimensions.svg',
    tennis:'File:Hard tennis court 1.jpg',
    handball:'File:Handball court metric.svg',
    badminton:'File:Badminton court 8shuttle.svg',
    hockey:'File:Field Hockey Pitch Dimensions.svg',
    field_hockey:'File:Field Hockey Pitch Dimensions.svg',
    boules:'File:Boules-coloured.jpg',
    petanque:'File:Boules-coloured.jpg',
    multi:'File:Multi-use games area.jpg',
    skateboard:'File:Skatepark Vienna Praterstern 2015.jpg',
    bmx:'File:BMX track Canberra.jpg',
    athletics:'File:Athletics track.jpg',
    beachvolleyball:'File:BeachvolleyballAthens04.jpg',
    climbing:'File:Outdoor bouldering wall.jpg',
};

/**
 * Returns detail attributes for a single equipment item.
 * @param {Object} props - plain GeoJSON feature properties object
 * @param {Function} t - svelte-i18n translate function
 * @returns {{ html: string, panoramaxUuid: string|null }}
 */
export function getEquipmentAttributesFromProps(props, t) {
    const g = key => props[key];
    const content = [];

    const theme = g('playground:theme');
    if (theme && theme !== 'playground') {
        const label = tl(t, `equipAttr.themes.${theme}`, escapeHtml(theme));
        content.push(`${t('equipAttr.theme')}: ${label}`);
    }

    if (g('capacity'))      content.push(`${t('equipAttr.capacity')}: ${escapeHtml(String(g('capacity')))}`);
    if (g('capacity:baby')) content.push(`${t('equipAttr.babyCapacity')}: ${escapeHtml(String(g('capacity:baby')))}`);

    for (const [tag, labelKey] of [['height','equipAttr.height'],['width','equipAttr.width']]) {
        let v = g(tag);
        if (v) {
            v = v.replace(' ', '').toLowerCase();
            if (v.includes('cm')) { v = v.replace('cm',''); if (!isNaN(v)) v = v / 100; }
            const num = !isNaN(v);
            content.push((`${t(labelKey)}: ${escapeHtml(String(v))}` + (num ? ` ${t('equipAttr.meters')}` : '')).replace('.', ','));
        }
    }
    const len = g('length');
    if (len) content.push(`${t('equipAttr.length')}: ${escapeHtml(String(len).replace('.', ','))} ${t('equipAttr.meters')}`);

    const pump_status = g('pump:status');
    if (pump_status) {
        const label = tl(t, `equipAttr.statuses.${pump_status}`, escapeHtml(pump_status));
        content.push(`${t('equipAttr.status')}: ${label}`);
    }

    const covered = g('covered');
    if (covered === 'yes') content.push(t('equipAttr.covered'));
    else if (covered === 'no') content.push(t('equipAttr.notCovered'));

    const material = g('material');
    if (material) {
        const label = material.split(';').map(m => tl(t, `equipAttr.materials.${m.trim()}`, escapeHtml(m.trim()))).join(' / ');
        content.push(`${t('equipAttr.material')}: ${label}`);
    }

    if (g('baby') === 'yes') content.push(t('equipAttr.suitableBaby'));
    if (g('provided_for:toddler') === 'yes') content.push(t('equipAttr.suitableToddler'));

    const wc = g('wheelchair');
    if (wc === 'yes') content.push(t('equipAttr.wheelchairYes'));
    else if (wc === 'limited') content.push(t('equipAttr.wheelchairLimited'));
    else if (wc === 'no') content.push(t('equipAttr.wheelchairNo'));

    if (g('blind') === 'yes') content.push(t('equipAttr.blind'));

    if (pump_status && g('check_date'))
        content.push(`${t('equipAttr.lastChecked')}: ${escapeHtml(g('check_date'))}`);

    const backrest = g('backrest');
    if (backrest === 'yes') content.push(t('equipAttr.withBackrest'));
    else if (backrest === 'no') content.push(t('equipAttr.noBackrest'));

    const sport = g('sport');
    // For pitches the sport is already shown as the list item label — adding it
    // here would be redundant.  For other feature types (fitness stations, …)
    // we do show it, and format multi-value strings with human-readable labels.
    if (sport && g('leisure') !== 'pitch' && !['table_tennis','soccer','basketball'].includes(sport)) {
        const sportLabel = sport.split(';')
            .map(s => tl(t, `equipAttr.sports.${s.trim()}`, escapeHtml(s.trim())))
            .join(' / ');
        content.push(`${t('equipAttr.sport')}: ${sportLabel}`);
    }

    const surface = g('surface');
    if (surface) {
        const label = surface.split(';').map(s => tl(t, `details.surfaceValues.${s.trim()}`, escapeHtml(s.trim()))).join(' / ');
        content.push(`${t('equipAttr.surface')}: ${label}`);
    }

    const genus = g('genus');
    if (genus) {
        const label = tl(t, `equipAttr.genera.${genus}`, escapeHtml(genus));
        content.push(`${t('equipAttr.genus')}: ${label}`);
    }

    const diameter_crown = g('diameter_crown');
    if (diameter_crown)
        content.push(`${t('equipAttr.crownDiameter')}: ${escapeHtml(String(diameter_crown))} ${t('equipAttr.meters')}`);

    // Find Panoramax UUID on the device
    let panoramaxUuid = g('panoramax') || g('panoramax:0');
    for (let pi = 1; pi <= 9 && !panoramaxUuid; pi++) panoramaxUuid = g(`panoramax:${pi}`);

    const leisure  = g('leisure');
    const osmType  = ({ N:'node', W:'way', R:'relation' })[g('osm_type')] ?? 'node';
    const osmId    = g('osm_id');
    const mcTheme  = (leisure === 'fitness_station' || leisure === 'pitch') ? 'sports' : 'playgrounds';
    const mcUrl    = `https://mapcomplete.org/${mcTheme}.html` + (osmId ? `#${osmType}/${osmId}` : '');

    let html = '';
    if (content.length) {
        html += '<ul>' + content.map(c => `<li>${c}</li>`).join('') + '</ul>';
    }

    // Fallback image when no panoramax photo and no attributes
    if (!html && !panoramaxUuid) {
        const deviceKey = g('playground');
        const sportRaw  = g('sport');
        // No onerror fallback any more: the build has already established that
        // the URL resolves, so a failure here is a proxy or network problem
        // rather than a wrong name, and a second guess at another host would
        // just be an undisclosed request.
        if (deviceKey && objDevices[deviceKey]?.image) {
            const img = resolvedImage(objDevices[deviceKey].image);
            if (img) {
                const altText = tl(t, `equipment.devices.${deviceKey}`, objDevices[deviceKey].name_de ?? deviceKey);
                html = `<div class="device-img-wrap">` +
                    `<img src="${escapeHtml(img.url)}"` +
                    ` alt="${escapeHtml(altText)}" loading="lazy" referrerpolicy="no-referrer"` +
                    ` style="object-fit:contain;width:100%">` +
                    `<p class="mb-0 text-muted" style="font-size:0.75rem;"><span class="bi bi-image"></span> ` +
                    `${escapeHtml(t('popup.deviceSymbol'))}${imageCredit(img)}</p></div>`;
            }
        } else if (leisure === 'pitch' && sportRaw && pitchImages[sportRaw]) {
            const img = resolvedImage(pitchImages[sportRaw]);
            if (img) {
                html = `<div class="device-img-wrap">` +
                    `<img src="${escapeHtml(img.url)}"` +
                    ` alt="${escapeHtml(sportRaw)}" loading="lazy" referrerpolicy="no-referrer"` +
                    ` style="object-fit:contain;width:100%">` +
                    (imageCredit(img) ? `<p class="mb-0 text-muted" style="font-size:0.7rem;">${imageCredit(img).trim()}</p>` : '') +
                    `</div>`;
            }
        }
    }

    return { html, panoramaxUuid: panoramaxUuid || null, mcUrl };
}
