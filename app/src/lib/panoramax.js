// Panoramax — helper functions for street-level photos.
//
// Two halves, delivered differently:
//
//   * Thumbnails go through this instance (/ext/panoramax/, #863). The
//     endpoint answers 308 to a per-instance derivative host
//     (api.panoramax.xyz -> panoramax.openstreetmap.fr); nginx follows that
//     redirect server-side, so the browser never learns the derivative host.
//     `make dev` has no nginx and uses the public API directly.
//   * The viewer is an <iframe> on the provider's origin. Serving a whole
//     interactive third-party application from this origin would grant it
//     same-origin privileges here — access to this site's storage, and a
//     document able to script the embedding page's origin. It is gated behind
//     an explicit click instead (#852), and api.panoramax.xyz is named in
//     frame-src and on the privacy page.
//
// These helpers exist so the hosts appear once rather than in every component
// that renders a photo.

import { panoramaxThumbBase } from './config.js';

const PANORAMAX = 'https://api.panoramax.xyz';

// Thumbnail URL for a Panoramax photo UUID.
export function panoramaxThumbUrl(uuid) {
    return `${panoramaxThumbBase}/api/pictures/${uuid}/thumb.jpg`;
}

// Viewer URL for a Panoramax photo UUID.
export function panoramaxViewerUrl(uuid) {
    return `${PANORAMAX}/?pic=${uuid}&nav=none&focus=pic`;
}

// Panoramax photo UUIDs from a feature's OSM tags, in tag order: `panoramax`,
// then `panoramax:0` … `panoramax:9`. MapComplete writes the second photo to
// `panoramax:0`, so a reader that starts at `panoramax:1` drops it (#1028).
// A UUID that appears in two tags is returned once.
export const PANORAMAX_KEYS = ['panoramax', ...Array.from({ length: 10 }, (_, i) => `panoramax:${i}`)];

export function panoramaxUuidsFromTags(tags) {
    if (!tags) return [];
    const uuids = [];
    for (const key of PANORAMAX_KEYS) {
        const v = typeof tags[key] === 'string' ? tags[key].trim() : '';
        if (v && !uuids.includes(v)) uuids.push(v);
    }
    return uuids;
}
