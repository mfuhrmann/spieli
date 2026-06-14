# Icons

The app uses two icon systems:

## 1. Map Icons (Temaki)

Playground equipment, trees, and other map features use **Temaki** SVG icons from the [rapideditor/temaki](https://github.com/rapideditor/temaki) library.

### Icon Location

Pre-rendered Temaki SVG files are stored in:
```
/public/img/icons/temaki/
```

### Icon Sizing

Icons are sized using a multiplier formula:

```javascript
// For objFeatures (benches, shelters, trees, etc.)
iconSizePx = (feat.size || 12) * 3.33;  // size 12 → ~40px

// For playground devices
iconSizePx = 40;  // Default for all device icons
```

The `size` field in `objPlaygroundEquipment.js` defines the base size (typically 10-16).

### Icon Mapping System

Icons are mapped to features through a three-tier fallback:

#### Tier 1: Device-Specific Mapping (`deviceIconMap`)
Individual playground devices map directly to Temaki icon names:

```javascript
// app/src/lib/vectorStyles.js
deviceIconMap = {
  slide:        'slide',
  seesaw:       'seesaw',
  swing:        'swing',
  zipwire:      'zip_wire',
  climbingframe:'climbing_frame',
  // ... 20+ more mappings
}
```

#### Tier 2: Category Mapping (`iconMap`)
Devices without specific mappings fall back to category icons:

```javascript
iconMap = {
  swing:       'swing',
  climbing:   'climbing_frame',
  balance:    'balance_beam',
  sand:       'sandbox',
  water:      'water',
  // ... etc.
}
```

#### Tier 3: objFeatures Mapping
Non-device features (benches, shelters, waste baskets, trees) use `objFeatures`:

```javascript
// app/src/lib/objPlaygroundEquipment.js
objFeatures = {
  shelter: { tags: {amenity: "shelter"}, icon: "shelter", size: 12 },
  bench:    { tags: {amenity: "bench"},   icon: "bench",   size: 12 },
  tree:     { tags: {natural: "tree"},    icon: "tree_broadleaved", size: 12 },
  // ... etc.
}
```

objFeatures icon names are mapped to Temaki via `pngToTemaki`:

```javascript
pngToTemaki = {
  shelter:            'shelter',
  bench_backrest_yes: 'bench',
  tree_broadleaved:   'tree_broadleaved',
  tree_needleleaved:  'tree_needleleaved',
  // ... etc.
}
```

### Geometry Handling

Icons are rendered differently based on feature geometry:

| Geometry | Rendering |
|----------|-----------|
| Point | Icon at feature coordinates |
| LineString | Icon at midpoint |
| Polygon | Icon at centroid |
| MultiPolygon | Icon at centroid |
| Tree LineString | Icons at each vertex |

### Layer Visibility

- **Polygon tier** (zoom > 13): Equipment and tree icons visible
- **Cluster tier** (zoom ≤ 13): Only cluster rings visible (no individual device icons)

## 2. UI Icons (lucide-svelte)

User interface elements (buttons, controls, etc.) use [lucide-svelte](https://lucide.dev/) icons.

These are imported directly in components:

```svelte
<script>
  import { Plus, Minus, Search } from 'lucide-svelte';
</script>

<button><Plus size={20} /></button>
```

## Adding New Icons

### For Playground Equipment

1. Add device to `objDevices` in `objPlaygroundEquipment.js`
2. Add mapping in `deviceIconMap` or `iconMap` in `vectorStyles.js`
3. Ensure the Temaki SVG file exists in `/public/img/icons/temaki/`

### For Features (benches, shelters, etc.)

1. Add entry to `objFeatures` in `objPlaygroundEquipment.js`
2. Add mapping in `pngToTemaki` in `vectorStyles.js`
3. Ensure the Temaki SVG file exists in `/public/img/icons/temaki/`

### For UI Elements

Import directly from `lucide-svelte` in the component.
