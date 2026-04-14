import { writable } from 'svelte/store';

// Each key maps to a boolean — true means the filter is active.
export const filterStore = writable({
    private:     false,
    water:       false,
    baby:        false,
    toddler:     false,
    wheelchair:  false,
    bench:       false,
    picnic:      false,
    shelter:     false,
    tableTennis: false,
    soccer:      false,
    basketball:  false,
});

/**
 * Returns true if the feature properties satisfy all active filters.
 * Property names match what get_playgrounds returns.
 * @param {Object} props - OL feature properties
 * @param {Object} filters - current filterStore value
 */
export function matchesFilters(props, filters) {
    if (filters.private     && (props.access === 'private' || props.access === 'no')) return false;
    if (filters.water       && !props.is_water)       return false;
    if (filters.baby        && !props.for_baby)       return false;
    if (filters.toddler     && !props.for_toddler)    return false;
    if (filters.wheelchair  && !props.for_wheelchair) return false;
    if (filters.bench       && !(props.bench_count > 0))        return false;
    if (filters.picnic      && !(props.picnic_count > 0))       return false;
    if (filters.shelter     && !(props.shelter_count > 0))      return false;
    if (filters.tableTennis && !(props.table_tennis_count > 0)) return false;
    if (filters.soccer      && !props.has_soccer)      return false;
    if (filters.basketball  && !props.has_basketball)  return false;
    return true;
}

/** Returns true if any filter is currently active. */
export function hasActiveFilters(filters) {
    return Object.values(filters).some(Boolean);
}
