// Reactive store for the currently hovered equipment feature OSM ID.
// Used to highlight equipment on the map when hovering over items in the equipment list.
//
// shape: string | null
//   null = no equipment hovered
//   string = the osm_id of the hovered equipment feature

import { writable } from 'svelte/store';

function createEquipmentHoverStore() {
    const { subscribe, set } = writable(null);

    return {
        subscribe,
        hover(osmId) {
            set(osmId);
        },
        clear() {
            set(null);
        },
    };
}

export const equipmentHover = createEquipmentHoverStore();
