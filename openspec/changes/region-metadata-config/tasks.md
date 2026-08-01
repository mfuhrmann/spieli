## Tasks

### Region metadata configuration

- [x] Add `regionLang` (default `'de'`), `regionCountry` (default `'de'`), `regionState` (default `''`) to `app/src/lib/config.js`
- [x] Emit all three from `oci/app/docker-entrypoint.app.sh` into `app/public/config.js`
- [x] Add the three variables with defaults and comments to `.env.example`
- [x] Add the local dev defaults to `app/public/config.js`
- [x] Pass the new variables through `compose.yml` and `compose.prod.yml` (not in the original plan — without this the `.env` values never reach the container)

### Page language (closes #754)

- [x] Assign `document.documentElement.lang` from the resolved locale in `setupI18n()` (`app/src/lib/i18n.js`)
- [x] Unit test: resolved locale reaches `document.documentElement.lang` for configured-default, browser-language, and fallback paths

### Content language (closes #738)

- [x] Add `hasOsmName(attr)` to `app/src/lib/playgroundHelpers.js` beside `getPlaygroundTitle`
- [x] Unit test: `hasOsmName` true for each of the six name tags, false when none are present
- [x] `HoverPreview.svelte:45` — replace hardcoded `lang="de"` with `regionLang`, or the interface locale when the title is the `nearby.defaultName` fallback
- [x] `PlaygroundPanel.svelte:527` and `:546` — add the same `lang` handling to both `panel-title` headings
- [x] `NearbyPlaygrounds.svelte:131` — `lang={regionLang}` on `item.name`, interface locale on the `nearby.unknownName` fallback
- [ ] Verify `hyphens: auto` still breaks a long compound name in the hover preview

### Opening hours (closes #755)

- [x] `HoverPreview.svelte:28` — `country_code` from `regionCountry`, add `state` when `regionState` is non-empty
- [x] `PlaygroundPanel.svelte:378` — same treatment (issue cites `:364`; the call has moved)
- [x] Verify a `PH`-referencing `opening_hours` value evaluates differently under two different `regionCountry` values

### Verification

- [x] Playwright: with `defaultLocale=en`, `document.documentElement.lang === 'en'` while a playground title carries `lang="de"`
- [x] `make test` passes
- [x] `make docker-build`, re-check on port 8080 with defaults — no observable change from today
- [x] Re-check with `regionLang=en` / `regionCountry=at` set — attributes and holiday evaluation follow
- [ ] Manual: NVDA or VoiceOver on an `en` deployment — UI announced in English, playground names in German

### Docs

- [x] `docs/ops/configuration.md` — three new variables, with a link to the `opening_hours` library's state codes rather than an inline list
- [x] `docs/contributing/frontend-guide.md` — the rule that OSM-derived text carries `regionLang` and UI text carries the interface locale
- [x] `CLAUDE.md` — note the new config exports
- [x] `make docs-build` passes

### Release

- [x] Label the PR `requires-env-update`; next release is a minor bump
