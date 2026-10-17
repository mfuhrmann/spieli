// "Missing a playground?" report flow (#1000). Written by every entry point
// (map button, empty-area hint, right-click, Info dialog), read by
// ReportMissingFlow, which owns the steps, and by AppShell/Map, which step
// aside while the visitor is placing the crosshair.
//
//   null    — no report in progress
//   'place' — crosshair on the map; the map stays interactive
//   'dupe'  — a known playground is close by; "do you mean this one?"
//   'choose'— hint without an account, or add it yourself in MapComplete
//   'form'  — the hint form
//   'done'  — sent; the thank-you modal
import { writable, derived } from 'svelte/store';

export const reportStep = writable(null);

/**
 * Where a report should start: an EPSG:3857 coordinate to centre on, or null
 * for "where the map is now". Consumed (reset to null) by ReportMissingFlow.
 */
export const reportStartAt = writable(null);

export const reportPlacing = derived(reportStep, $s => $s === 'place' || $s === 'dupe');

export function startReport(coordinate = null) {
    reportStartAt.set(coordinate);
    reportStep.set('place');
}

export function cancelReport() {
    reportStep.set(null);
}
