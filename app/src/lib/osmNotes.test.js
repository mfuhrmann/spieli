import assert from 'node:assert/strict';
import {
    buildNoteText, noteWebUrl, createNote, fetchNoteStatus, mapCompleteAddUrl,
    readOwnNotes, addOwnNote, updateOwnNoteStatus,
    canSendMore, countSent, SESSION_LIMIT, _resetSessionCount, DETAILS_MAX,
} from './osmNotes.js';

// --- note text -------------------------------------------------------------

{
    const text = buildNoteText({ equipment: ['slide', 'swing'], fenced: true, name: ' Schul\nhof ', details: 'hinter der Schule', lang: 'de' });
    assert.equal(text, [
        'Ein Besucher von spieli meldet hier einen Spielplatz, der in OpenStreetMap noch fehlt.',
        'Weitere Angaben: hinter der Schule',
        '',
        'Tags für die Spielplatzfläche:',
        'leisure=playground',
        // A line break in the name would split the copyable block.
        'name=Schul hof',
        '',
        // Chip order, not click order, so notes read alike.
        'Ausstattung (je ein eigener Punkt):',
        'playground=swing',
        'playground=slide',
        '',
        'Zaun (eigene Linie):',
        'barrier=fence',
        '',
        'Gemeldet ohne OSM-Konto. #spieli',
    ].join('\n'));
}
{
    // Nothing filled in is still a useful note: "there is a playground here".
    const text = buildNoteText({ lang: 'de' });
    assert.doesNotMatch(text, /name=|playground=|barrier=|Weitere/);
    assert.match(text, /\nleisure=playground\n/);
}
{
    // Unknown region language → English; unknown equipment keys are dropped.
    const text = buildNoteText({ equipment: ['slide', 'trampoline'], lang: 'sk' });
    assert.match(text, /^A spieli visitor reports/);
    assert.match(text, /\nplayground=slide\n/);
    assert.doesNotMatch(text, /trampoline/);
    assert.equal(buildNoteText({ details: 'x'.repeat(DETAILS_MAX + 50) }).includes('x'.repeat(DETAILS_MAX + 1)), false);
}

// --- URLs ------------------------------------------------------------------

assert.equal(noteWebUrl('https://api.openstreetmap.org', 7), 'https://www.openstreetmap.org/note/7');
assert.equal(noteWebUrl('https://master.apis.dev.openstreetmap.org/', 7), 'https://master.apis.dev.openstreetmap.org/note/7');
assert.equal(mapCompleteAddUrl(50.5, 9.67, 18.6), 'https://mapcomplete.org/playgrounds.html?z=19&lat=50.500000&lon=9.670000');

// --- createNote ------------------------------------------------------------

{
    let seen;
    const fetchImpl = async (url, opts) => {
        seen = { url, opts };
        return { ok: true, json: async () => ({ properties: { id: 42, status: 'open' } }) };
    };
    const note = await createNote({ lat: 50.123456789, lon: 9.5, text: 'hi', base: 'https://api.openstreetmap.org/', fetchImpl });
    assert.deepEqual(note, { id: 42, url: 'https://www.openstreetmap.org/note/42' });
    assert.equal(seen.url, 'https://api.openstreetmap.org/api/0.6/notes.json');
    assert.equal(seen.opts.method, 'POST');
    assert.equal(seen.opts.credentials, 'omit');
    assert.equal(seen.opts.body.get('lat'), '50.123457');
    assert.equal(seen.opts.body.get('text'), 'hi');
}
await assert.rejects(
    createNote({ lat: 1, lon: 1, text: 'x', base: 'b', fetchImpl: async () => ({ ok: false, status: 429 }) }),
    /429/,
);
await assert.rejects(
    createNote({ lat: 1, lon: 1, text: 'x', base: 'b', fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }),
    /no note id/,
);

// --- fetchNoteStatus -------------------------------------------------------

const answer = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });
assert.equal(await fetchNoteStatus(1, 'b', answer(200, { properties: { status: 'closed' } })), 'closed');
assert.equal(await fetchNoteStatus(1, 'b', answer(410, null)), 'hidden');
assert.equal(await fetchNoteStatus(1, 'b', answer(500, null)), null);
assert.equal(await fetchNoteStatus(1, 'b', async () => { throw new Error('offline'); }), null);

// --- own notes -------------------------------------------------------------

function memStorage() {
    const m = new Map();
    return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
}
{
    const s = memStorage();
    assert.deepEqual(readOwnNotes(s), []);
    addOwnNote({ id: 1, lat: 50, lon: 9, created: '2026-10-16', status: 'open', url: 'u' }, s);
    addOwnNote({ id: 1, lat: 50, lon: 9, created: '2026-10-16', status: 'open', url: 'u' }, s);
    assert.equal(readOwnNotes(s).length, 1);
    assert.equal(updateOwnNoteStatus(1, 'closed', s)[0].status, 'closed');
    for (let i = 2; i < 30; i++) addOwnNote({ id: i, lat: 50, lon: 9, created: '', status: 'open', url: '' }, s);
    assert.equal(readOwnNotes(s).length, 20);
    assert.equal(readOwnNotes(s).at(-1).id, 29);
}
{
    // Garbage and unavailable storage read as "no notes", never throw.
    const s = memStorage();
    s.setItem('spieli.ownNotes', '{not json');
    assert.deepEqual(readOwnNotes(s), []);
    s.setItem('spieli.ownNotes', JSON.stringify([{ id: 'x' }, { id: 3, lat: 1, lon: 2 }]));
    assert.equal(readOwnNotes(s).length, 1);
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    assert.deepEqual(readOwnNotes(broken), []);
    assert.doesNotThrow(() => addOwnNote({ id: 1, lat: 1, lon: 1 }, broken));
    assert.deepEqual(readOwnNotes(null), []);
}

// --- session limit ---------------------------------------------------------

{
    // In memory (no storage available).
    _resetSessionCount(null);
    for (let i = 0; i < SESSION_LIMIT; i++) { assert.equal(canSendMore(null), true); countSent(null); }
    assert.equal(canSendMore(null), false);
}
{
    // Survives a reload: a fresh module state reading the same sessionStorage.
    const s = { m: new Map(), getItem(k) { return this.m.get(k) ?? null; }, setItem(k, v) { this.m.set(k, v); }, removeItem(k) { this.m.delete(k); } };
    _resetSessionCount(s);
    countSent(s); countSent(s);
    assert.equal(s.getItem('spieli.notesSent'), '2');
    assert.equal(canSendMore(s), true);
    countSent(s);
    assert.equal(canSendMore(s), false);
}
{
    // A failing request carries its status, so the form can tell a refusal.
    const err = await createNote({ lat: 1, lon: 1, text: 'x', base: 'b', fetchImpl: async () => ({ ok: false, status: 403 }) }).catch(e => e);
    assert.equal(err.status, 403);
}

console.log('osmNotes tests passed');
