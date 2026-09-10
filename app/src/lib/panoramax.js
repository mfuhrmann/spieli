// Panoramax — helper functions for street-level photos.

import { panoramaxApiUrl } from './config.js';

// Thumbnail URL for a Panoramax photo UUID (stable redirect to S3).
// Routed through panoramaxApiUrl, which is a same-origin /ext/ path when this
// instance proxies.
export function panoramaxThumbUrl(uuid) {
    return `${panoramaxApiUrl}/api/pictures/${uuid}/thumb.jpg`;
}

// Viewer URL for a Panoramax photo UUID.
//
// Deliberately NOT routed through the proxy, even when one is configured. This
// URL is loaded in an <iframe>, and serving a whole interactive third-party
// application from our own origin would give it same-origin privileges on this
// instance — access to our localStorage and cookies, and a document that could
// script the embedding page's origin. That is strictly worse than the
// cross-origin iframe it would replace. Gating that iframe behind a click is
// the actual fix, and it is #852.
export function panoramaxViewerUrl(uuid) {
    return `https://api.panoramax.xyz/?pic=${uuid}&nav=none&focus=pic`;
}
