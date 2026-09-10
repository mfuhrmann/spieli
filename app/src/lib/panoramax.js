// Panoramax — helper functions for street-level photos.
//
// Panoramax is the one third party the visitor's browser still contacts in a
// default deployment, and it is deliberate:
//
//   * The thumbnail endpoint answers 308 with a Location on a per-instance
//     derivative host (api.panoramax.xyz -> panoramax.openstreetmap.fr).
//     nginx's proxy module cannot follow a redirect, so relaying it would send
//     the browser to a host the privacy page does not name and the CSP does
//     not allow. Rewriting it would need a proxy location per derivative host,
//     and Panoramax is a federation whose set of those is not ours to
//     enumerate.
//   * The viewer is an <iframe>. Serving a whole interactive third-party
//     application from this origin would grant it same-origin privileges here
//     — access to this site's storage, and a document able to script the
//     embedding page's origin. That is worse than a cross-origin iframe.
//
// Both are disclosed in docs/reference/external-services.md and on the
// generated privacy page, and api.panoramax.xyz is named in img-src and
// frame-src. Gating the iframe behind an explicit click is #852.
//
// These helpers exist so the host appears once rather than in every component
// that renders a photo.

const PANORAMAX = 'https://api.panoramax.xyz';

// Thumbnail URL for a Panoramax photo UUID.
export function panoramaxThumbUrl(uuid) {
    return `${PANORAMAX}/api/pictures/${uuid}/thumb.jpg`;
}

// Viewer URL for a Panoramax photo UUID.
export function panoramaxViewerUrl(uuid) {
    return `${PANORAMAX}/?pic=${uuid}&nav=none&focus=pic`;
}
