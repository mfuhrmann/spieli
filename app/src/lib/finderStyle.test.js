import assert from 'node:assert/strict';
import { finderPlaygroundStyle, finderClusterStyleFn } from './finderStyle.js';
import { clusterRingStyleFn } from './clusterStyle.js';

const feat = (props) => ({ get: (k) => props[k], getProperties: () => props });

// 1. Unselected playground → a single pin style
{
  const s = finderPlaygroundStyle(feat({ osm_id: 1 }), null);
  assert.ok(!Array.isArray(s), 'unselected renders the pin only');
}

// 2. Selected playground (matched by osm_id, not identity) → outline + pin
{
  const s = finderPlaygroundStyle(feat({ osm_id: 7 }), 7);
  assert.ok(Array.isArray(s) && s.length === 2, 'selected renders outline + pin');
  assert.equal(s[1], finderPlaygroundStyle(feat({ osm_id: 8 }), 7), 'same pin style');
  assert.ok(s[0].getStroke(), 'outline has a stroke');
}

// 3. Pin is drawn at the interior point, never as the polygon itself
{
  const pin = finderPlaygroundStyle(feat({ osm_id: 1 }), null);
  assert.equal(typeof pin.getGeometry(), 'function', 'pin uses a geometry function');
  assert.equal(pin.getFill(), null, 'no polygon fill in finder mode');
}

// 4. Finder cluster style is distinct from the completeness ring style
{
  assert.notEqual(finderClusterStyleFn(feat({ count: 5 })), clusterRingStyleFn(feat({ count: 5 })));
}

console.log('finderStyle tests passed.');
