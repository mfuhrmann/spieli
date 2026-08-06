## Why

`app/src/lib/i18n.js` registers exactly two locales:

```js
const SUPPORTED = ['de', 'en'];
register('de', () => import('../../../locales/de.json'));
register('en', () => import('../../../locales/en.json'));
```

`locales/` contains **thirteen** locale files. Eleven of them are unreachable at runtime. No fetch is ever attempted for them, nothing errors, nothing logs — the community translation pipeline is a silent no-op end to end.

Weblate merges a translation → `i18n Guard` passes → it lands on `main` → it never reaches a user.

`git log app/src/lib/i18n.js` is two commits deep. The array has read `['de', 'en']` since svelte-i18n was installed (#167). This is not a regression; the wire was never connected.

Reported as [issue #814](https://github.com/mfuhrmann/spieli/issues/814) for Slovak. The reporter's diagnosis was correct — `locales/sk.json` is fine at 95.8% complete, including all 158 device names. The defect is entirely in registration.

**The graduation process already existed and was already specified.** `add-weblate-community-translations/specs/i18n-language-support/spec.md` requires that a language reaching 80% in Weblate be added to `SUPPORTED` by a maintainer PR. That step was never performed for `sk`, and never for `fr` or `es` either, despite both sitting at ~97%. A process that depends on a human noticing a Weblate percentage is the root cause, so this change replaces it with a derived one.

**And the threshold was published to translators as a promise.** The `instructions` field on the Weblate project — shown to every translator on the project page — states:

> **When does my translation go live?**
> A language appears in the app once it reaches **80% completion**.
> Until then your work is saved and visible to other translators.

That has never been true for any language. `sk` at 95.8%, `fr` and `es` at 96.2% each cleared the stated bar and stayed invisible. Volunteers were given a concrete, checkable condition, met it, and got silence — with no signal anywhere that anything was wrong, because nothing failed.

This is the strongest argument for deriving the gate rather than hand-applying it. The 80% number was never the problem; the fact that honouring it depended on someone remembering is. A published promise enforced by a build step cannot quietly go unkept.

The reporter also hit a second, independent defect. `pickLocale()` consults only `navigator.language` (that is, `navigator.languages[0]`):

| Firefox preference order | `languages[0]` | in `SUPPORTED`? | resolved |
|---|---|---|---|
| sk | `sk` | no | `en` |
| de | `de` | yes | `de` |
| sk, de | `sk` | no | `en` ← should be `de` |

The third row is theirs. A user whose second-choice language *is* supported still gets English.

## What Changes

- **Derive the locale list from the filesystem.** `SUPPORTED` and the `register()` calls stop being hand-maintained. `import.meta.glob('../../../locales/*.json')` supplies lazy per-locale loaders; the set of eligible codes comes from a build-time eligibility computation. Adding locale #14 requires no code change.
- **Gate on completeness.** A locale registers only at ≥80% translated, measured against a denominator of 572 keys — `locales/en.json` (665) minus the 93 `equipAttr.themes.*` keys. Ships `de en es fr sk`; holds back the eight chrome-only locales at 15.9%.
- **Walk `navigator.languages`.** `pickLocale()` takes the ordered browser list and returns the first eligible entry, instead of testing only the first.
- **Fail PRs that drop a live locale below the gate.** `locales/en.json` is the denominator and it grows; a feature-sized batch of new strings can silently push an active language out of the build. CI names the locale and fails, overridable by label.
- **Assert reachability in a unit test.** Every file in `locales/` is either registered or explicitly below threshold. A test of this shape would have failed the day `sk.json` merged.

## Capabilities

### Modified Capabilities

- `i18n-language-support`: language graduation becomes automatic and filesystem-derived rather than a manual maintainer PR; the completeness denominator excludes decorative theme keys; browser-language detection considers the full preference list.

### New Capabilities

*(none — this restores and automates behaviour the existing capability already specified)*

## Locale inventory

Source template `locales/en.json`: 665 keys. Denominator: 572 (excludes 93 `equipAttr.themes.*`).

| Locale | Keys | % of 572 | Result |
|---|---|---|---|
| `de` | 665 | 100.0% | registers |
| `en` | 665 | 100.0% | registers (source) |
| `fr` | 643 | 96.2% | registers |
| `es` | 643 | 96.2% | registers |
| `sk` | 594 | 95.8% | registers ← #814 |
| `cs` `it` `ja` `nl` `pl` `pt` `sv` `uk` | 91 each | 15.9% | held back |

No locale file contains an empty string value — Weblate omits untranslated keys rather than blanking them — so a key count is an honest completeness measure here.

The eight held-back locales share an identical 91-key set: chrome only (`modal`, `poi`, `accordion`, `search`, `nav`), with zero `equipment.*` device names. Registering them would produce a UI that is ~16% translated and 84% English, device names included.

## Impact

- **`app/src/lib/i18n.js`** — registration derived, `pickLocale()` walks the preference list.
- **`app/vite.config.js`** — computes eligibility at config load and injects it; first non-`svelte()` build-time logic in this file.
- **`scripts/localeEligibility.mjs`** (new) — single source of truth for the denominator and threshold, imported by the Vite config, the CI guard, and the unit test.
- **`.github/workflows/i18n-guard.yml`** — gains the down-crossing check. Existing ownership check is untouched.
- **Bundle** — 11 additional lazy JSON chunks; exactly one is fetched per session. Main chunk unchanged.
- **Ops** — no env var, no schema, no re-import. `make docker-build` suffices. No release label required.

## Out of Scope

- **Completing the Slovak translation.** `sk` has 71 untranslated keys, 47 of them `equipAttr.themes.*`. `locales/sk.json` is Weblate-owned; editing it by hand collides with Weblate's pending changes and breaks the component's rebase onto `main` — the failure documented in the `i18n Guard` header and issue #742, which left the component in a merge-conflict error state from 2026-05-01. The remaining strings go through Weblate, by a Slovak speaker, on their own schedule. Registration does not depend on it: per-key fallback means `sk` is useful at 95.8% today.
- **A language switcher.** None exists; the reporter had to edit Firefox settings to test. It touches UI, persistence, and invalidates the "`resolveLocale()` runs once, so `document.documentElement.lang` is a single assignment" invariant at `app/src/lib/i18n.js:46`. Separate issue.
- **Changing `regionLang`.** Region data language is configured independently of UI locale and is unaffected.

## Follow-ups to file

1. Language switcher (no issue exists).
2. Invite `@menganito` to finish the 71 Slovak strings in Weblate — *after* this ships, not as a condition of it.
3. Archive `add-weblate-community-translations` (#753), which still holds the `i18n-language-support` capability outside `openspec/specs/`.
