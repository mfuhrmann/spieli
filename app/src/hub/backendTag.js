// Stamp a feature with the backend it came from, so selection, panels and
// `#<slug>/…` links route back to the right region. One place for the rule:
// polygons, pitches and deeplink-hydrated features all carry the same tags.

/**
 * @param {import('ol/Feature.js').default} feature
 * @param {{ url: string, slug?: string|null, name?: string|null }} backend
 */
export function tagWithBackend(feature, backend) {
  feature.set('_backendUrl', backend.url);
  if (backend.slug) feature.set('_backendSlug', backend.slug);
  if (backend.name) feature.set('_backendName', backend.name);
}
