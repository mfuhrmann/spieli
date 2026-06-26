/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Macro-tier filter coverage (#688).
//
// Written by hubOrchestrator.orchestrateMacroFilter; `null` when no filter is
// active. While a filter is active:
//   { answered: number, total: number, cantFilter: string[], settling: boolean }
//
//   total      — healthy backends in the macro view (the regions a filter
//                should reflect; offline peers are excluded — they carry their
//                own offline ring).
//   answered   — backends that returned a filtered aggregate.
//   cantFilter — backend URLs that could NOT apply the filter (no bbox, or a
//                404 on the cluster RPC). They keep a distinct "can't filter"
//                ring and count against coverage, so the country view never
//                reads as fully filtered when it isn't.
//   settling   — true while the fan-out is still in flight. The banner waits
//                for `settling === false` before disclosing partial coverage,
//                so it doesn't flash "covers 0 of N" mid-load before every
//                backend has answered. The per-ring `_cantFilter` flag does not
//                wait on it.
//
// Consumed by MacroView (per-backend `_cantFilter` flag) and the macro
// coverage banner ("filter covers N of M regions"). When `answered < total`
// and `settling` is false, the filter was applied only partially.

import { writable } from 'svelte/store';

export const macroCoverageStore = writable(null);
