// `address` for the `opening_hours` constructor, built from REGION_COUNTRY /
// REGION_STATE (#878).
//
// The library keys its state holidays on the *full state name* ("Hessen",
// "Thüringen"), so the documented code `he` never matched and every
// state-specific holiday was ignored without a word. REGION_STATE may now be
// a code (`he`, `DE-HE`, `ai-ap`) or a name, in any letter case; both resolve
// to the library's name through holidayStates.generated.json, which
// tools/build-holiday-states.mjs extracts from the installed library. Only
// `state` is passed — no reliance on library internals at runtime.
import table from './holidayStates.generated.json' with { type: 'json' };

/**
 * Resolve REGION_STATE for `country`. Pure; `states` is injectable for tests.
 * @param {string} country  resolved ISO 3166-1 alpha-2, e.g. 'de'
 * @param {string} raw      '' (none), a code ('he', 'DE-HE') or a name ('Hessen')
 * @returns {{ address: { country_code: string, state?: string }, warning: string|null }}
 */
export function resolveOpeningHoursAddress(country, raw, states = table.countries) {
    const country_code = String(country).toLowerCase();
    const value = (raw || '').trim();
    // No state: pass none, as before the option existed — passing one would
    // change holiday evaluation for deployments that never asked for it.
    if (!value) return { address: { country_code }, warning: null };

    const known = states[country_code];
    if (!known) {
        return {
            address: { country_code, state: value },
            warning: `REGION_STATE "${value}": no state holidays are known for country "${country_code}", so it has no effect`,
        };
    }
    const lower = value.toLowerCase();
    // A code, bare or with this country's prefix. Codes may contain a hyphen
    // themselves (ch: "ai-ap"), so only this country's prefix is stripped.
    const bare = lower.startsWith(`${country_code}-`) ? lower.slice(country_code.length + 1) : lower;
    const name = known.codes[bare] ?? known.codes[lower]
        ?? known.names.find(n => n.toLowerCase() === lower);
    if (name) return { address: { country_code, state: name }, warning: null };

    const otherPrefix = /^([a-z]{2})-/.exec(lower)?.[1];
    const hint = otherPrefix && otherPrefix !== country_code && states[otherPrefix]
        ? ` (it looks like a code for "${otherPrefix}", but REGION_COUNTRY is "${country_code}")`
        : '';
    return {
        address: { country_code },
        warning: `REGION_STATE "${value}" is not a state of "${country_code}"${hint}; state holidays are ignored. Known: ${Object.keys(known.codes).join(', ')}`,
    };
}
