// Pure helper functions for playground display logic.
// Ported from js/selectPlayground.js.

import { clusterMaxZoom, mapMaxZoom } from './config.js';

/**
 * Build a display title from OSM name tags.
 * @param {Object} attr - feature properties
 * @param {Function} t - svelte-i18n translate function (optional)
 */
export function getPlaygroundTitle(attr, t) {
    const parts = [attr.name, attr.alt_name, attr.loc_name, attr.official_name, attr.old_name, attr.short_name]
        .filter(Boolean);
    if (!parts.length) return t ? t('nearby.defaultName') : 'Spielplatz';
    if (parts.length === 1) return parts[0];
    return `${parts[0]} (${parts.slice(1).join(', ')})`;
}

/** Build a human-readable location hint from nearest_highway or in_site tags. */
export function getPlaygroundLocation(attr, t) {
    if (attr.in_site) return attr.in_site;
    const highway = attr.nearest_highway;
    if (!highway) return '';

    const values = { values: { name: highway } };
    if (!t) return `in der Nähe von ${highway}`;

    const am = ['weg', 'platz', 'damm', 'ring', 'ufer', 'steg', 'steig', 'pfad',
                 'gestell', 'park', 'garten', 'bogen'];
    const an_der = ['straße', 'allee', 'chaussee', 'promenade', 'gasse', 'brücke',
                    'zeile', 'achse', 'schleife', 'aue', 'insel'];
    const h = highway.toLowerCase();

    if (am.some(s => h.endsWith(s) || h.startsWith(s)) && !highway.startsWith('Am '))
        return t('location.am', values);
    if (an_der.some(s => h.endsWith(s) || h.startsWith(s)) && !highway.startsWith('An der '))
        return t('location.anDer', values);
    return t('location.near', values);
}

/** Haversine distance in metres between two WGS84 points. */
export function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Format a distance in metres for display, using browser locale. */
export function formatDistance(m) {
    if (m < 1000) return `~${Math.round(m / 10) * 10} m`;
    return `~${(m / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/** Bearing in degrees (0 = N, 90 = E) between two points. */
export function bearingDeg(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Returns a compass direction key suitable for $_('compass.KEY'). */
export function bearingToDir(deg) {
    return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}

/**
 * Padding for `view.fit()` when framing a selected playground.
 * Desktop reserves the left side-panel width (420 px); mobile shows a
 * full-screen overlay instead, so balanced padding centres the polygon behind
 * it — a 420 px reserve on a ~390 px phone mis-frames the fit (see #684).
 * Order is OL's `[top, right, bottom, left]`.
 */
export function selectionFitPadding() {
    const narrow = typeof window !== 'undefined' && window.innerWidth < 1024;
    return narrow ? [60, 40, 60, 40] : [40, 40, 40, 420];
}

/**
 * Padding for `view.fit()` when framing a region (region URL or aggregated
 * bbox). Desktop reserves the left side-panel width (380 px); mobile has no
 * left panel (bottom sheet instead), so a 380 px left reserve would exceed a
 * narrow viewport and make OL compute a broken extent — the region never shows
 * (see #702). The mobile top reserve (60 px) clears the floating search bar,
 * matching {@link selectionFitPadding}. Order is OL's `[top, right, bottom, left]`.
 */
export function regionFitPadding() {
    const narrow = typeof window !== 'undefined' && window.innerWidth < 1024;
    return narrow ? [60, 20, 20, 20] : [20, 20, 20, 380];
}

/**
 * Fit the view to a selected playground's extent, then floor the zoom back into
 * the polygon tier. `constrainResolution` (set on the View) snaps the fit to an
 * integer zoom; for a playground large enough to fit at zoom <= clusterMaxZoom
 * that snap can land in the cluster tier and hide the selected polygon, so bump
 * it to clusterMaxZoom + 1 in that case. Shared by every select origin (map
 * click, Nearby list, deeplink restore) so framing is identical (see #684).
 *
 * @param {import('ol/View.js').default} view
 * @param {import('ol/extent.js').Extent} extent  EPSG:3857
 * @param {(view: import('ol/View.js').default) => void} [onComplete]  Runs once
 *   the fit settles; skipped when a newer animation cancels the fit.
 */
export function fitViewToSelection(view, extent, onComplete) {
    view.fit(extent, {
        padding: selectionFitPadding(),
        duration: 400,
        maxZoom: mapMaxZoom,
        callback: (complete) => {
            // OL passes complete === false when a newer animation cancels this
            // fit (rapid re-click / select-then-close) — don't snap or stamp then.
            if (!complete) return;
            if ((view.getZoom() ?? 0) <= clusterMaxZoom) view.setZoom(clusterMaxZoom + 1);
            onComplete?.(view);
        },
    });
}
