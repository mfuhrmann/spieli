// Reactive store for the currently hovered equipment feature OSM ID.
// Used to highlight equipment on the map when hovering over items in the equipment list.

import { writable } from 'svelte/store';

export const equipmentHover = writable(null);
