// Generates an HTML detail string for a single equipment feature.
// Ported from js/popup.js → getEquipmentAttributes / getEquipmentAttributesFromProps.

import { objDevices, objFitnessStation } from './objPlaygroundEquipment.js';
import { escapeHtml } from './utils.js';

const objMaterial = {
    wood:'Holz', metal:'Metall', steel:'Stahl', aluminium:'Aluminium',
    plastic:'Kunststoff', stone:'Stein', sandstone:'Sandstein', concrete:'Beton',
    brick:'Ziegelstein', granite:'Granit', rope:'Seil', rubber:'Gummi',
    chain:'Kette', sand:'Sand',
};

const objPlaygroundTheme = {
    animal:'Tier', bicycle:'Fahrrad', boat:'Boot', camel:'Kamel', car:'Auto',
    carrot:'Karotte', castle:'Burg', construction:'Baustelle', dragon:'Drache',
    duck:'Ente', dungeon:'Burgverlies', elephant:'Elefant', farm:'Farm',
    fish:'Fisch', flower:'Blume', helicopter:'Hubschrauber', horse:'Pferd',
    house:'Haus', ice_cream:'Eis', jungle:'Jungle', lama:'Lama',
    lighthouse:'Leuchtturm', locomotive:'Lokomotive', mammoth:'Mammut',
    mushroom:'Pilz', ocean:'Ozean', plane:'Flugzeug', rainbow:'Regenbogen',
    rock:'Felsen', seal:'Robbe', sheep:'Schaf', ship:'Schiff', snake:'Schlange',
    sport:'Sport', tent:'Zelt', tower:'Turm', train:'Eisenbahn', water:'Wasser',
    whale:'Wal', windmill:'Windmühle',
};

const objStatus = {
    ok:'OK', broken:'kaputt', missing_beam:'kaputt',
    out_of_order:'außer Betrieb', locked:'verschlossen', blocked:'blockiert',
};

const objSport = {
    'soccer;basketball':'Fußball, Basketball', 'basketball;soccer':'Fußball, Basketball',
    athletics:'Leichtathletik', beachvolleyball:'Beachvolleyball', bmx:'BMX',
    boules:'Boule', chess:'Schach', climbing:'Klettern', field_hockey:'Hockey',
    fitness:'Fitness', gymnastics:'Gymnastik', multi:'verschiedene',
    nine_mens_morris:'Mühle', running:'Laufsport', skateboard:'Skateboarding',
    table_soccer:'Tischfußball', tennis:'Tennis', toboggan:'Rodeln',
    volleyball:'Volleyball',
};

const objSurface = {
    acrylic:'Acrylharz', artificial_turf:'Kunstrasen', asphalt:'Asphalt',
    clay:'Asche', cobblestone:'Kopfsteinpflaster', compacted:'verdichtet',
    concrete:'Beton', dirt:'Erde', earth:'Erde', fine_gravel:'Splitt',
    grass:'Gras', gravel:'Schotter', ground:'Erde', metal:'Metall',
    mud:'Schlamm', paved:'versiegelt', paving_stones:'Pflastersteine',
    pebblestone:'Kies', plastic:'Kunststoff', rock:'Stein', rubber:'Gummi',
    sand:'Sand', tartan:'Tartan', unpaved:'unversiegelt', wood:'Holz',
    woodchips:'Holzhackschnitzel',
};

const objGenus = {
    Abies:'Tanne', Acer:'Ahorn', Aesculus:'Rosskastanie', Betula:'Birke',
    Carpinus:'Hainbuche', Castanea:'Kastanie', Catalpa:'Trompetenbaum',
    Fagus:'Buche', Fraxinus:'Esche', Ginkgo:'Ginkgo', Juglans:'Walnuss',
    Larix:'Lärche', Malus:'Apfel', Picea:'Fichte', Pinus:'Kiefer',
    Platanus:'Platane', Populus:'Pappel', Prunus:'Kirsche', Quercus:'Eiche',
    Robinia:'Robinie', Salix:'Weide', Sorbus:'Mehlbeere', Taxus:'Eibe',
    Tilia:'Linde',
};

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
 * @returns {{ html: string, panoramaxUuid: string|null }}
 */
export function getEquipmentAttributesFromProps(props) {
    const g = key => props[key];
    const content = [];

    const theme = g('playground:theme');
    if (theme && theme !== 'playground')
        content.push(`Motiv: ${objPlaygroundTheme[theme] ?? escapeHtml(theme)}`);

    if (g('capacity'))       content.push(`Plätze: ${escapeHtml(String(g('capacity')))}`);
    if (g('capacity:baby'))  content.push(`Babyplätze: ${escapeHtml(String(g('capacity:baby')))}`);

    for (const [tag, label] of [['height','Höhe'],['width','Breite']]) {
        let v = g(tag);
        if (v) {
            v = v.replace(' ', '').toLowerCase();
            if (v.includes('cm')) { v = v.replace('cm',''); if (!isNaN(v)) v = v / 100; }
            content.push((`${label}: ${escapeHtml(String(v))}` + (!isNaN(v) ? ' Meter' : '')).replace('.', ','));
        }
    }
    const len = g('length');
    if (len) content.push(`Länge: ${escapeHtml(String(len).replace('.', ','))} Meter`);

    const pump_status = g('pump:status');
    if (pump_status) content.push(`Status: ${objStatus[pump_status] ?? escapeHtml(pump_status)}`);

    const covered = g('covered');
    if (covered === 'yes') content.push('überdacht');
    else if (covered === 'no') content.push('nicht überdacht');

    const material = g('material');
    if (material) content.push(`Material: ${objMaterial[material] ?? escapeHtml(material)}`);

    if (g('baby') === 'yes') content.push('für Babys geeignet');
    if (g('provided_for:toddler') === 'yes') content.push('für Kleinkinder geeignet');

    const wc = g('wheelchair');
    if (wc === 'yes') content.push('Rollstuhlgerecht');
    else if (wc === 'limited') content.push('Eingeschränkt rollstuhlgerecht');
    else if (wc === 'no') content.push('Nicht rollstuhlgerecht');

    if (g('blind') === 'yes') content.push('Für sehbehinderte Personen geeignet');

    if (pump_status && g('check_date')) content.push(`Zuletzt überprüft: ${escapeHtml(g('check_date'))}`);

    const backrest = g('backrest');
    if (backrest === 'yes') content.push('mit Rückenlehne');
    else if (backrest === 'no') content.push('ohne Rückenlehne');

    const sport = g('sport');
    if (sport && !['table_tennis','soccer','basketball'].includes(sport))
        content.push(`Sportart: ${objSport[sport] ?? escapeHtml(sport)}`);

    const surface = g('surface');
    if (surface) content.push(`Oberflächenbelag: ${objSurface[surface] ?? escapeHtml(surface)}`);

    const genus = g('genus');
    if (genus) content.push(`Baumart: ${objGenus[genus] ?? escapeHtml(genus)}`);

    const diameter_crown = g('diameter_crown');
    if (diameter_crown) content.push(`Kronendurchmesser: ${escapeHtml(String(diameter_crown))} Meter`);

    // Find Panoramax UUID on the device
    let panoramaxUuid = g('panoramax') || g('panoramax:0');
    for (let pi = 1; pi <= 9 && !panoramaxUuid; pi++) panoramaxUuid = g(`panoramax:${pi}`);

    const leisure  = g('leisure');
    const osmType  = ({ N:'node', W:'way', R:'relation' })[g('osm_type')] ?? 'node';
    const osmId    = g('osm_id');
    const mcTheme  = (leisure === 'fitness_station' || leisure === 'pitch') ? 'sports' : 'playgrounds';
    const mcUrl    = `https://mapcomplete.org/${mcTheme}.html` + (osmId ? `#${osmType}/${osmId}` : '');
    const addPhotoLink = `<p class="mb-0 mt-1"><a href="${mcUrl}" target="_blank" rel="noopener" style="font-size:0.75rem;"><span class="bi bi-camera-fill"></span> Foto hinzufügen</a></p>`;

    let html = '';
    if (content.length) {
        html += '<ul>' + content.map(c => `<li>${c}</li>`).join('') + '</ul>';
    }

    // Fallback image when no panoramax photo and no attributes
    if (!html && !panoramaxUuid) {
        const onerror = `if(this.dataset.fallback){this.src=this.dataset.fallback;delete this.dataset.fallback}else{this.parentElement.style.display='none'}`;
        const deviceKey = g('playground');
        const sportRaw  = g('sport');
        if (deviceKey && objDevices[deviceKey]?.image) {
            const imgFile = objDevices[deviceKey].image.replace(/^File:/, '').replace(/ /g, '_');
            html = `<div class="device-img-wrap">` +
                `<img src="https://commons.wikimedia.org/wiki/Special:FilePath/${imgFile}?width=800"` +
                ` data-fallback="https://wiki.openstreetmap.org/wiki/Special:FilePath/${imgFile}"` +
                ` alt="${escapeHtml(objDevices[deviceKey].name_de)}" style="object-fit:contain;width:100%" onerror="${onerror}">` +
                `<p class="mb-0 text-muted" style="font-size:0.75rem;"><span class="bi bi-image"></span> Symbolbild</p></div>`;
        } else if (leisure === 'pitch' && sportRaw && pitchImages[sportRaw]) {
            const imgFile = pitchImages[sportRaw].replace(/^File:/, '').replace(/ /g, '_');
            html = `<div class="device-img-wrap">` +
                `<img src="https://commons.wikimedia.org/wiki/Special:FilePath/${imgFile}?width=800"` +
                ` data-fallback="https://wiki.openstreetmap.org/wiki/Special:FilePath/${imgFile}"` +
                ` alt="${escapeHtml(sportRaw)}" style="object-fit:contain;width:100%" onerror="${onerror}"></div>`;
        }
    }

    if (!panoramaxUuid) html += addPhotoLink;
    return { html, panoramaxUuid: panoramaxUuid || null };
}
