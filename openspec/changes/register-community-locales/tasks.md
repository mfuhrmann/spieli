## Tasks

### 1. Spike — verify the glob resolves across the Vite root boundary

Blocking. `locales/` sits outside Vite's root (`app/`). Everything below assumes this works.

- [ ] Add a throwaway `import.meta.glob('../../../locales/*.json')` in `app/src/lib/i18n.js`, log its keys
- [ ] Confirm all 13 paths appear under `make dev` (may need `server.fs.allow`)
- [ ] Confirm all 13 appear under `make build`, and that each locale lands in its **own** chunk — not the main bundle
- [ ] If it fails: fall back to generating an explicit loader map in `scripts/localeEligibility.mjs` and record the deviation in `design.md`

### 2. Eligibility module — single source of truth

- [ ] Create `scripts/localeEligibility.mjs`
- [ ] Export `EXCLUDED_NAMESPACES = ['equipAttr.themes.']` — opt-out with a counted default, with a comment on why themes are excluded (93 keys, 14% of score, tag-gated rendering)
- [ ] Export `THRESHOLD = 0.8`
- [ ] Export `denominatorKeys(enJson)` → flattened `en.json` keys minus excluded namespaces (expect 572 from 665)
- [ ] Export `completeness(localeJson, denominator)` → ratio of present keys
- [ ] Export `eligibleLocales(localesDir)` → sorted codes at or above threshold
- [ ] Fail loudly on malformed JSON so a bad Weblate merge breaks the build, not the browser

### 3. Wire eligibility into the build

- [ ] In `app/vite.config.js`, import the module and compute at config load
- [ ] Inject via `define: { __ELIGIBLE_LOCALES__: JSON.stringify(codes) }`
- [ ] Keep the existing `customLogger` and `svelte()` plugin untouched

### 4. Rewrite registration in `app/src/lib/i18n.js`

- [ ] Delete the hardcoded `SUPPORTED` array and both literal `register()` calls
- [ ] Build loaders from `import.meta.glob('../../../locales/*.json')`, deriving each code from its basename
- [ ] Register only codes present in `__ELIGIBLE_LOCALES__`
- [ ] Export the resolved eligible set so tests and `pickLocale` share one list
- [ ] Leave `fallbackLocale: 'en'` and the `document.documentElement.lang` assignment (`i18n.js:47-49`) as they are

### 5. Walk `navigator.languages` in `pickLocale`

- [ ] Widen the second parameter from `string` to `string[]` (ordered preference list)
- [ ] Resolution order: configured default → first eligible entry in the list (base tag) → `'en'`
- [ ] Keep the eligibility gate on the configured default, so an operator cannot pin a below-threshold locale
- [ ] Update the caller to pass `navigator.languages`, falling back to `[getLocaleFromNavigator()]` where unavailable
- [ ] Keep the function pure — no module state, no global stubbing in tests

### 6. Tests

- [ ] Carry the seven existing `i18n.test.js` assertions over to the array signature
- [ ] Add: `['sk', 'de']` resolves to `sk` once Slovak is eligible
- [ ] Add: `['xx', 'de']` resolves to `de` — the reporter's case, unsupported first choice falling through to a supported second
- [ ] Add: `['xx', 'yy']` resolves to `en`
- [ ] Add: empty / absent `navigator.languages` resolves to `en`
- [ ] Add: a configured but ineligible default falls through to the browser list
- [ ] **Reachability test** — every file in `locales/` is either registered or provably below threshold; no file may be silently unreachable. This is the assertion that would have caught #814 on the day `sk.json` merged
- [ ] Add: denominator excludes `equipAttr.themes.*` and equals 572 against the current `en.json`
- [ ] `make test-unit` passes

### 7. CI — fail PRs that push a live locale below the gate

- [ ] Extend `.github/workflows/i18n-guard.yml` with a second job; leave the existing ownership job untouched
- [ ] Compute eligibility on the base ref and the head ref using `scripts/localeEligibility.mjs`
- [ ] Fail when a locale eligible on base is ineligible on head; name the locale and both percentages
- [ ] Add an override label (mirror the existing `i18n-manual` escape-hatch pattern at `i18n-guard.yml:37`)
- [ ] Explain in the error output that the cause is new `en.json` strings enlarging the denominator, not a change to the locale itself

### 8. Verify end to end

- [ ] `make docker-build`, set browser preference to Slovak, confirm the UI renders Slovak on port 8080
- [ ] Confirm `<html lang="sk">` — the `regionLang` / UI-locale split from `e7ed0eb` must still hold, with OSM-derived text keeping `lang={regionLang}`
- [ ] Confirm `fr` and `es` now activate too — both have been dormant at ~97% alongside `sk`
- [ ] Confirm a held-back locale (e.g. `nl`) still resolves to `en`
- [ ] Confirm `DEFAULT_LOCALE=sk` in `.env` now works, and `DEFAULT_LOCALE=nl` still falls back
- [ ] DevTools Network: exactly one locale chunk fetched per session

### 9. Documentation

- [ ] `docs/contributing/translations.md` — **rewrite** the "Language graduation" section (lines 129-139), do not amend it. It currently states "there is no automatic threshold", then gives a three-step manual procedure (edit `SUPPORTED`, add a `register()` call, use the PR title `feat(i18n): add <Language> language support`). All of it is removed by this change. Replace with: the gate is computed from `locales/` at build time, state the denominator and why `equipAttr.themes.*` is excluded, and note that crossing the threshold takes effect on the next build with no PR
- [ ] Verify the rewritten section agrees with the Weblate `instructions` text word for word on the threshold and what triggers graduation — the drift between these two texts is what let three languages sit dormant
- [ ] `CLAUDE.md` — correct the stale claim that de/en/fr/es "include complete device name translations"; `sk` now qualifies, and registration is derived rather than listed
- [ ] Correct the Weblate project `instructions` field — it currently promises "a language appears in the app once it reaches 80% completion", which has never held. State the real denominator (excludes `equipAttr.themes.*`) and that graduation now takes effect on the next build with no manual step
- [ ] Post a Weblate announcement acknowledging that `sk`, `fr` and `es` each passed 80% and stayed invisible. Component scope (`/api/components/spieli/ui-strings/announcements/`), not translation scope — French and Spanish translators were failed identically and never heard about it. Writes are token-gated; UI path is Manage → Post announcement
- [ ] `make docs-build` passes

### 10. Follow-ups — file, do not implement here

- [ ] Issue: language switcher (none exists; note that it invalidates the single-assignment invariant at `i18n.js:46`)
- [ ] Issue or Weblate comment: invite `@menganito` to finish the 71 Slovak strings — **after** this ships, not as a condition of it
- [ ] Link #753 (archive `add-weblate-community-translations`) as a dependency for promoting `i18n-language-support` into `openspec/specs/`
