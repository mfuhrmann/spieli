import assert from 'node:assert/strict';
import { fetchReviews, fetchReviewsCached, invalidateReviews, mangroveSubject } from './reviews.js';

// Reviews live behind a collapsed accordion, so ReviewsPanel is destroyed on
// collapse and any cache inside it dies with it. These tests cover the
// module-level session cache that replaces it, and the failure handling the
// cache depends on being correct.

const LAT = 50.5528;
const LON = 9.6753;
const OSM = 12345;

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
    assert.notEqual(mangroveSubject(LAT, LON, 1), mangroveSubject(LAT, LON, 2));
    // Same playground, coordinates differing below the 5-decimal rounding →
    // one key, so a re-selection is a cache hit rather than a fresh request.
    assert.equal(mangroveSubject(LAT, LON, OSM), mangroveSubject(LAT + 0.0000001, LON, OSM));
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
    assert.equal(calls.length, 1);
    // The common case is a playground with no reviews; if that were not cached
    // the cache would miss on nearly every re-expand.
    assert.deepEqual(await fetchReviewsCached(LAT, LON, id), []);
    assert.equal(calls.length, 1);
}

// --- collapse and re-expand does not re-fetch ------------------------------
{
    reset();
    const id = 9003;
    respond = ok([{ payload: { rating: 80 } }]);
    const first = await fetchReviewsCached(LAT, LON, id);
    assert.equal(first.length, 1);
    assert.equal(calls.length, 1);

    // Re-expanding mounts a fresh component, which calls in again.
    const second = await fetchReviewsCached(LAT, LON, id);
    assert.equal(calls.length, 1, 're-expand must not issue a second request');
    assert.deepEqual(second, first);
}

// --- a different playground is a different key -----------------------------
{
    reset();
    respond = ok([{ payload: { rating: 60 } }]);
    await fetchReviewsCached(LAT, LON, 9004);
    await fetchReviewsCached(LAT, LON, 9005);
    assert.equal(calls.length, 2);
}

// --- a failed fetch is not cached, so the next expand retries --------------
{
    reset();
    const id = 9006;
    respond = () => ({ ok: false, status: 502, json: async () => ({}) });
    await assert.rejects(() => fetchReviewsCached(LAT, LON, id));
    assert.equal(calls.length, 1);

    respond = ok([{ payload: { rating: 100 } }]);
    const retried = await fetchReviewsCached(LAT, LON, id);
    assert.equal(retried.length, 1, 'a failure must not be cached');
    assert.equal(calls.length, 2);
}

// --- an aborted fetch is not cached either ---------------------------------
{
    reset();
    const id = 9007;
    respond = () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
    await assert.rejects(() => fetchReviewsCached(LAT, LON, id), { name: 'AbortError' });

    respond = ok([{ payload: { rating: 40 } }]);
    assert.equal((await fetchReviewsCached(LAT, LON, id)).length, 1);
    assert.equal(calls.length, 2);
}

// --- submission invalidates that one subject, and only it ------------------
{
    reset();
    const submitted = 9008;
    const other = 9009;
    respond = ok([{ payload: { rating: 20 } }]);
    await fetchReviewsCached(LAT, LON, submitted);
    await fetchReviewsCached(LAT, LON, other);
    assert.equal(calls.length, 2);

    invalidateReviews(LAT, LON, submitted);

    respond = ok([{ payload: { rating: 20 } }, { payload: { rating: 100 } }]);
    const after = await fetchReviewsCached(LAT, LON, submitted);
    assert.equal(after.length, 2, 'the visitor must see their own review');
    assert.equal(calls.length, 3);

    // The unrelated playground keeps its cached list.
    await fetchReviewsCached(LAT, LON, other);
    assert.equal(calls.length, 3);
}

// --- moderation actions stay filtered out through the cache ----------------
{
    reset();
    respond = ok([{ payload: { rating: 80 } }, { payload: { action: 'delete' } }]);
    const list = await fetchReviewsCached(LAT, LON, 9010);
    assert.equal(list.length, 1);
    assert.equal(list[0].payload.rating, 80);
}

console.log('reviews.test.js: all assertions passed');
