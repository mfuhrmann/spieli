// "Missing a playground?" report flow (#1000). Written by every entry point
// (map button, empty-area hint, search with no hits, Info dialog), read by
// ReportMissingFlow, which owns the steps, and by AppShell/Map, which step
// aside while the visitor is placing the crosshair.
//
//   null    — no report in progress
//   'place' — crosshair on the map; the map stays interactive
//   'dupe'  — a known playground is close by; "do you mean this one?"
//   'choose'— hint without an account, or add it yourself in MapComplete
//   'form'  — the hint form
//   'done'  — sent; the thank-you modal
//
// History (#997 rule): an open report owns one history entry, so the phone's
// back gesture closes it instead of leaving spieli and losing what was typed.
//
// A hint about a known playground (#1073) uses the same flow from 'form' on:
// startHint() sets `reportTarget` and keeps the detail panel open, so the
// report's entry sits on top of the panel's and back returns to the panel.
import { writable, derived, get } from 'svelte/store';
import { selection, hasSelection } from './selection.js';

export const reportStep = writable(null);

/** True while a note is being sent: the flow cannot be closed then. */
export const reportBusy = writable(false);

export const reportPlacing = derived(reportStep, $s => $s === 'place' || $s === 'dupe');

/**
 * The known playground a hint is about, or null for a missing-playground
 * report: { osmType, osmId, lat, lon, knownDevices: string[], fenceKnown,
 * shadeKnown, hasName, mcUrl }.
 */
export const reportTarget = writable(null);

const REPORT_STATE = { spieliReport: true };
const hasHistory = typeof window !== 'undefined' && typeof history !== 'undefined';
// Run once on the next popstate instead of the normal handling: used when a
// history.back() we issued has to land before the next step.
let afterPop = null;

function onReportEntry() {
    return hasHistory && history.state?.spieliReport === true;
}

if (hasHistory) {
    window.addEventListener('popstate', () => {
        if (afterPop) {
            const run = afterPop;
            afterPop = null;
            run();
            return;
        }
        if (!get(reportStep)) {
            // Forward onto the entry of a report that was already closed (a
            // hint pushes it on top of the open panel): step back off it, so
            // the panel's entry is current again and nothing reopens.
            if (onReportEntry()) history.back();
            return;
        }
        if (onReportEntry()) return;
        // The visitor's back left our entry while a report was open.
        if (get(reportBusy)) {
            // Mid-send: stay, the answer is about to arrive.
            history.pushState(REPORT_STATE, '');
            return;
        }
        reportStep.set(null);
        reportTarget.set(null);
    });
}

export function startReport() {
    if (get(reportStep)) return;
    reportTarget.set(null);
    reportStep.set('place');
    if (!hasHistory) {
        if (get(hasSelection)) selection.clear();
        return;
    }
    const push = () => history.pushState(REPORT_STATE, '');
    if (get(hasSelection)) {
        // An open panel owns its own entry and closing it goes back; push
        // ours only once that back has landed, or the back would pop it.
        const panelOnTop = history.state?.spieliPanel === true;
        if (panelOnTop) afterPop = push;
        selection.clear();
        if (!panelOnTop) push();
    } else {
        push();
    }
}

/**
 * Open the hint form for a playground spieli knows (#1073). Unlike
 * startReport() the selection stays: the dialog opens over the panel, and
 * its history entry goes on top of the panel's.
 */
export function startHint(target) {
    if (get(reportStep) || !target) return;
    reportTarget.set(target);
    reportStep.set('form');
    if (hasHistory) history.pushState(REPORT_STATE, '');
}

/**
 * Close the report. `then` runs once our history entry is gone, so a step
 * that pushes its own entry (opening a playground) does not race the back.
 */
export function cancelReport(then = null) {
    // Also an onclick handler, which passes the click event.
    if (typeof then !== 'function') then = null;
    if (get(reportBusy)) return;
    reportStep.set(null);
    reportTarget.set(null);
    if (onReportEntry()) {
        if (then) afterPop = then;
        history.back();
    } else {
        then?.();
    }
}
