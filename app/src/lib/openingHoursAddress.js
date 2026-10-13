// `address` for the `opening_hours` constructor, built from REGION_COUNTRY /
// REGION_STATE (#878).
//
// The library keys its state holidays on the *full state name* ("Hessen",
// "Thüringen"), so the documented short code `he` never matched and every
// state-specific holiday was silently ignored. It also resolves ISO 3166-2
// codes, but only from Nominatim-style `ISO3166-2-lvl<n>` fields, which it
// tries first and falls back from to `state`. So both are passed: a code
// (`he`, `DE-HE`) resolves through the ISO field, a full name through
// `state` — the ISO lookup of a name finds nothing and steps aside.

/**
 * @param {string} country ISO 3166-1 alpha-2, e.g. 'de'
 * @param {string} state   '' (none), a code ('he', 'DE-HE') or a full name ('Hessen')
 */
export function openingHoursAddressFor(country, state) {
    const country_code = (country || 'de').toLowerCase();
    const s = (state || '').trim();
    // No state: pass none, as before the option existed — passing one would
    // change holiday evaluation for deployments that never asked for it.
    if (!s) return { country_code };
    const iso = /^[a-z]{2}-[a-z0-9]{1,3}$/i.test(s) ? s : `${country_code}-${s}`;
    return { country_code, state: s, 'ISO3166-2-lvl4': iso.toUpperCase() };
}
