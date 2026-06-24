## Why

The current location marker is a 60px black arrow SVG (`arrow_down.svg`) rendered as an OL `Icon`. It has three problems (issue #658):

1. **Ugly / low contrast** — a black arrow doesn't stand out against the map's dark outlines and blends with playground polygons.
2. **Drifts on zoom** — the large pixel-based `Icon` with a manual anchor at `[0.5, 19/24]` appears to shift relative to map features when zooming, because the icon stays fixed-pixel while polygons rescale.
3. **No accuracy feedback** — the `location` store already carries `accuracy` (meters) from `pos.coords.accuracy`, but nothing visualizes it.

## What Changes

- Replace the `Icon`-based location style in `vectorStyles.js` with a two-layer `Style` array:
  1. **Accuracy ring** — an OL `Circle` geometry (real-world meters, scales with zoom) filled with semi-transparent blue, no stroke. Built from `accuracy` in the location store. Hidden when accuracy is very small (< 5m) to avoid visual noise.
  2. **Dot** — an OL `CircleStyle` image (fixed 8px radius), solid blue fill (`#4285F4`), 2px white stroke. Centered by definition — no anchor, no drift.
- Update the `location.subscribe` block in `Map.svelte` to maintain a second `Feature` for the accuracy circle geometry, updated on each position change via `circular()` from `ol/geom/Polygon`.
- Delete `app/public/img/icons/temaki/arrow_down.svg` (no longer used).

### Out of scope

- Replacing `navigator.geolocation` with `ol/Geolocation` (bigger refactor, follow-up).
- Pulsing/animation on the dot.
- Re-center affordance when user pans away (locate button already handles this).

## Capabilities

### New Capabilities

- `location-accuracy-ring`: Semi-transparent circle around the location dot showing GPS precision in real meters.

### Modified Capabilities

- `location-marker`: Dot replaces arrow icon; uses `CircleStyle` instead of `Icon`; no longer drifts on zoom; blue/white colour scheme contrasts with map palette.

## Impact

- **`app/src/lib/vectorStyles.js`** — replace `locationStyle` / `locationStyleFn` with dot style; add accuracy ring style factory that takes radius.
- **`app/src/components/Map.svelte`** — update location subscriber to create accuracy `Feature` with `Circle` geometry; update both features on position change.
- **`app/public/img/icons/temaki/arrow_down.svg`** — deleted.
- No API changes, no DB changes, no breaking changes, no new dependencies (all OL built-ins).
