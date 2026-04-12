// Mangrove.reviews integration
// Read and write pseudonymous playground reviews via the open Mangrove API.
// No API key required. Identity is a P-256 keypair stored in localStorage.
//
// Subject URI format: geo:{lat},{lon}?u=50  (50 m uncertainty for a polygon)
// Rating scale:       0–100  (we show/accept 1–5 stars = 20/40/60/80/100)

import { escapeHtml } from './utils.js';

const MANGROVE_API = 'https://api.mangrove.reviews';
const LS_KEY = 'spielplatzkarte-mangrove-keypair';

// ── Key management ────────────────────────────────────────────────────────────

async function loadOrGenerateKeypair() {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
        const { priv, pub } = JSON.parse(stored);
        const privateKey = await crypto.subtle.importKey(
            'jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
        const publicKey = await crypto.subtle.importKey(
            'jwk', pub,  { name: 'ECDSA', namedCurve: 'P-256' }, true,  ['verify']);
        return { privateKey, publicKey };
    }
    const kp = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
    const pub  = await crypto.subtle.exportKey('jwk', kp.publicKey);
    localStorage.setItem(LS_KEY, JSON.stringify({ priv, pub }));
    return kp;
}

async function publicKeyToPem(publicKey) {
    const spki = await crypto.subtle.exportKey('spki', publicKey);
    const b64  = btoa(String.fromCharCode(...new Uint8Array(spki)));
    return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
}

// ── JWT helpers ───────────────────────────────────────────────────────────────

function b64url(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    return btoa(String.fromCharCode(...bytes))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlBytes(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// ── Subject URI ───────────────────────────────────────────────────────────────

function mangroveSubject(lat, lon) {
    return `geo:${lat.toFixed(5)},${lon.toFixed(5)}?u=50`;
}

// ── Fetch reviews ─────────────────────────────────────────────────────────────

async function fetchReviews(lat, lon) {
    const sub = mangroveSubject(lat, lon);
    const url = `${MANGROVE_API}/reviews?sub=${encodeURIComponent(sub)}&latest_edits_only=true`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.reviews ?? []).filter(r => !r.payload?.action);
}

// ── Submit review ─────────────────────────────────────────────────────────────

async function submitReview(lat, lon, rating100, opinion) {
    const kp  = await loadOrGenerateKeypair();
    const pem = await publicKeyToPem(kp.publicKey);
    const sub = mangroveSubject(lat, lon);

    const header  = { alg: 'ES256', typ: 'JWT', kid: pem };
    const payload = { iat: Math.floor(Date.now() / 1000), sub, rating: rating100 };
    if (opinion) payload.opinion = opinion;

    const msg = `${b64url(header)}.${b64url(payload)}`;
    const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        kp.privateKey,
        new TextEncoder().encode(msg)
    );
    const jwt = `${msg}.${b64urlBytes(sig)}`;

    const res = await fetch(
        `${MANGROVE_API}/submit/${encodeURIComponent(jwt)}`,
        { method: 'PUT' }
    );
    return res.ok;
}

// ── Display helpers ───────────────────────────────────────────────────────────

function starsHtml(rating100, color = '#f59e0b') {
    const n = Math.max(1, Math.min(5, Math.round(rating100 / 20)));
    return `<span style="color:${color}">${'★'.repeat(n)}</span><span style="color:#d1d5db">${'☆'.repeat(5 - n)}</span>`;
}

function relativeDate(iat) {
    const diff = Math.floor(Date.now() / 1000 - iat);
    if (diff < 86400)        return 'heute';
    const days = Math.floor(diff / 86400);
    if (days < 7)            return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5)           return `vor ${weeks} Woche${weeks === 1 ? '' : 'n'}`;
    const months = Math.floor(days / 30);
    if (months < 12)         return `vor ${months} Monat${months === 1 ? '' : 'en'}`;
    const years = Math.floor(days / 365);
    return `vor ${years} Jahr${years === 1 ? '' : 'en'}`;
}

// ── Render ────────────────────────────────────────────────────────────────────

export async function renderReviews(lat, lon) {
    const container = document.getElementById('info-reviews-content');
    if (!container) return;

    container.innerHTML = '<p class="text-muted mb-0" style="font-size:12px">Wird geladen …</p>';

    let reviews = [];
    try { reviews = await fetchReviews(lat, lon); } catch { /* offline or API error */ }

    let html = '';

    if (reviews.length > 0) {
        const avg = reviews.reduce((s, r) => s + r.payload.rating, 0) / reviews.length;
        html += `<p class="mb-2">
            ${starsHtml(avg)}
            <strong style="font-size:14px">${(avg / 20).toFixed(1)}</strong>
            <span class="text-muted" style="font-size:12px">(${reviews.length} Bewertung${reviews.length !== 1 ? 'en' : ''})</span>
        </p>`;

        for (const r of reviews) {
            const p = r.payload;
            html += `<div class="mb-2 pb-2" style="border-bottom:1px solid #f3f4f6">
                <span style="font-size:13px">${starsHtml(p.rating)}</span>
                <span class="text-muted" style="font-size:11px; margin-left:4px">${relativeDate(p.iat)}</span>
                ${p.opinion ? `<p class="mb-0 mt-1" style="font-size:13px">${escapeHtml(p.opinion)}</p>` : ''}
            </div>`;
        }
    } else {
        html += '<p class="text-muted mb-2" style="font-size:12px">Noch keine Bewertungen – sei die Erste!</p>';
    }

    // Submission form
    html += `<div id="review-form">
        <div id="review-stars" style="font-size:24px; cursor:pointer; color:#d1d5db; display:flex; gap:2px; margin-bottom:6px">
            <span data-v="20">★</span><span data-v="40">★</span><span data-v="60">★</span><span data-v="80">★</span><span data-v="100">★</span>
        </div>
        <textarea id="review-opinion" class="form-control form-control-sm mb-2" rows="2"
            placeholder="Deine Meinung (optional)" style="font-size:13px; resize:none;"></textarea>
        <button id="review-submit" class="btn btn-sm btn-outline-secondary" disabled style="font-size:12px">
            Bewertung abgeben
        </button>
        <p id="review-status" class="text-muted mt-1 mb-0" style="font-size:11px"></p>
        <p class="text-muted mt-1 mb-0" style="font-size:10px">Bewertungen sind anonym und werden über <a href="https://mangrove.reviews" target="_blank" rel="noopener" class="link-secondary">Mangrove.reviews</a> gespeichert.</p>
    </div>`;

    container.innerHTML = html;

    // Star interaction
    let selectedRating = null;
    const starEls   = [...container.querySelectorAll('#review-stars span')];
    const submitBtn = container.querySelector('#review-submit');
    const statusEl  = container.querySelector('#review-status');

    const highlightStars = upTo => {
        starEls.forEach((s, j) => s.style.color = j <= upTo ? '#f59e0b' : '#d1d5db');
    };

    starEls.forEach((el, i) => {
        el.addEventListener('click', () => {
            selectedRating = parseInt(el.dataset.v);
            highlightStars(i);
            submitBtn.disabled = false;
        });
        el.addEventListener('mouseover', () => highlightStars(i));
        el.addEventListener('mouseout',  () => {
            const sel = selectedRating ? starEls.findIndex(s => parseInt(s.dataset.v) === selectedRating) : -1;
            highlightStars(sel);
        });
    });

    submitBtn.addEventListener('click', async () => {
        if (!selectedRating) return;
        const opinion = container.querySelector('#review-opinion').value.trim() || null;
        submitBtn.disabled = true;
        statusEl.textContent = 'Wird übermittelt …';
        try {
            const ok = await submitReview(lat, lon, selectedRating, opinion);
            if (ok) {
                statusEl.textContent = 'Danke für deine Bewertung!';
                setTimeout(() => renderReviews(lat, lon), 2000);
            } else {
                statusEl.textContent = 'Fehler beim Übermitteln – bitte versuche es erneut.';
                submitBtn.disabled = false;
            }
        } catch {
            statusEl.textContent = 'Fehler beim Übermitteln.';
            submitBtn.disabled = false;
        }
    });
}
