// Mangrove.reviews integration — pure functions (no DOM).
// Identity is a P-256 keypair stored in localStorage.
// Subject URI: geo:{lat},{lon}?q={label}&u={radius m} — see the Subject section
// Rating scale: 0–100 (we show 1–5 stars = 20/40/60/80/100)

import { mangroveApiUrl as MANGROVE_API } from './config.js';

const LS_KEY = 'spieli-mangrove-keypair';
const LS_KEY_LEGACY = 'spielplatzkarte-mangrove-keypair';

// ── Key management ─────────────────────────────────────────────────────────

function migrateLegacyKey() {
    const legacy = localStorage.getItem(LS_KEY_LEGACY);
    if (legacy && !localStorage.getItem(LS_KEY)) {
        localStorage.setItem(LS_KEY, legacy);
        localStorage.removeItem(LS_KEY_LEGACY);
    }
}

export async function loadOrGenerateKeypair() {
    migrateLegacyKey();
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
        const { priv, pub } = JSON.parse(stored);
        const privateKey = await crypto.subtle.importKey(
            'jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
        const publicKey  = await crypto.subtle.importKey(
            'jwk', pub,  { name: 'ECDSA', namedCurve: 'P-256' }, true,  ['verify']);
        return { privateKey, publicKey };
    }
    // Generate extractable only long enough to export to localStorage, then
    // re-import with extractable:false so the in-memory key cannot be re-exported.
    // The JWK in localStorage is an accepted risk for pseudonymous Mangrove identity.
    const tempKp = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const priv = await crypto.subtle.exportKey('jwk', tempKp.privateKey);
    const pub  = await crypto.subtle.exportKey('jwk', tempKp.publicKey);
    localStorage.setItem(LS_KEY, JSON.stringify({ priv, pub }));
    const privateKey = await crypto.subtle.importKey(
        'jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const publicKey  = await crypto.subtle.importKey(
        'jwk', pub,  { name: 'ECDSA', namedCurve: 'P-256' }, true,  ['verify']);
    return { privateKey, publicKey };
}

async function publicKeyToPem(publicKey) {
    const spki = await crypto.subtle.exportKey('spki', publicKey);
    const b64  = btoa(String.fromCharCode(...new Uint8Array(spki)));
    return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
}

// ── JWT helpers ────────────────────────────────────────────────────────────

function b64url(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    return btoa(String.fromCharCode(...bytes))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlBytes(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// ── Subject URI ────────────────────────────────────────────────────────────
// Mangrove matches a geo subject on the coordinate (within the radius) AND on
// the `q` label, case-insensitively and in full. spieli used to read and write
// `q=osm_playground_<osmId>`, a label no other client uses, so reviews written
// in MapComplete or on mangrove.reviews never appeared here and ours never
// appeared there (#914). Verified against the live API on way/1138487459: one
// MapComplete review under `q=playground`, none under spieli's label.
//
// So: READ every label a playground's reviews may be filed under — spieli's
// old one (its reviews must stay visible), the generic `playground` that
// MapComplete uses for unnamed features, and the name it uses for named ones —
// and merge them. WRITE in the shared format: the name if there is one, else
// `playground`. Labels are percent-encoded, as other clients store them
// (`q=Ses%20Taronges`); a raw `&` would end the label early.
//
// The radius is the playground's own size, like MapComplete derives it, so a
// small playground does not pick up a neighbour's `q=playground` review.

const DEFAULT_RADIUS_M = 50;

export function reviewRadius(radiusM) {
    return Number.isFinite(radiusM) ? Math.min(100, Math.max(10, Math.round(radiusM))) : DEFAULT_RADIUS_M;
}

function geoSubject(lat, lon, q, radiusM) {
    return `geo:${lat.toFixed(5)},${lon.toFixed(5)}?q=${encodeURIComponent(q)}&u=${reviewRadius(radiusM)}`;
}

/** The subjects a playground's reviews are read from, most specific first. */
export function readSubjects(lat, lon, osmId, { name, radiusM } = {}) {
    const labels = [];
    if (osmId) labels.push(`osm_playground_${osmId}`);
    labels.push('playground');
    const n = name?.trim();
    // The API matches labels case-insensitively, so a playground literally
    // named "Playground" is already covered by the generic label.
    if (n && n.toLowerCase() !== 'playground') labels.push(n);
    return labels.map(q => geoSubject(lat, lon, q, radiusM));
}

/** The subject a new review is written to — the format other clients read. */
export function writeSubject(lat, lon, { name, radiusM } = {}) {
    return geoSubject(lat, lon, name?.trim() || 'playground', radiusM);
}

// ── Fetch reviews ──────────────────────────────────────────────────────────

async function fetchSubject(sub, signal) {
    const url = `${MANGROVE_API}/reviews?sub=${encodeURIComponent(sub)}&latest_edits_only=true`;
    const res = await fetch(url, { signal });
    // A subject with no reviews answers 200 with an empty list, so a non-OK
    // status is always a real failure. Returning [] here instead would render
    // an outage as "no reviews yet — be the first!", and would let the session
    // cache below pin that wrong answer for the rest of the page's life.
    if (!res.ok) throw new Error(`Mangrove responded ${res.status}`);
    const data = await res.json();
    return data.reviews ?? [];
}

export async function fetchReviews(lat, lon, osmId, signal, opts = {}) {
    const lists = await Promise.all(
        readSubjects(lat, lon, osmId, opts).map(sub => fetchSubject(sub, signal)));
    // One review can match more than one label; its signature identifies it.
    const seen = new Set();
    const merged = [];
    for (const r of lists.flat()) {
        if (r.payload?.action) continue;
        const key = r.signature ?? JSON.stringify(r.payload);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(r);
    }
    return merged.sort((a, b) => (b.payload?.iat ?? 0) - (a.payload?.iat ?? 0));
}

// ── Session cache ──────────────────────────────────────────────────────────
// The reviews section is a collapsed accordion, so ReviewsPanel is created on
// expand and DESTROYED on collapse. Any cache held inside the component dies
// with it, and every re-expand of the same playground is another request to a
// free non-profit API for an answer we already have.
//
// Keyed on the Mangrove subject URIs, not the OSM id alone: they are what the
// requests are addressed to, and they also carry the coordinates.
// Deliberately in memory and not localStorage — this exists to avoid a repeat
// request during one page's life, not to persist other people's review text on
// the visitor's disk with no expiry story.
const sessionCache = new Map();
const cacheKey = (lat, lon, osmId, opts) => readSubjects(lat, lon, osmId, opts).join(' ');

export function fetchReviewsCached(lat, lon, osmId, signal, opts = {}) {
    const key = cacheKey(lat, lon, osmId, opts);
    const held = sessionCache.get(key);
    if (held) return held;
    // The PROMISE is cached, not the resolved list. Caching the result would
    // only close the window once the first response landed, so a fast
    // collapse-and-re-expand while the request was still in flight would mount
    // a second component that missed the cache and issued its own request —
    // the one case the cache exists to prevent. A second caller now joins the
    // first request instead.
    //
    // Dropped again on failure or abort, so the next expand retries rather
    // than replaying the error for the rest of the page's life.
    const inFlight = fetchReviews(lat, lon, osmId, signal, opts).catch((err) => {
        sessionCache.delete(key);
        throw err;
    });
    sessionCache.set(key, inFlight);
    return inFlight;
}

// Drop one playground's cached list — called after a successful submission, so
// the visitor sees their own review rather than the pre-submission list.
export function invalidateReviews(lat, lon, osmId, opts = {}) {
    sessionCache.delete(cacheKey(lat, lon, osmId, opts));
}

// ── Submit review ──────────────────────────────────────────────────────────

export async function submitReview(lat, lon, rating100, opinion, opts = {}) {
    const kp  = await loadOrGenerateKeypair();
    const pem = await publicKeyToPem(kp.publicKey);
    const sub = writeSubject(lat, lon, opts);

    const header  = { alg: 'ES256', typ: 'JWT', kid: pem };
    const payload = { iat: Math.floor(Date.now() / 1000), sub, rating: rating100 };
    if (opinion) payload.opinion = opinion;

    const msg = `${b64url(header)}.${b64url(payload)}`;
    const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        kp.privateKey,
        new TextEncoder().encode(msg),
    );
    const jwt = `${msg}.${b64urlBytes(sig)}`;

    const res = await fetch(
        `${MANGROVE_API}/submit/${encodeURIComponent(jwt)}`,
        { method: 'PUT' },
    );
    return res.ok;
}

// ── Display helpers ────────────────────────────────────────────────────────

export function starsHtml(rating100, color = '#f59e0b') {
    const n = Math.max(1, Math.min(5, Math.round(rating100 / 20)));
    return `<span style="color:${color}">${'★'.repeat(n)}</span>`
        + `<span style="color:#d1d5db">${'☆'.repeat(5 - n)}</span>`;
}

export function relativeDate(iat, t) {
    const diff = Math.floor(Date.now() / 1000 - iat);
    if (!t) {
        if (diff < 86400) return 'heute';
        const days = Math.floor(diff / 86400);
        if (days < 7)    return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
        const weeks = Math.floor(days / 7);
        if (weeks < 5)   return `vor ${weeks} Woche${weeks === 1 ? '' : 'n'}`;
        const months = Math.floor(days / 30);
        if (months < 12) return `vor ${months} Monat${months === 1 ? '' : 'en'}`;
        const years = Math.floor(days / 365);
        return `vor ${years} Jahr${years === 1 ? '' : 'en'}`;
    }
    if (diff < 86400) return t('reviews.today');
    const days = Math.floor(diff / 86400);
    if (days < 7)    return t('reviews.daysAgo', { values: { count: days } });
    const weeks = Math.floor(days / 7);
    if (weeks < 5)   return t('reviews.weeksAgo', { values: { count: weeks } });
    const months = Math.floor(days / 30);
    if (months < 12) return t('reviews.monthsAgo', { values: { count: months } });
    const years = Math.floor(days / 365);
    return t('reviews.yearsAgo', { values: { count: years } });
}
