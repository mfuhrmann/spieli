// Shared data-completeness logic for playground features.
// Returns 'complete' | 'partial' | 'missing'
//
// Criteria:
//   hasPhoto — at least one panoramax / panoramax:* tag
//   hasInfo  — operator, opening_hours, surface, or a non-trivial access value
//
// complete = both present
// partial  = at least one present
// missing  = none present
//
// `name` is intentionally excluded — many real playgrounds have no official
// name, and penalising them for it obscures otherwise well-documented sites.

export function playgroundCompleteness(props) {
    const hasPhoto = Object.keys(props).some(k => k === 'panoramax' || k.startsWith('panoramax:'));
    const hasInfo  = !!(props.operator || props.opening_hours || props.surface ||
                        (props.access && props.access !== 'yes'));

    if (hasPhoto && hasInfo) return 'complete';
    if (hasPhoto || hasInfo) return 'partial';
    return 'missing';
}
