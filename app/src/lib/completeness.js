// Shared data-completeness logic for playground features.
// Returns 'complete' | 'partial' | 'missing'
//
// Criteria:
//   hasPhoto — at least one panoramax / panoramax:* tag
//   hasName  — name tag present
//   hasInfo  — operator, opening_hours, surface, or a non-trivial access value
//
// complete = all three present
// partial  = at least one present
// missing  = none present

export function playgroundCompleteness(props) {
    const hasPhoto = Object.keys(props).some(k => k === 'panoramax' || k.startsWith('panoramax:'));
    const hasName  = !!props.name;
    const hasInfo  = !!(props.operator || props.opening_hours || props.surface ||
                        (props.access && props.access !== 'yes'));

    if (hasPhoto && hasName && hasInfo) return 'complete';
    if (hasPhoto || hasName || hasInfo) return 'partial';
    return 'missing';
}
