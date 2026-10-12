import assert from 'node:assert/strict';
import { hidpiStyleOptions } from './hidpiRenderer.js';

function fakeContext() {
  const calls = [];
  return {
    calls,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    scale: (x, y) => calls.push(`scale ${x} ${y}`),
  };
}

// 1. Drawing at pixelRatio 2: context scaled, coordinates converted to CSS px
{
  let seen;
  const { renderer } = hidpiStyleOptions((coords, state) => { seen = { coords, pr: state.pixelRatio }; });
  const ctx = fakeContext();
  renderer([200, 100], { context: ctx, pixelRatio: 2 });
  assert.deepEqual(seen, { coords: [100, 50], pr: 2 });
  assert.deepEqual(ctx.calls, ['save', 'scale 2 2', 'restore']);
}

// 2. Multi-point coordinates are converted pointwise
{
  let seen;
  const { renderer } = hidpiStyleOptions(coords => { seen = coords; });
  renderer([[20, 40], [60, 80]], { context: fakeContext(), pixelRatio: 2 });
  assert.deepEqual(seen, [[10, 20], [30, 40]]);
}

// 3. Hit detection is 1:1 even though the state reports the screen's ratio
{
  let seen;
  const { hitDetectionRenderer } = hidpiStyleOptions((coords, state) => { seen = { coords, pr: state.pixelRatio }; });
  const ctx = fakeContext();
  hitDetectionRenderer([7, 7], { context: ctx, pixelRatio: 3 });
  assert.deepEqual(seen, { coords: [7, 7], pr: 1 });
  assert.deepEqual(ctx.calls, []);
}

console.log('hidpiRenderer tests passed.');
