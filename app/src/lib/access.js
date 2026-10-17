// Who may use a playground (#1002), as a visitor needs to know it:
//
//   'public'    — anyone (also: untagged, `yes`, `permissive`, …)
//   'customers' — usable as a customer or guest: a café's, a store's, a
//                 holiday park's playground. Worth the trip if you go there.
//   'private'   — not for you: a kindergarten's, a school's, a residential
//                 complex's. The trip is wasted.
//
// The one rule behind the map pin, the hover card, the panel badge and the
// "public only" filter, so they cannot disagree again (`access=no` used to be
// filtered but not marked, and `customers` marked but not filtered).
//
// Mirrors `access_restricted` in importer/api.sql, which the server-side
// filter uses; that one does not know `no` yet.

/** @returns {'public' | 'customers' | 'private'} */
export function accessKind(props) {
    const access = props?.access;
    if (access === 'private' || access === 'no') return 'private';
    if (access === 'customers') return 'customers';
    return 'public';
}

/** Anything but public: what the "public only" filter hides. */
export function isRestrictedAccess(props) {
    return accessKind(props) !== 'public';
}
