import { writable } from 'svelte/store';

/**
 * Whether an explicit region-URL framing (e.g. `/Lauterbach`) was applied to
 * the map on load.
 *
 * - `null`  — undecided: no region path in the URL, or resolution not finished.
 * - `true`  — a region override resolved and framed the map.
 * - `false` — a region path was present but did not resolve, so the map fell
 *             back to the configured region (or default extent).
 *
 * Written by StandaloneApp once region framing settles; read by LocateButton so
 * auto-locate only suppresses GPS centering when an explicit region framing
 * actually took effect (a mistyped /region no longer silently blocks centering).
 */
export const regionFramingApplied = writable(null);
