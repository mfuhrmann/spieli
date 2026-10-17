import { writable, derived } from 'svelte/store';
import { accessKind, isRestrictedAccess } from '../lib/access.js';
import { playgroundCompleteness } from '../lib/completeness.js';
import { mappingDetail } from './mappingDetail.js';

// showComplete/showPartial/showMissing default true (show all).
// Deactivating a state hides playgrounds of that completeness.
export const defaultFilters = {
    private:          false,
    water:            false,
    baby:             false,
    toddler:          false,
    wheelchair:       false,
    bench:            false,
    picnic:           false,
    shelter:          false,
    tableTennis:      false,
    soccer:           false,
    basketball:       false,
    fence:            false,
    hasDogs:          false,
    theme:            false,
    shade:            false,
    standalonePitches: false,  // layer toggle — show pitches outside playground areas
    // Layer toggle (#1002): private playgrounds (a kindergarten's, a school's)
    // are hidden in the finder view unless asked for. Forced on with mapping
    // detail, where mappers need to see everything.
    showPrivate:      false,
    showComplete:     true,
    showPartial:      true,
    showMissing:      true,
};

export const filterStore = writable({ ...defaultFilters });

/**
 * The filters that actually apply. While mapping detail is off its three
 * show* keys are forced to `true`: a filter whose control the visitor cannot
 * see must never hide playgrounds. The stored values are left alone, so they
 * take effect again when mapping detail is switched back on.
 */
export function effectiveFilters(filters, mappingDetailOn) {
    if (mappingDetailOn) return { ...filters, showPrivate: true };
    return { ...filters, showComplete: true, showPartial: true, showMissing: true };
}

// Every reader that affects what is fetched or drawn (polygon style, tier
// refetch, hub fan-out, badge and chips) reads this, not filterStore.
// Writers keep writing filterStore.
export const effectiveFilterStore = derived(
    [filterStore, mappingDetail],
    ([$filters, $detail]) => effectiveFilters($filters, $detail),
);

/**
 * The filters that reach the server, as a comparable string: everything but
 * the standalonePitches layer toggle, which only drives the pitch layer.
 */
export function serverFilterFingerprint(filters) {
    const { standalonePitches: _sp, ...cf } = filters;
    return JSON.stringify(cf);
}

/**
 * Returns true if the feature properties satisfy all active filters.
 * Property names match what get_playgrounds returns.
 * @param {Object} props - OL feature properties
 * @param {Object} filters - current filterStore value
 */
export function matchesFilters(props, filters) {
    if (filters.private     && isRestrictedAccess(props)) return false;
    // `=== false`, not falsy: a filters object without the key shows everything.
    if (filters.showPrivate === false && accessKind(props) === 'private') return false;
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
    if (filters.fence       && !props.has_fence)       return false;
    if (filters.hasDogs     && !props.has_dogs)       return false;
    if (filters.theme       && !props.has_theme)      return false;
    if (filters.shade       && !props.has_shade)       return false;
    if (!filters.showComplete || !filters.showPartial || !filters.showMissing) {
        const c = playgroundCompleteness(props);
        if (!filters.showComplete && c === 'complete') return false;
        if (!filters.showPartial  && c === 'partial')  return false;
        if (!filters.showMissing  && c === 'missing')  return false;
    }
    return true;
}

/**
 * Returns true if any filter (including deactivated completeness states) is
 * active. `standalonePitches` is a layer toggle, not a filter — it adds a
 * layer rather than narrowing the playgrounds — so it does not count, the same
 * as in activeFilterCount (#932).
 */
export function hasActiveFilters(filters) {
    // showPrivate is a layer default, not a filter the visitor set: it neither
    // counts as active nor wakes the hub's filtered macro fan-out.
    const { showComplete, showPartial, showMissing, standalonePitches, showPrivate, ...rest } = filters;
    return Object.values(rest).some(Boolean)
        || !showComplete || !showPartial || !showMissing;
}

/** Count of active filters for the badge (deactivated completeness states count too). */
export function activeFilterCount(filters) {
    const { showComplete, showPartial, showMissing, standalonePitches, showPrivate, ...boolFilters } = filters;
    return Object.values(boolFilters).filter(Boolean).length
        + (showComplete ? 0 : 1) + (showPartial ? 0 : 1) + (showMissing ? 0 : 1);
}
