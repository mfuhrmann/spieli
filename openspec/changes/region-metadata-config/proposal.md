## Why

Three open issues look unrelated and turn out to share one missing concept: **the deployment does not know which region it serves.**

- [#754](https://github.com/mfuhrmann/spieli/issues/754) — `app/index.html:2` is `<html lang="de">`, static. Nothing writes `document.documentElement.lang` anywhere in the repo. `SUPPORTED` in `app/src/lib/i18n.js:4` is `['de', 'en']`, so an English-locale visitor gets the entire UI announced with German phonetics. WCAG 3.1.1 Language of Page, **Level A**, live today.
- [#738](https://github.com/mfuhrmann/spieli/issues/738) — `HoverPreview.svelte:45` hardcodes `lang="de"` on the playground title. The title is OSM data (`getPlaygroundTitle`, `playgroundHelpers.js:11-17`), so for a German deployment the value is *correct* — but it is hardcoded, and it does not survive a non-German deployment. WCAG 3.1.2 Language of Parts, **Level AA**.
- [#755](https://github.com/mfuhrmann/spieli/issues/755) — `new OpeningHours(…, { address: { country_code: 'de' } })` at `HoverPreview.svelte:28` and `PlaygroundPanel.svelte:378`. `PH` rules resolve against the German holiday calendar regardless of deployment region, and even the German case is incomplete because the library wants a `state` alongside the country.

`config.js` has 17 exports and none of them models region language or region country. `defaultLocale` is not a substitute: a Fulda instance may run `defaultLocale=en`, and its playgrounds are still called what they are called.

**#754 and #738 must ship together.** `lang=` appears exactly twice in the repo — `index.html:2` and `HoverPreview.svelte:45`. Every other playground-name rendering inherits from `<html>`:

```
TODAY, en-locale visitor          AFTER #754 ALONE, en-locale visitor
  <html lang="de">                  <html lang="en">        ← #754 fixed
    HoverPreview   lang=de  ok        HoverPreview  lang=de  ok
    PlaygroundPanel  inherits de ok   PlaygroundPanel  inherits en  ← NEWLY WRONG
    NearbyPlaygrounds inherits de ok  NearbyPlaygrounds inherits en ← NEWLY WRONG
```

Fixing the page language alone trades one Level A violation for new Level AA violations at the unmarked name sites. Net improvement, but a real regression — avoided entirely by landing the content language in the same change.

## What Changes

**Region metadata in configuration** (`app/src/lib/config.js`, `oci/app/docker-entrypoint.app.sh`, `.env.example`)
- `regionLang` (default `'de'`) — BCP 47 language of the OSM data this deployment serves.
- `regionCountry` (default `'de'`) — ISO 3166-1 alpha-2 country for public-holiday resolution.
- `regionState` (default `''`) — sub-country code (e.g. `he`) for holiday calendars that vary by state. Empty means the library default, preserving today's behaviour.

**Page language** (`app/src/lib/i18n.js`) — closes #754
- `setupI18n()` assigns `document.documentElement.lang` from the resolved locale.

**Content language** (`HoverPreview.svelte`, `PlaygroundPanel.svelte`, `NearbyPlaygrounds.svelte`, `playgroundHelpers.js`) — closes #738
- OSM-derived playground names carry `lang={regionLang}`; the CSS `hyphens: auto` added in 8e701c5 keeps a dictionary to work with.
- The i18n fallback strings (`nearby.defaultName`, `nearby.unknownName`) carry the UI locale, not the region language.
- A `hasOsmName(attr)` helper lets call sites tell the two apart — `getPlaygroundTitle` currently returns a plain string and its callers cannot know which branch produced it.

**Opening hours** (`HoverPreview.svelte:28`, `PlaygroundPanel.svelte:378`) — closes #755
- `country_code` from `regionCountry`; `state` added when `regionState` is non-empty.

## Capabilities

### New Capabilities

- `document-language`: The page declares the UI language, and OSM-derived content declares the region's data language, independently of each other.
- `region-aware-opening-hours`: `opening_hours` evaluation resolves public holidays against the deployment's own country and state.

### Modified Capabilities

*(none — no existing spec-level requirements change)*

## Impact

- **Frontend only.** No API, no DB, no store changes.
- **`requires-env-update` label.** Per the versioning rule, the next release is a **minor** bump.
- Defaults reproduce today's behaviour exactly, so an operator who updates nothing sees no change. `regionState` defaults to empty rather than `he` on purpose: shipping a state code would silently alter holiday evaluation on the running Hessen instance during an upgrade nobody asked for.
- Docs: `docs/ops/configuration.md` (three new vars), `docs/contributing/frontend-guide.md` (language-attribute rule).
- No new i18n strings. Nothing enters the Weblate cycle.

## Sequencing

#752 (graduate `sk`/`es`/`fr`) edits `SUPPORTED` at `i18n.js:4`; this change adds a line inside `setupI18n()` below it. The conflict surface is one file and a few lines either way, so neither blocks the other — and #752 is itself blocked on #751. Holding a Level A conformance fix behind two open i18n tickets costs more than the rebase it avoids.

## Out of Scope

- Per-object language for OSM names. `name:de` / `name:fr` variants exist, but the language of any individual `name` tag is not knowable from the data. Region-level approximation is the correct granularity, and is what 3.1.2 asks for.
- A runtime language switcher. `$locale` is read in one component (`DataContributionModal.svelte:24`, to pick a wiki URL), so the locale is fixed at init. A single assignment suffices; `locale.subscribe()` would be premature.
- `visualViewport`, focus management, and any other a11y work not covered by #737, #738, #754.
