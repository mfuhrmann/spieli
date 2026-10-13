import assert from 'node:assert/strict';
import { fetchReviews, fetchReviewsCached, invalidateReviews, addOwnReview, readSubjects, writeSubject, reviewRadius, radiusFromExtent } from './reviews.js';

// Reviews live behind a collapsed accordion, so ReviewsPanel is destroyed on
// collapse and any cache inside it dies with it. These tests cover the
// module-level session cache that replaces it, and the failure handling the
// cache depends on being correct.

const LAT = 50.5528;
const LON = 9.6753;
const OSM = 12345;
// An unnamed playground is read from two subjects (spieli's old label and
// `playground`), so one fetch is two requests (#914).
const PER = 2;

// --- stub harness ----------------------------------------------------------

let calls = [];
let respond = () => ({ ok: true, json: async () => ({ reviews: [] }) });

globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return respond();
};

function reset() {
    calls = [];
    // Each test uses a distinct subject so it gets a clean cache entry without
    // the module needing a test-only cache-clearing export.
    respond = () => ({ ok: true, json: async () => ({ reviews: [] }) });
}

const ok = (reviews) => () => ({ ok: true, json: async () => ({ reviews }) });

// --- the subject URI is the cache key, and it distinguishes playgrounds -----
{
    assert.notDeepEqual(readSubjects(LAT, LON, 1), readSubjects(LAT, LON, 2));
    // Same playground, coordinates differing below the 5-decimal rounding →
    // one key, so a re-selection is a cache hit rather than a fresh request.
    assert.deepEqual(readSubjects(LAT, LON, OSM), readSubjects(LAT + 0.0000001, LON, OSM));
}

// --- a non-OK response is an error, not an empty review list ---------------
// A subject with no reviews answers 200 with {"reviews":[]}, verified against
// the live API. So returning [] on a 5xx would render an outage as "no reviews
// yet" and, worse, let the cache pin that for the session.
{
    reset();
    respond = () => ({ ok: false, status: 503, json: async () => ({}) });
    await assert.rejects(() => fetchReviews(LAT, LON, 9001), /503/);
}

// --- a 200 with an empty list is a legitimate, cacheable answer ------------
{
    reset();
    const id = 9002;
    assert.deepEqual(await fetchReviewsCached(LAT, LON, id), []);
    assert.equal(calls.length, PER);
    // The common case is a playground with no reviews; if that were not cached
    // the cache would miss on nearly every re-expand.
    assert.deepEqual(await fetchReviewsCached(LAT, LON, id), []);
    assert.equal(calls.length, PER);
}

// --- collapse and re-expand does not re-fetch ------------------------------
{
    reset();
    const id = 9003;
    respond = ok([{ payload: { rating: 80 } }]);
    const first = await fetchReviewsCached(LAT, LON, id);
    assert.equal(first.length, 1);
    assert.equal(calls.length, PER);

    // Re-expanding mounts a fresh component, which calls in again.
    const second = await fetchReviewsCached(LAT, LON, id);
    assert.equal(calls.length, PER, 're-expand must not issue a second request');
    assert.deepEqual(second, first);
}

// --- two callers while the first request is in flight share it -------------
// A fast collapse-and-re-expand mounts a second component before the first
// response lands. Caching the resolved value would miss here and issue a
// second request, so the cache holds the promise.
{
    reset();
    const id = 9031;
    // One pending response per subject request; release them all at once.
    const pendingRes = [];
    const release = () => pendingRes.forEach(r => r());
    respond = () => new Promise(res => { pendingRes.push(() => res({ ok: true, json: async () => ({ reviews: [{ payload: { rating: 80 } }] }) })); });

    const a = fetchReviewsCached(LAT, LON, id);
    const b = fetchReviewsCached(LAT, LON, id);
    assert.equal(calls.length, PER, 'a concurrent caller must join the in-flight request');
    release();
    assert.deepEqual(await a, await b);
    assert.equal(calls.length, PER);
}

// --- a rejected in-flight promise is not left in the cache -----------------
{
    reset();
    const id = 9032;
    const pendingRej = [];
    const fail = () => pendingRej.forEach(r => r());
    respond = () => new Promise((_, rej) => { pendingRej.push(() => rej(new Error('Mangrove responded 503'))); });

    const pending = fetchReviewsCached(LAT, LON, id);
    fail();
    await assert.rejects(() => pending, /503/);

    respond = ok([{ payload: { rating: 60 } }]);
    assert.equal((await fetchReviewsCached(LAT, LON, id)).length, 1, 'a rejected promise must not be replayed');
    assert.equal(calls.length, 2 * PER);
}

// --- a different playground is a different key -----------------------------
{
    reset();
    respond = ok([{ payload: { rating: 60 } }]);
    await fetchReviewsCached(LAT, LON, 9004);
    await fetchReviewsCached(LAT, LON, 9005);
    assert.equal(calls.length, 2 * PER);
}

// --- a failed fetch is not cached, so the next expand retries --------------
{
    reset();
    const id = 9006;
    respond = () => ({ ok: false, status: 502, json: async () => ({}) });
    await assert.rejects(() => fetchReviewsCached(LAT, LON, id));
    assert.equal(calls.length, PER);

    respond = ok([{ payload: { rating: 100 } }]);
    const retried = await fetchReviewsCached(LAT, LON, id);
    assert.equal(retried.length, 1, 'a failure must not be cached');
    assert.equal(calls.length, 2 * PER);
}

// --- an aborted fetch is not cached either ---------------------------------
{
    reset();
    const id = 9007;
    respond = () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
    await assert.rejects(() => fetchReviewsCached(LAT, LON, id), { name: 'AbortError' });

    respond = ok([{ payload: { rating: 40 } }]);
    assert.equal((await fetchReviewsCached(LAT, LON, id)).length, 1);
    assert.equal(calls.length, 2 * PER);
}

// --- submission invalidates that one subject, and only it ------------------
{
    reset();
    const submitted = 9008;
    const other = 9009;
    respond = ok([{ payload: { rating: 20 } }]);
    await fetchReviewsCached(LAT, LON, submitted);
    await fetchReviewsCached(LAT, LON, other);
    assert.equal(calls.length, 2 * PER);

    invalidateReviews(LAT, LON, submitted);

    respond = ok([{ payload: { rating: 20 } }, { payload: { rating: 100 } }]);
    const after = await fetchReviewsCached(LAT, LON, submitted);
    assert.equal(after.length, 2, 'the visitor must see their own review');
    assert.equal(calls.length, 3 * PER);

    // The unrelated playground keeps its cached list.
    await fetchReviewsCached(LAT, LON, other);
    assert.equal(calls.length, 3 * PER);
}

// --- moderation actions stay filtered out through the cache ----------------
{
    reset();
    respond = ok([{ payload: { rating: 80 } }, { payload: { action: 'delete' } }]);
    const list = await fetchReviewsCached(LAT, LON, 9010);
    assert.equal(list.length, 1);
    assert.equal(list[0].payload.rating, 80);
}

// --- #914: the shared subjects ---------------------------------------------
// Read: spieli's old label, the generic `playground`, and the name. Write: the
// name, else `playground` — what MapComplete and mangrove.reviews read.
{
    const q = sub => decodeURIComponent(/[?&]q=([^&]*)/.exec(sub)[1]);
    assert.deepEqual(readSubjects(LAT, LON, OSM).map(q), [`osm_playground_${OSM}`, 'playground']);
    assert.deepEqual(readSubjects(LAT, LON, OSM, { name: 'Spielplatz Am See' }).map(q),
        [`osm_playground_${OSM}`, 'playground', 'Spielplatz Am See']);
    // Percent-encoded like other clients store it; a raw & would cut the label.
    assert.match(readSubjects(LAT, LON, OSM, { name: 'Sand & Wasser' })[2], /q=Sand%20%26%20Wasser&u=/);
    // A playground literally named "Playground" is the generic label already.
    assert.equal(readSubjects(LAT, LON, OSM, { name: 'playground' }).length, 2);

    assert.match(writeSubject(LAT, LON), /\?q=playground&u=50$/);
    assert.match(writeSubject(LAT, LON, { name: 'Grezzbachpark', radiusM: 37.4 }), /\?q=Grezzbachpark&u=37$/);
    // Apostrophes stay raw, as in the stored data (`q=McDonald's`).
    assert.match(writeSubject(LAT, LON, { name: "Lito's Spielplatz" }), /q=Lito's%20Spielplatz&/);
    // spieli's own legacy label keeps the u=50 its reviews were written with,
    // whatever the playground's size.
    assert.match(readSubjects(LAT, LON, OSM, { radiusM: 12 })[0], /q=osm_playground_12345&u=50$/);
    assert.match(readSubjects(LAT, LON, OSM, { radiusM: 12 })[1], /q=playground&u=12$/);
    // The written subject is among the read ones, so a submitted review shows.
    for (const name of [undefined, 'Grezzbachpark']) {
        assert.ok(readSubjects(LAT, LON, OSM, { name, radiusM: 30 }).includes(writeSubject(LAT, LON, { name, radiusM: 30 })));
    }

    assert.equal(reviewRadius(undefined), 50);
    assert.equal(reviewRadius(3), 10);
    // Capped at 50: shared labels must not reach a neighbouring playground.
    assert.equal(reviewRadius(400), 50);
    // ~40 m × 30 m box at 50.5° N → half-diagonal ≈ 25 m on the ground.
    const r = radiusFromExtent([1077000, 6537000, 1077000 + 40 / Math.cos(50.5 * Math.PI / 180), 6537000 + 30 / Math.cos(50.5 * Math.PI / 180)]);
    assert.ok(Math.abs(r - 25) < 0.5, `radiusFromExtent ${r}`);
    assert.equal(radiusFromExtent(null), null);
}

// --- one review matching several labels is shown once ----------------------
{
    reset();
    const shared = { signature: 'sig-a', payload: { rating: 100, iat: 2 } };
    const own = { signature: 'sig-b', payload: { rating: 60, iat: 1 } };
    respond = ok([shared, own]);
    const list = await fetchReviews(LAT, LON, 9011, undefined, { name: 'Park' });
    assert.equal(calls.length, 3, 'one request per subject');
    assert.deepEqual(list.map(r => r.signature), ['sig-a', 'sig-b'], 'deduplicated, newest first');
}

// --- one failing label does not hide the others' reviews ------------------
{
    reset();
    let n = 0;
    respond = () => (++n === 2 ? { ok: false, status: 503, json: async () => ({}) }
                               : { ok: true, json: async () => ({ reviews: [{ signature: 's', payload: { rating: 80 } }] }) });
    assert.equal((await fetchReviews(LAT, LON, 9012)).length, 1);
}

// --- the visitor's own review shows at once, without a re-read -------------
// A re-read would go through the /ext/mangrove/ proxy cache and miss it.
{
    reset();
    const id = 9013;
    respond = ok([{ signature: 'old', payload: { rating: 40, iat: 1 } }]);
    await fetchReviewsCached(LAT, LON, id);
    const before = calls.length;
    const own = { signature: 'mine', payload: { rating: 100, iat: 2 } };
    const list = await addOwnReview(LAT, LON, id, {}, own);
    assert.deepEqual(list.map(r => r.signature), ['mine', 'old']);
    assert.deepEqual((await fetchReviewsCached(LAT, LON, id)).map(r => r.signature), ['mine', 'old']);
    assert.equal(calls.length, before, 'no re-read');
    // A failed earlier read still yields the own review.
    reset();
    respond = () => ({ ok: false, status: 503, json: async () => ({}) });
    await assert.rejects(() => fetchReviewsCached(LAT, LON, 9014));
    assert.deepEqual((await addOwnReview(LAT, LON, 9014, {}, own)).map(r => r.signature), ['mine']);
}

console.log('reviews.test.js: all assertions passed');
