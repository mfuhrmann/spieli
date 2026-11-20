# Add a Playground Device

Every playground device that OSM records — slides, swings, climbing frames, balance beams — is defined in one place: `app/src/lib/objPlaygroundEquipment.js`. Adding support for a new device type is a small, self-contained change.

## Step 1 — Find the OSM tag

OSM uses the tag `playground=<value>` to describe individual devices. The full list of documented values is at [wiki.openstreetmap.org/wiki/Key:playground](https://wiki.openstreetmap.org/wiki/Key:playground).

For example, a balance beam is `playground=balance_beam`.

## Step 2 — Add an entry to `objDevices`

Open `app/src/lib/objPlaygroundEquipment.js` and add a new key to the `objDevices` object. Copy an existing entry as a template:

```js
balance_beam: {
    name_de: "Balancierbalken",
    image: "File:Playground balance beam.jpg",
    category: "balance",
},
```

**Field reference:**

| Field | Required | Description |
|---|---|---|
| `name_de` | Yes | German name. A last resort: a missing translation falls back to English first (svelte-i18n's `fallbackLocale`), and only a key missing in English too shows `name_de` |
| `image` | No | Commons (or OSM wiki) `File:` title for an example illustration (see Step 4). Omit if no good image exists. |
| `category` | Yes | Decides the device's symbol in the equipment list and on the map. One of `stationary`, `structure_parts`, `swing`, `balance`, `climbing`, `rotating`, `sand`, `water`, `activity`, `motion`, `topographical`, `other` — see [Equipment Types](../reference/equipment.md). |

Some older entries also carry `filterable` and `filter_attr`. The current app does not read them; leave them out.

## Step 3 — Add the display name

The panel shows `equipment.devices.<key>` from the locale files; a locale without the key shows the English one, and `name_de` appears only if English lacks it too. Add the key to `locales/en.json` and `locales/de.json` in the same commit (no other locale file by hand — see [Translation Workflow](translations.md)):

```json
"devices": {
    …
    "balance_beam": "Balance beam"
}
```

## Step 4 — Find an illustration

1. Search [commons.wikimedia.org](https://commons.wikimedia.org) for the device name in English.
2. Pick a clear, representative photo and copy its filename — it starts with `File:` (e.g. `File:Playground balance beam.jpg`).
3. Paste it as the `image` value.
4. Resolve it to a real file URL and commit the result with your change:

    ```bash
    make equipment-images     # rewrites app/src/lib/equipmentImages.generated.json
    ```

    The app serves illustrations from that generated file, through its own `/ext/wikimedia/` proxy, so without this step the image does not show. A name that resolves on neither Commons nor the OSM wiki fails the target. Details: [Update Generated Assets → Equipment illustrations](generated-assets.md#equipment-illustrations).

If you can't find a suitable image, omit the `image` field. No broken icon will appear.

## Step 5 — Verify locally

```bash
make dev
```

Open the app at `http://localhost:5173`, navigate to a playground that has the device, and expand its entry in the equipment list. You should see the name in the current language, the example image, and any attributes.

!!! tip "Finding a playground with a specific device"
    Use [Overpass Turbo](https://overpass-turbo.eu) — search for `playground=balance_beam` (replace with your tag value) to locate playgrounds that have it mapped.

## Step 6 — Commit and open a PR

```bash
git checkout -b feat/add-balance-beam-device
git add app/src/lib/objPlaygroundEquipment.js app/src/lib/equipmentImages.generated.json locales/en.json locales/de.json
git commit -m "feat: add balance_beam playground device"
git push -u origin feat/add-balance-beam-device
```

Then open a pull request on GitHub. See [CONTRIBUTING.md](https://github.com/mfuhrmann/spieli/blob/main/CONTRIBUTING.md) for the full PR walkthrough.
