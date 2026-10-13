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
// allowed — and to make two failing requests for every name that existed on
// neither wiki (14 pitch names, until #867 replaced them).
//
// Returning null for an unknown name is the point: nothing is rendered, so a
// missing illustration costs no request and shows no broken image. The build
// fails on a name that resolves nowhere, so the map cannot silently rot.
// Attribution for one illustration.
//
// Serving these bytes through our own origin makes us the distributor, so the
// CC obligation is ours rather than Commons'. Naming the author in plain text
// is not enough for BY/BY-SA: the source has to be identifiable, so the credit
// links the file page. That link is available for every entry, including the
// 14 on the OSM wiki whose API returns no extmetadata and therefore no author
// or licence — those still credit a source rather than nothing.
//
// A link, not a fetch: nothing is requested until the visitor clicks it.
function imageCredit(img) {
    const text = [img.artist, img.license].filter(Boolean).join(', ');
    if (!img.source) return text ? ` · ${escapeHtml(text)}` : '';
    const label = text || 'Wikimedia Commons / OpenStreetMap-Wiki';
    return ` · <a href="${escapeHtml(img.source)}" target="_blank" rel="noopener noreferrer"`
        + ` class="link-secondary">${escapeHtml(label)}</a>`;
}

function resolvedImage(fileName) {
    const entry = equipmentImages.images[fileName];
    if (!entry) return null;
    const url = proxiedImageUrl(`https://${entry.host}${entry.path}`);
    return { url, license: entry.license, artist: entry.artist, source: entry.source };
}

// Every title was checked to exist on Commons and to show what it claims
// (#867: 14 of the previous names resolved nowhere, so only athletics had ever
// rendered). Hockey has no free pitch diagram on Commons, so it has no entry —
// an absent entry renders nothing, which is what a wrong one did. Several are
// photos of real places, so the pitch caption says "example image" like the
// device one. Exported for the tests, which iterate it.
export const pitchImages = {
    soccer:'File:Football pitch metric.svg',
    basketball:'File:Basketball court fiba.svg',
    table_tennis:'File:Table Tennis Table Blue.svg',
    volleyball:'File:VolleyballCourt.svg',
    tennis:'File:Tennis court metric.svg',
    handball:'File:Handball Field diagram -en.svg',
    badminton:'File:Badminton court.svg',
    boules:'File:Haute-Avesnes - Terrain de pétanque du stade.jpg',
    petanque:'File:Haute-Avesnes - Terrain de pétanque du stade.jpg',
    multi:'File:Great Central Road Multi-use Games Area, Loughborough.jpg',
    skateboard:'File:Solvang Skatepark.jpg',
    bmx:'File:BMX Pump Track, Whitley Bay, UK.jpg',
    athletics:'File:Athletics track.jpg',
    beachvolleyball:'File:Beach volleyball court in Kaukajärvi, Tampere, Finland.jpg',
    climbing:'File:Urduliz outdoor climbing wall.jpg',
};

// `sport` may list several sports (`soccer;basketball`, common on multi-use
// courts): a single sport gets its own illustration, several get the
// multi-use one.
function pitchImageFor(sportRaw) {
    const sports = sportRaw.split(';').map(s => s.trim()).filter(Boolean);
    if (sports.length > 1) return pitchImages.multi;
    return pitchImages[sports[0]] ?? null;
}

/**
 * The example illustration for a pitch's sport, as HTML (image, "example
 * image" caption, CC credit), or '' when the sport has none. Shared by the
 * pitch rows inside a playground and the standalone pitch panel (#968).
 * @param {string|null|undefined} sportRaw - the `sport` tag value
 * @param {Function} t - svelte-i18n translate function
 */
export function pitchIllustrationHtml(sportRaw, t) {
    if (!sportRaw) return '';
    const file = pitchImageFor(sportRaw);
    const img = file ? resolvedImage(file) : null;
    if (!img) return '';
    // Alt text in the visitor's language, not the raw tag value.
    const alt = sportRaw.split(';').map(s => s.trim()).filter(Boolean)
        .map(s => tl(t, `equipment.pitches.${s}`, s)).join(' / ');
    // Hides itself if the file has gone since the build, rather than leaving a
    // broken-image icon captioned "example image".
    const onerror = "this.closest('.device-img-wrap').style.display='none'";
    return `<div class="device-img-wrap">` +
        `<img src="${escapeHtml(img.url)}"` +
        ` alt="${escapeHtml(alt)}" loading="lazy" referrerpolicy="no-referrer"` +
        ` onerror="${onerror}" style="object-fit:contain;width:100%">` +
        `<p class="mb-0 text-muted" style="font-size:0.75rem;"><span class="bi bi-image"></span> ` +
        `${escapeHtml(t('popup.deviceSymbol'))}${imageCredit(img)}</p></div>`;
}

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

    const deviceKey = g('playground');
    const sportRaw  = g('sport');
    // The onerror no longer FALLS BACK to a second host — that was the
    // undisclosed request — but it still hides the wrapper. The build
    // established that the URL resolved when it ran; a file renamed
    // upstream since then would otherwise leave a broken-image icon
    // captioned "Symbolbild", which is worse than showing nothing.
    const onerror = "this.closest('.device-img-wrap').style.display='none'";

    // Pitches: the illustration shows whenever there is no photo, below the
    // attributes rather than instead of them. A pitch almost always carries
    // surface= at least, so the device rule ("only when nothing else is
    // known") would have hidden nearly every pitch illustration (#966).
    if (leisure === 'pitch' && !panoramaxUuid) html += pitchIllustrationHtml(sportRaw, t);

    // Fallback image for a device when no panoramax photo and no attributes
    if (!html && !panoramaxUuid) {
        if (deviceKey && objDevices[deviceKey]?.image) {
            const img = resolvedImage(objDevices[deviceKey].image);
            if (img) {
                const altText = tl(t, `equipment.devices.${deviceKey}`, objDevices[deviceKey].name_de ?? deviceKey);
                html = `<div class="device-img-wrap">` +
                    `<img src="${escapeHtml(img.url)}"` +
                    ` alt="${escapeHtml(altText)}" loading="lazy" referrerpolicy="no-referrer"` +
                    ` onerror="${onerror}" style="object-fit:contain;width:100%">` +
                    `<p class="mb-0 text-muted" style="font-size:0.75rem;"><span class="bi bi-image"></span> ` +
                    `${escapeHtml(t('popup.deviceSymbol'))}${imageCredit(img)}</p></div>`;
            }
        }
    }

    return { html, panoramaxUuid: panoramaxUuid || null, mcUrl };
}
