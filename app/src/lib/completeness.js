import { isWikimediaImageTag } from './commons.js';

// Shared mapping-detail logic for playground features.
// Returns 'complete' | 'partial' | 'missing'
//
// NOTE ON NAMING: the returned values are the wire and storage identifiers —
// they appear in get_playground_clusters, get_meta, playground_stats and the
// filterStore keys, and renaming them would break mixed-version federation.
// Their user-facing labels are different on purpose:
//
//     'complete' → "detailed"        'partial' → "basic"
//     'missing'  → "not mapped yet"
//
// The labels live in locales/*.json under `mappingDetail.*`. The value
// describes how much of the playground has been MAPPED, not how good the
// playground is.
//
// Criteria:
//   hasEquipment — any mapped equipment inside the playground
//                  (playground=* devices, benches, pitches, etc.)
//   hasInfo      — opening_hours, surface, or a non-trivial access value
//
// complete = hasEquipment AND hasInfo
// partial  = hasEquipment OR  hasInfo
// missing  = neither
//
// A photo is deliberately NOT part of this rule. Photo tags (panoramax,
// wikimedia_commons) are rare in OSM, so requiring one for the top bucket
// pinned entire regions there: Hessen sat at 87 of 8802 playgrounds (1.0%)
// in `complete` while a well-photographed region reached 8.0% under the same
// rule. A playground with twelve mapped devices plus surface and access was
// held at `partial` indefinitely because nobody uploaded a picture, which
// judged the mapper rather than the map (#733).
//
// Photo availability is still surfaced — as an additive marker via
// hasPhotoSignal() below (a camera glyph on the polygon, a badge in
// PlaygroundPanel). Having a photo is a bonus; not having one is not a
// penalty.
//
// `name` and `operator` are intentionally excluded — administrative data,
// not useful to parents choosing a playground.

/**
 * True when the playground carries a photo we can actually render: a
 * panoramax / panoramax:* tag, a wikimedia_commons tag, or an image link on a
 * Wikimedia/Wikipedia host. An off-Wikimedia image URL does not count — the
 * gallery can't display it.
 *
 * Not an input to playgroundCompleteness(); drives the additive photo marker.
 */
export function hasPhotoSignal(props) {
    return Object.keys(props).some(k =>
        k === 'panoramax' || k.startsWith('panoramax:') ||
        k === 'wikimedia_commons')
        || isWikimediaImageTag(props.image);
}

export function playgroundCompleteness(props) {
    const hasEquipment = (props.device_count > 0)
        || (props.bench_count > 0)
        || (props.shelter_count > 0)
        || (props.picnic_count > 0)
        || (props.table_tennis_count > 0)
        || props.has_soccer
        || props.has_basketball
        || props.is_water
        || props.for_baby
        || props.for_toddler
        || props.for_wheelchair;
    const hasInfo = !!(props.opening_hours || props.surface ||
                       (props.access && props.access !== 'yes'));

    if (hasEquipment && hasInfo) return 'complete';
    if (hasEquipment || hasInfo) return 'partial';
    return 'missing';
}
