// Wikimedia Commons photo fetching for playground galleries.
//
// A playground's photos come from its OSM `wikimedia_commons` tag (a
// `Category:` gallery or a single `File:`) plus an optional direct `image`
// URL. We pool them into one flat list — a Commons category is an
// unstructured photo bag, so we never try to match photos to individual
// devices. See issue #650.

import { commonsApiUrl as API, commonsFileBase } from './config.js';

// Rewrite a Wikimedia file URL onto this instance, so the image bytes come
// from here rather than from Wikimedia.
//
// Necessary because proxying the API is not enough on its own: the imageinfo
// response carries ABSOLUTE file URLs, so a browser handed those goes to
// Wikimedia for every image and the proxy achieves nothing — the same trap the
// basemap TileJSON needed a sub_filter for.
//
// The original host is preserved as the first path segment instead of being
// assumed. Which host serves a file is Wikimedia's business and it changes:
// the API currently returns thumbnails on thumb.wikimedia.org and originals on
// upload.wikimedia.org, so a rewrite hard-coded to one of them silently sends
// every thumbnail straight to Wikimedia while appearing to work.
//
// Only ever called on values that have already passed isSafeImageUrl or come
// from the API's own imageinfo, and it still re-checks the host itself, so it
// can never be the thing that launders a hostile tag into a same-origin path.
// Hosts whose image bytes the /ext/wikimedia/ proxy will serve. The OSM wiki
// is here because 14 equipment illustrations exist only there; it is a plain
// MediaWiki file host like the others, and keeping the list in one place is
// what stops the frontend rewriting a URL the proxy will then refuse.
const isProxiableImageHost = h => isWikimediaHost(h) || h === 'wiki.openstreetmap.org';

export function proxiedImageUrl(url) {
    if (!commonsFileBase) return url;               // not proxied
    const u = parseUrl(url);
    if (!u || !isProxiableImageHost(u.hostname)) return url;
    return `${commonsFileBase}/${u.hostname}${u.pathname}${u.search}`;
}

function parseUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        const u = new URL(url);
        return u.protocol === 'https:' ? u : null;
    } catch {
        return null;
    }
}

const isWikimediaHost = h =>
    /(^|\.)wikimedia\.org$/.test(h) || /(^|\.)wikipedia\.org$/.test(h);

// A direct, renderable image: an https Wikimedia URL that actually points at an
// image file (the upload host, or a path ending in an image extension). This
// deliberately rejects Commons *page* URLs like `/wiki/File:Foo.jpg`, which are
// HTML pages, not images — those are handled by commonsFileFromUrl() instead.
export function isSafeImageUrl(url) {
    const u = parseUrl(url);
    if (!u || !isWikimediaHost(u.hostname)) return false;
    // `/wiki/...` is an HTML page (e.g. /wiki/File:Foo.jpg), never an image.
    if (/^\/wiki\//i.test(u.pathname)) return false;
    if (/^upload\./.test(u.hostname)) return true;
    return /\.(jpe?g|png|gif|webp|svg)$/i.test(u.pathname);
}

// Extract a `File:` title from a Commons URL that references a file by page
// (`/wiki/File:Name`) or via FilePath (`/wiki/Special:FilePath/Name`). Returns
// null for anything else. Such references are resolved through the imageinfo
// API so we get a real thumbnail + license instead of linking an HTML page.
export function commonsFileFromUrl(url) {
    const u = parseUrl(url);
    if (!u || !isWikimediaHost(u.hostname)) return null;
    let m = u.pathname.match(/\/wiki\/Special:FilePath\/(.+)$/i);
    if (m) return `File:${decodeURIComponent(m[1])}`;
    m = u.pathname.match(/\/wiki\/(File:.+)$/i);
    if (m) return decodeURIComponent(m[1]);
    return null;
}

// Whether an OSM `image` tag value is one the gallery can actually render:
// either a direct renderable image (isSafeImageUrl) or a Commons File:/FilePath
// page we resolve via the imageinfo API (commonsFileFromUrl). This is exactly
// what fetchPlaygroundPhotos does with the `image` value, so completeness
// scoring never credits a photo that never appears — a `/wiki/Category:…` or a
// plain wikipedia article URL passes the host but renders nothing, so both are
// rejected here. Mirrored in SQL (see importer/api.sql has_photo).
export function isWikimediaImageTag(value) {
    return isSafeImageUrl(value) || commonsFileFromUrl(value) !== null;
}

// Parse a `wikimedia_commons` tag value into { kind, title }.
// Accepts "Category:Foo", "File:Bar.jpg", or a bare value (assumed a File).
export function parseCommonsTag(value) {
    if (!value || typeof value !== 'string') return null;
    const v = value.trim();
    if (!v) return null;
    if (/^category:/i.test(v)) return { kind: 'category', title: v };
    if (/^file:/i.test(v)) return { kind: 'file', title: v };
    return { kind: 'file', title: `File:${v}` };
}

// Strip the HTML that Commons wraps around Artist / license metadata so we
// can show a plain-text credit. Falls back to null on empty input.
export function stripHtml(s) {
    if (!s || typeof s !== 'string') return null;
    const txt = s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return txt || null;
}

async function api(params, signal) {
    const url = API + '?' + new URLSearchParams({ ...params, format: 'json', origin: '*' });
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Commons API ${res.status}`);
    return res.json();
}

// List file titles in a Commons category.
async function fetchCategoryFiles(title, max, signal) {
    const data = await api({
        action: 'query',
        list: 'categorymembers',
        cmtitle: title,
        cmtype: 'file',
        cmlimit: String(max),
    }, signal);
    return (data?.query?.categorymembers ?? []).map(m => m.title);
}

// Resolve File: titles into photo objects with thumbnail + license metadata.
async function fetchImageInfo(titles, thumbWidth, signal) {
    const out = [];
    // The API caps `titles` at 50 per request.
    for (let i = 0; i < titles.length; i += 50) {
        const batch = titles.slice(i, i + 50);
        const data = await api({
            action: 'query',
            titles: batch.join('|'),
            prop: 'imageinfo',
            iiprop: 'url|extmetadata',
            iiurlwidth: String(thumbWidth),
        }, signal);
        // `pages` is a pageid-keyed object whose iteration order does NOT track
        // the requested order, so build a title→photo map and re-emit in the
        // `batch` order. `normalized` maps each requested title to the canonical
        // title MediaWiki actually keyed the page under.
        const pages = data?.query?.pages ?? {};
        const canonical = {};
        for (const n of data?.query?.normalized ?? []) canonical[n.from] = n.to;
        const byTitle = {};
        for (const page of Object.values(pages)) {
            const ii = page.imageinfo?.[0];
            if (!ii) continue;
            const meta = ii.extmetadata ?? {};
            byTitle[page.title] = {
                title: page.title,
                // thumb/full are fetched as image bytes, so they route through
                // the proxy. descUrl stays direct: it is a link the visitor
                // clicks, and it transfers nothing until they do.
                thumb: proxiedImageUrl(ii.thumburl || ii.url),
                full: proxiedImageUrl(ii.url),
                descUrl: ii.descriptionurl || null,
                artist: stripHtml(meta.Artist?.value),
                license: stripHtml(meta.LicenseShortName?.value || meta.License?.value),
            };
        }
        for (const t of batch) {
            const photo = byTitle[canonical[t] ?? t];
            if (photo) out.push(photo);
        }
    }
    return out;
}

// Fetch the full photo set for a playground: the safe direct `image` URL
// (if any) plus all files from the `wikimedia_commons` tag, deduped by title
// and by resolved file URL. Returns [] on any network/API failure so the caller
// can degrade gracefully; an aborted request rethrows (AbortError) so the caller
// can distinguish a superseded fetch from an empty result.
export async function fetchPlaygroundPhotos(commonsTag, imageUrl, opts = {}) {
    const { signal, max = 24, thumbWidth = 320 } = opts;
    const photos = [];
    const seen = new Set();
    const titles = [];

    try {
        // `image` may be a direct image, a Commons File-page reference, or junk.
        const imageFile = commonsFileFromUrl(imageUrl);
        if (imageFile) {
            titles.push(imageFile);
        } else if (isSafeImageUrl(imageUrl)) {
            // isSafeImageUrl has already vetted the host; only then is it
            // rewritten onto the proxy. Dedup below still keys on the original
            // URL, which is what the API's ii.url would collide with.
            const proxied = proxiedImageUrl(imageUrl);
            photos.push({ title: imageUrl, thumb: proxied, full: proxied, descUrl: imageUrl, artist: null, license: null });
            // Seed dedup with the direct image's URL so the same file arriving
            // via the category (resolved to the same ii.url) isn't shown twice.
            // BOTH forms are seeded: the imageinfo branch compares against its
            // own `full`, which is proxied, so seeding only the raw URL would
            // stop matching the moment a proxy is configured and show the
            // photo twice.
            seen.add(imageUrl);
            seen.add(proxied);
        }

        const parsed = parseCommonsTag(commonsTag);
        if (parsed) {
            if (parsed.kind === 'category') {
                titles.push(...await fetchCategoryFiles(parsed.title, max, signal));
            } else {
                titles.push(parsed.title);
            }
        }

        if (titles.length > 0) {
            const infos = await fetchImageInfo([...new Set(titles)], thumbWidth, signal);
            for (const p of infos) {
                if (seen.has(p.title) || seen.has(p.full)) continue;
                seen.add(p.title);
                seen.add(p.full);
                photos.push(p);
            }
        }
        return photos;
    } catch (err) {
        if (err?.name === 'AbortError') throw err;
        return [];
    }
}
