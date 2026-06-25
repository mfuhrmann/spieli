/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Macro-tier filter coverage (#688).
//
// Written by hubOrchestrator.orchestrateMacroFilter; `null` when no filter is
// active. While a filter is active:
//   { answered: number, total: number, cantFilter: string[] }
//
//   total      — healthy backends in the macro view (the regions a filter
//                should reflect; offline peers are excluded — they carry their
//                own offline ring).
//   answered   — backends that returned a filtered aggregate.
//   cantFilter — backend URLs that could NOT apply the filter (no bbox, or a
//                404 on the cluster RPC). They keep a distinct "can't filter"
//                ring and count against coverage, so the country view never
//                reads as fully filtered when it isn't.
//
// Consumed by MacroView (per-backend `_cantFilter` flag) and the macro
// coverage banner ("filter covers N of M regions"). When `answered < total`
// the filter was applied only partially.

import { writable } from 'svelte/store';

export const macroCoverageStore = writable(null);
