import assert from 'node:assert/strict';
import { panoramaxUuidsFromTags } from './panoramax.js';

// Order: panoramax, then panoramax:0 to panoramax:9.
// Galgengraben, way 143374809 (#1028): panoramax:0 is a 360° photo.
assert.deepEqual(
  panoramaxUuidsFromTags({ 'panoramax:1': 'c', panoramax: 'a', 'panoramax:0': 'b', 'panoramax:9': 'd' }),
  ['a', 'b', 'c', 'd'],
);

// panoramax:0 without a plain panoramax tag.
assert.deepEqual(panoramaxUuidsFromTags({ 'panoramax:0': 'b' }), ['b']);

// A UUID in two tags comes back once.
assert.deepEqual(
  panoramaxUuidsFromTags({ panoramax: 'a', 'panoramax:0': 'a', 'panoramax:1': 'b' }),
  ['a', 'b'],
);

// Empty values, other keys and panoramax:10 are ignored.
assert.deepEqual(panoramaxUuidsFromTags({ panoramax: ' ', 'panoramax:10': 'x', image: 'y' }), []);

// Missing tags.
assert.deepEqual(panoramaxUuidsFromTags(null), []);
assert.deepEqual(panoramaxUuidsFromTags(undefined), []);

console.log('panoramax tests passed.');
