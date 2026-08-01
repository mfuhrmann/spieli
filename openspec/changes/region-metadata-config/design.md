## Context

spieli is deployed per region by environment variable. `oci/app/docker-entrypoint.app.sh` writes `app/public/config.js` at container start, `app/src/lib/config.js` reads `window.APP_CONFIG` and re-exports named constants. Everything region-specific is expected to flow through that path.

Three things currently bypass it by being hardcoded to Germany:

| Site | Value | Issue |
|---|---|---|
| `app/index.html:2` | `<html lang="de">` | #754 |
| `HoverPreview.svelte:45` | `lang="de"` on the title | #738 |
| `HoverPreview.svelte:28`, `PlaygroundPanel.svelte:378` | `country_code: 'de'` | #755 |

`lang=` appears exactly twice in the entire repo (verified by grep across `.js`, `.svelte`, `.html`, `.sh`). Playground names in `PlaygroundPanel.svelte:527` / `:546` and `NearbyPlaygrounds.svelte:131` carry no language annotation at all and inherit from `<html>`.

Note: #755 cites `PlaygroundPanel.svelte:364`; the call has since moved to `:378`.

## Goals / Non-Goals

**Goals:**
- Model the deployment's region as configuration rather than as literals scattered across components.
- Declare the UI language on the document and the data language on OSM-derived content, as two independent values.
- Resolve public holidays against the deployment's own country.
- Change nothing observable for an operator who updates no environment variables.

**Non-Goals:**
- Per-object language detection for OSM name tags.
- A runtime language switcher.
- Reworking `getPlaygroundTitle`'s return contract.

## Decisions

**D1 — Three separate values, not one "region" object.**
`regionLang`, `regionCountry`, `regionState` are independent: Switzerland is one country with several data languages, Germany is one country whose holidays vary by state. Collapsing them into a single locale-like string would force lossy derivations (`de-DE` → which state?). Naming follows the existing `region*` prefix in `config.js` (`regionChatUrl`, `regionPlaygroundWikiUrl`).

**D2 — `regionLang` is not derived from `defaultLocale`.**
They answer different questions. `defaultLocale` is "what language should the interface be in", `regionLang` is "what language are the playgrounds named in". A Fulda instance serving an English-speaking audience sets `defaultLocale=en` and keeps `regionLang=de`. Deriving one from the other would make that configuration impossible to express.

**D3 — `regionState` defaults to empty, not `he`.**
The running Hessen deployment currently passes no `state` and gets whatever `opening_hours` defaults to. Shipping `he` as the default would change holiday evaluation on that instance during an upgrade in which the operator changed nothing. Empty preserves today's behaviour; operators opt in. The same reasoning does not apply to `regionLang` / `regionCountry`, whose `'de'` defaults reproduce the current hardcoded literals exactly.

**D4 — Page language set once in `setupI18n()`, not subscribed.**
`resolveLocale()` runs once and the result never changes: there is no language switcher, and `$locale` is read in exactly one component (`DataContributionModal.svelte:24`) purely to select a wiki URL. A single assignment after `init()` is sufficient and honest about the current architecture. If a switcher is ever added, this becomes a `locale.subscribe()` — a three-line change at that point, not a reason to write it now.

**D5 — `hasOsmName(attr)` beside `getPlaygroundTitle`, not a changed return type.**
`getPlaygroundTitle` (`playgroundHelpers.js:11-17`) returns either OSM name tags or `t('nearby.defaultName')`, and callers cannot tell which. The two need different `lang` values, so the distinction has to become visible somewhere.

Returning `{ text, isFallback }` would break all five call sites, including `navigator.share` (`PlaygroundPanel.svelte:473`) and the deeplink title (`:499`), neither of which cares about language. A small sibling predicate keeps the existing contract intact and puts the branch only where it matters — the two components that render the title into the DOM.

**D6 — Annotate all name render sites, not just the one in the issue.**
#738 names `HoverPreview` because that is where the hardcoded literal is. The same annotation is missing at `PlaygroundPanel.svelte:527` / `:546` and `NearbyPlaygrounds.svelte:131`, and setting `<html lang>` from the UI locale is precisely what makes those sites newly wrong (see the proposal's diagram). Fixing one without the others is what produces the regression.

**D7 — `hyphens: auto` keeps working because it now gets the right dictionary.**
`lang="de"` at `HoverPreview.svelte:45` was introduced in 8e701c5 alongside `hyphens: auto` to break long German compounds. Its purpose is hyphenation, not annotation — which is why swapping it for `$locale` (the original suggestion in #738) would have been wrong: a German name in an English UI would hyphenate by English rules. `regionLang` is the value the CSS wanted all along; the a11y annotation comes along for free.

## Risks / Trade-offs

- [Mixed-language regions] A bilingual region (e.g. South Tyrol) gets one `regionLang` for all names, so some are annotated wrong. Still strictly better than a hardcoded literal, and per-object language is not derivable from OSM data. → Documented as a known limitation.
- [Operators must learn three new variables] All three have working defaults, so the failure mode of ignoring them is "same as today", not "broken". → `.env.example` and `docs/ops/configuration.md`.
- [`regionState` codes are library-specific] `opening_hours` expects its own state identifiers, which are not a public standard. → Link the library's documentation from the configuration reference rather than restating a list that can drift.
- [Holiday behaviour changes for operators who do set `regionState`] That is the point of the option, and it is opt-in.

## Testing

- Unit: `resolveLocale()` result reaches `document.documentElement.lang`; `hasOsmName(attr)` true for each of the six name tags in `getPlaygroundTitle` and false for an attribute object with none.
- Playwright: with `defaultLocale=en`, `document.documentElement.lang === 'en'` while a playground title carries `lang="de"`.
- Manual: hover a long compound name and confirm hyphenation still breaks it; VoiceOver or NVDA on an English deployment announces UI in English and playground names in German.

## Migration Plan

None required. All three variables have defaults matching current behaviour, so existing `.env` files keep working unchanged. The PR carries `requires-env-update` because the variables are new and operators should know they exist — not because anything breaks without them.
