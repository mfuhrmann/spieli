// Reporting a playground that is not in OpenStreetMap yet (#1000).
//
// A report becomes an OSM note: a public pin on openstreetmap.org that local
// mappers review. Notes can still be created without an account, which is the
// whole point — MapComplete needs one. spieli stores nothing server-side; the
// browser posts the note itself, and only when the visitor presses Send.
//
// The note is read by mappers, not by the visitor, so its text is written in
// the region's language (`regionLang`) rather than the UI's, and names the
// OSM tags so a mapper can act on it without guessing.

/** Equipment the form offers as chips, keyed by their `playground=*` value. */
export const REPORT_EQUIPMENT = ['swing', 'slide', 'sandpit', 'climbingframe', 'seesaw', 'springy'];

// Mapper-facing note text. Not UI strings: they never render in spieli, and
// they must follow the region, not the visitor, so they live here rather than
// in locales/. Unknown region languages fall back to English.
const NOTE_TEXT = {
    de: {
        intro: 'Ein Besucher von spieli meldet hier einen Spielplatz, der in OpenStreetMap noch fehlt.',
        details: 'Weitere Angaben',
        areaTags: 'Tags für die Spielplatzfläche',
        equipmentTags: 'Ausstattung (je ein eigener Punkt)',
        fenceTags: 'Zaun (eigene Linie)',
        source: 'Gemeldet ohne OSM-Konto. #spieli',
    },
    en: {
        intro: 'A spieli visitor reports a playground here that is missing from OpenStreetMap.',
        details: 'More details',
        areaTags: 'Tags for the playground area',
        equipmentTags: 'Equipment (one point each)',
        fenceTags: 'Fence (its own way)',
        source: 'Reported without an OSM account. #spieli',
    },
};

/** Free-text cap. OSM accepts far more; a hint does not need it. */
export const DETAILS_MAX = 500;
export const NAME_MAX = 100;

/**
 * Builds the note text a mapper will read.
 * @param {{ equipment?: string[], fenced?: boolean, name?: string, details?: string, lang?: string }} report
 */
export function buildNoteText({ equipment = [], fenced = false, name = '', details = '', lang = 'en' } = {}) {
    const t = NOTE_TEXT[lang] ?? NOTE_TEXT.en;
    // Tags go one per line, in key=value form, so a mapper can select a block
    // and paste it straight into an editor's text view (iD, JOSM).
    const lines = [t.intro];
    const cleanDetails = details.trim().slice(0, DETAILS_MAX);
    if (cleanDetails) lines.push(`${t.details}: ${cleanDetails}`);
    // A name is a single tag value; a line break in it would split the block.
    const cleanName = name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    lines.push('', `${t.areaTags}:`, 'leisure=playground');
    if (cleanName) lines.push(`name=${cleanName}`);
    const known = REPORT_EQUIPMENT.filter(k => equipment.includes(k));
    if (known.length) lines.push('', `${t.equipmentTags}:`, ...known.map(k => `playground=${k}`));
    if (fenced) lines.push('', `${t.fenceTags}:`, 'barrier=fence');
    lines.push('', t.source);
    return lines.join('\n');
}

function trimBase(base) {
    return String(base || '').replace(/\/+$/, '');
}

/**
 * The page a visitor can open to follow their note. The production API lives
 * on its own host, but notes are shown on the website; every other server
 * (the dev sandbox, a self-hosted one) serves both from one origin.
 */
export function noteWebUrl(base, id) {
    const origin = trimBase(base).replace('://api.openstreetmap.org', '://www.openstreetmap.org');
    return `${origin}/note/${id}`;
}

/**
 * Creates an anonymous note. Resolves to `{ id, url }`; throws on failure.
 * @param {{ lat: number, lon: number, text: string, base: string, fetchImpl?: typeof fetch }} args
 */
export async function createNote({ lat, lon, text, base, fetchImpl = fetch }) {
    const body = new URLSearchParams({
        lat: lat.toFixed(6),
        lon: lon.toFixed(6),
        text,
    });
    const res = await fetchImpl(`${trimBase(base)}/api/0.6/notes.json`, {
        method: 'POST',
        body,
        // No cookies: the note is anonymous even for a visitor who happens to
        // be logged in to OSM in this browser.
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
    });
    if (!res.ok) {
        const err = new Error(`OSM notes API answered ${res.status}`);
        err.status = res.status;
        throw err;
    }
    const data = await res.json();
    const id = data?.properties?.id;
    if (!Number.isInteger(id)) throw new Error('OSM notes API returned no note id');
    return { id, url: noteWebUrl(base, id) };
}

/**
 * A note's current status: 'open' | 'closed' | 'hidden', or null when it
 * could not be checked. Hidden notes (removed by a moderator) answer 410.
 */
export async function fetchNoteStatus(id, base, fetchImpl = fetch) {
    try {
        const res = await fetchImpl(`${trimBase(base)}/api/0.6/notes/${id}.json`, {
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
        });
        if (res.status === 410) return 'hidden';
        if (!res.ok) return null;
        const status = (await res.json())?.properties?.status;
        return status === 'open' || status === 'closed' ? status : null;
    } catch {
        return null;
    }
}

/** MapComplete's playground theme, opened at a spot, for visitors with an OSM account. */
export function mapCompleteAddUrl(lat, lon, zoom = 19) {
    return `https://mapcomplete.org/playgrounds.html?z=${Math.round(zoom)}&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`;
}

// --- The visitor's own notes ------------------------------------------------
// Kept in this browser only, so the visitor can see what became of a hint.
// A convenience, not state anyone relies on: every access tolerates storage
// being unavailable.

const OWN_KEY = 'spieli.ownNotes';
const OWN_MAX = 20;

function storageOrNull() {
    try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** @returns {Array<{ id: number, lat: number, lon: number, created: string, status: string, url: string }>} */
export function readOwnNotes(storage = storageOrNull()) {
    try {
        const list = JSON.parse(storage?.getItem(OWN_KEY) ?? '[]');
        return Array.isArray(list)
            ? list.filter(n => Number.isInteger(n?.id) && Number.isFinite(n?.lat) && Number.isFinite(n?.lon))
            : [];
    } catch {
        return [];
    }
}

function writeOwnNotes(list, storage) {
    try { storage?.setItem(OWN_KEY, JSON.stringify(list.slice(-OWN_MAX))); } catch { /* storage full or blocked */ }
}

export function addOwnNote(note, storage = storageOrNull()) {
    const list = readOwnNotes(storage).filter(n => n.id !== note.id);
    list.push(note);
    writeOwnNotes(list, storage);
    return readOwnNotes(storage);
}

export function updateOwnNoteStatus(id, status, storage = storageOrNull()) {
    const list = readOwnNotes(storage).map(n => (n.id === id ? { ...n, status } : n));
    writeOwnNotes(list, storage);
    return list;
}

// --- Session limit ----------------------------------------------------------
// The one spam guard. Traffic is low, and a visitor reporting more than a
// handful of playgrounds in one sitting is better served by MapComplete.
// Kept in sessionStorage so a reload does not reset it; falls back to memory
// where storage is unavailable.

export const SESSION_LIMIT = 3;
const SENT_KEY = 'spieli.notesSent';
let sentInMemory = 0;

function sessionOrNull() {
    try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

function sentCount(storage = sessionOrNull()) {
    try {
        const n = Number.parseInt(storage?.getItem(SENT_KEY) ?? '', 10);
        return Number.isFinite(n) ? Math.max(n, sentInMemory) : sentInMemory;
    } catch {
        return sentInMemory;
    }
}

export function canSendMore(storage = sessionOrNull()) { return sentCount(storage) < SESSION_LIMIT; }

export function countSent(storage = sessionOrNull()) {
    sentInMemory = sentCount(storage) + 1;
    try { storage?.setItem(SENT_KEY, String(sentInMemory)); } catch { /* memory only */ }
}

export function _resetSessionCount(storage = sessionOrNull()) {
    sentInMemory = 0;
    try { storage?.removeItem(SENT_KEY); } catch { /* nothing to reset */ }
}
