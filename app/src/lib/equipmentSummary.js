// Equipment count summary, shared by PlaygroundPanel (overview strip) and
// EquipmentList. osm2pgsql emits one row per outer ring for multipolygons, so a
// feature's osm_id can repeat — dedupe before counting. Grouped structure
// children count individually (a structure with 3 swings is still 3 swings).

import { dedupeByOsmId } from './utils.js';

/**
 * @param {Array} features - standalone equipment GeoJSON features
 * @param {Array<{structure: Object, children: Object[]}>} groups - grouped structures
 * @returns {{devices:number, fitness:number, pitches:number, benches:number, shelters:number, picnic:number}}
 */
export function summarizeEquipment(features = [], groups = []) {
  const src = [...dedupeByOsmId(features), ...groups.flatMap(g => g.children)];
  const count = pred => src.filter(f => pred(f.properties)).length;

  return {
    devices:  count(p => p.playground && p.playground !== 'yes' && p.playground !== 'structure'),
    fitness:  count(p => p.leisure === 'fitness_station'),
    pitches:  count(p => p.leisure === 'pitch'),
    benches:  count(p => p.amenity === 'bench'),
    shelters: count(p => p.amenity === 'shelter'),
    picnic:   count(p => p.leisure === 'picnic_table'),
  };
}
