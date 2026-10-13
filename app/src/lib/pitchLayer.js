// The "Standalone pitches" layer (leisure=pitch outside any playground),
// shared by the standalone and the hub app (#947).
//
// The app supplies only `load(extent3857, signal)`, which resolves to OL
// features — standalone asks its own backend, the hub every healthy backend
// in view. Everything else lives here, so both apps behave the same:
//
//   - loads on moveend from PITCH_MIN_ZOOM, and only while the layer is on
//     (switching it on loads at once — the checkbox used to wait for the next
//     pan when the layer had never been loaded);
//   - visibility follows filterStore.standalonePitches;
//   - styles: a sport pin per pitch (#929), the polygon underneath only with
//     mapping detail on, and the selected pitch outlined (#934);
//   - `selectable: true`, so Map's click handler may select its pitches.

import VectorSource from 'ol/source/Vector.js';
import VectorLayer from 'ol/layer/Vector.js';
import { get } from 'svelte/store';
import { equipmentLayerStyleFn, selectedPitchStyle } from './vectorStyles.js';
import { pitchPinFor } from './finderStyle.js';
import { debounce } from './utils.js';
import { filterStore } from '../stores/filters.js';
import { mappingDetail } from '../stores/mappingDetail.js';
import { selection } from '../stores/selection.js';

export const PITCH_MIN_ZOOM = 12;

/**
 * Style for the pitch layer. `selected` is `{ osmId, backendUrl }` of the
 * selected pitch, or null; matched by osm_id — a linked pitch is not in this
 * layer's source until the layer loads its area — and, in the hub, by backend
 * too, since two regions may share a numeric id.
 */
export function pitchLayerStyle(detail, selected) {
  return feature => {
    const pin = pitchPinFor(feature);
    const isSelected = pin != null && selected != null
      && feature.get('osm_id') === selected.osmId
      && (selected.backendUrl == null || feature.get('_backendUrl') == null
          || feature.get('_backendUrl') === selected.backendUrl);
    const base = pin && !detail ? null : equipmentLayerStyleFn(feature);
    const styles = [base, isSelected ? selectedPitchStyle : null, pin].filter(Boolean);
    return styles.length > 1 ? styles : (styles[0] ?? null);
  };
}

function selectedPitch(sel) {
  if (!sel.feature || sel.kind !== 'pitch') return null;
  return { osmId: sel.feature.get('osm_id'), backendUrl: sel.feature.get('_backendUrl') ?? null };
}

/**
 * Add the pitch layer to `map`.
 * @param {{ map: import('ol/Map.js').default,
 *           load: (extent3857: number[], signal: AbortSignal) => Promise<import('ol/Feature.js').default[]> }} opts
 * @returns {() => void} detach
 */
export function attachPitchLayer({ map, load }) {
  const source = new VectorSource();
  const layer = new VectorLayer({
    source,
    zIndex: 9,
    visible: !!get(filterStore).standalonePitches,
    style: pitchLayerStyle(get(mappingDetail), selectedPitch(get(selection))),
    properties: { kind: 'overlay', selectable: true },
  });
  map.addLayer(layer);

  let abort = null;
  async function reload() {
    if (abort) abort.abort();
    abort = null;
    const view = map.getView();
    if (!layer.getVisible() || (view.getZoom() ?? 0) < PITCH_MIN_ZOOM) {
      source.clear();
      return;
    }
    abort = new AbortController();
    const { signal } = abort;
    try {
      const features = await load(view.calculateExtent(map.getSize()), signal);
      if (signal.aborted) return;
      source.clear();
      source.addFeatures(features);
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('[pitches] load failed:', err);
    }
  }
  const debounced = debounce(reload, 300);
  map.on('moveend', debounced);

  let detail = get(mappingDetail);
  let selected = selectedPitch(get(selection));
  const restyle = () => layer.setStyle(pitchLayerStyle(detail, selected));
  const unsubs = [
    mappingDetail.subscribe(v => { detail = v; restyle(); }),
    selection.subscribe(s => { selected = selectedPitch(s); restyle(); }),
    filterStore.subscribe(f => {
      const on = !!f.standalonePitches;
      if (on === layer.getVisible()) return;
      layer.setVisible(on);
      reload();
    }),
  ];
  reload();

  return () => {
    debounced.cancel?.();
    if (abort) abort.abort();
    map.un('moveend', debounced);
    unsubs.forEach(u => u());
    map.removeLayer(layer);
  };
}
