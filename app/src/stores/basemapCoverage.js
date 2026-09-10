// SPDX-FileCopyrightText: 2026 spieli contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Whether the current view has left the basemap's DETAILED coverage.
//
// A regional tileset has two different extents and only one of them is
// discoverable from the tileset itself. Planetiler bakes Natural Earth and
// water polygons in globally, so low zooms render everywhere and the declared
// bounds describe that wide area honestly. OSM detail exists only inside the
// imported extract, and above roughly z7 outside it the tile server answers
// 204 No Content. The renderer draws an empty tile: nothing errors, and a void
// is indistinguishable from a legitimately empty map.
//
// null  = no coverage limit configured (a planet tileset, or an operator who
//         has not said) — never show anything.
// false = inside coverage, or zoomed out far enough that the tileset's global
//         low-zoom context still applies.
// true  = the view centre has left the detailed area.
import { writable } from 'svelte/store';

export const outsideBasemapCoverage = writable(null);
