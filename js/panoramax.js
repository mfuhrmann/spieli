//------------------------------------------------------//
// Panoramax — Hilfsfunktionen für Straßenfotos         //
//------------------------------------------------------//

// Thumbnail-URL für eine Panoramax-Foto-UUID (stabiler Redirect auf S3)
export function panoramaxThumbUrl(uuid) {
    return `https://api.panoramax.xyz/api/pictures/${uuid}/thumb.jpg`;
}

// Viewer-URL für eine Panoramax-Foto-UUID
export function panoramaxViewerUrl(uuid) {
    return `https://api.panoramax.xyz/?pic=${uuid}&nav=none&focus=pic`;
}
