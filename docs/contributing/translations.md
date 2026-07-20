# Translate spieli

spieli uses [hosted.weblate.org](https://hosted.weblate.org) for community translations. Translators work through a web UI — no GitHub account or knowledge of JSON is required.

## How translations reach the app

```
Translator edits strings       Weblate pushes commit         Maintainer merges PR
on hosted.weblate.org    →     to weblate-translations   →   into main
  (web UI, no GitHub)           branch on GitHub              → make docker-build
                                                               → live in app
```

Weblate batches translation saves and periodically pushes a commit to the `weblate-translations` branch, then opens — or reuses — a pull request against `main`. It keeps **one long-lived PR** ("Translations update from Hosted Weblate") rather than opening a new one per batch, so the same PR number accumulates commits until a maintainer merges it. The maintainer reviews the JSON diff and merges; the next `make docker-build` bundles the updated locale files into the app.

Weblate never pushes directly to `main` — every translation update goes through a PR.

The live component is [`spieli/ui-strings`](https://hosted.weblate.org/projects/spieli/ui-strings/). The project also contains an auto-created `spieli/glossary` component backed by a local-only repository; it holds terminology, has no git remote, and needs no maintenance.

### If the component gets stuck

Weblate rebases its commits onto `main` on every pull. If a commit on `main` touched the same locale file Weblate has pending, that rebase fails and **stays** failed — Weblate stops pulling entirely, and no translation can reach the repo until it is resolved. The component sat in exactly this state from May to July 2026.

Recovery, in order:

1. Land anything valuable from `weblate-translations` in a normal PR first, since step 3 discards it. Check what is actually on that branch — it may be far behind `main` and its translations may be worse than what the repo already has.
2. Confirm the salvaged work is merged into `main`.
3. Weblate → Operations → Repository maintenance → **Reset all changes in the Weblate repository**. This resets to upstream and discards Weblate's local commits.

Do **not** use "Reset and reapply translations" for this — it replays the pending commits onto the reset state and reproduces the same conflict.

The `i18n Guard` CI job exists to prevent the situation recurring; see below.

## Language graduation

A language becomes visible in the app only when it reaches **≥ 80% completion** (≥ 529 of 661 keys) in Weblate. Below that threshold the locale file exists in the repo and Weblate keeps improving it, but the running app ignores it — users with that browser language fall back to English.

When a language crosses the threshold:

1. Open a PR editing `app/src/lib/i18n.js`:
    - Add the language code to the `SUPPORTED` array
    - Add a `register()` call: `register('<lang>', () => import('../../../locales/<lang>.json'));`
2. Title the PR: `feat(i18n): add <Language> language support`
3. After merging, run `make docker-build` — users with that browser language now see the app in their language

## Adding new UI strings (developer workflow)

New translatable strings **must** be added to `locales/en.json` first. `locales/de.json` must be updated in the **same commit**. Adding a key only to `de.json` breaks Weblate — it uses `locales/en.json` as the source template and won't surface keys that are absent from it.

**Never edit the other locale files by hand.** `es.json`, `fr.json`, `sk.json` and the rest are owned by Weblate. Editing one directly collides with whatever a translator has pending for that same file, and Weblate's rebase onto `main` breaks — which is exactly how the component sat in a merge-conflict error state from May to July 2026, blocking every translation from reaching the repo.

The `i18n Guard` CI job (`.github/workflows/i18n-guard.yml`) enforces this: a PR touching any locale other than `en.json` or `de.json` fails.

| File | Who edits it |
|---|---|
| `locales/en.json` | Developers — Weblate's source template |
| `locales/de.json` | Developers — maintainer-authored, primary deployment language |
| everything else | Weblate translators only |

Two legitimate exceptions bypass the guard:

- PRs from the `weblate-translations` branch — Weblate's own translation pushes
- PRs labelled `i18n-manual` — landing or repairing a translation out-of-band

Keys follow the existing nested structure. Plural strings use ICU inline format:

```json
"deviceCount": "{count, plural, one {# piece of equipment} other {# pieces of equipment}}"
```

When you add a new key, Weblate automatically marks it as needing translation in all registered languages.

## Weblate component settings

The `.weblate.yml` file in the repo root records the component configuration. Weblate does not read it — it is a checklist for manual setup and a record of what the live component is set to.

| Setting | Value | Where |
|---|---|---|
| File format | `json-nested` | Settings → Files |
| File mask | `locales/*.json` | Settings → Files |
| Source template | `locales/en.json` | Settings → Files |
| Source language | `en` | Settings → Basic |
| Push branch | `weblate-translations` | Settings → Version control |
| JSON indentation | `2`, spaces | Settings → Files |
| Sort JSON keys | **off** | Settings → Files |
| Cleanup translation files | enabled | Operations → Add-ons |

`json_indent` replaced the "Customize JSON output" add-on, which Weblate removed in 5.13. Leave key sorting off — Weblate follows the `en.json` template order, and sorting would reshuffle every locale file into one unreviewable diff.

The **Cleanup translation files** add-on (`weblate.cleanup.generic`) removes keys no longer present in `en.json`. Without it, locale files accumulate stale keys.

ICU plural strings appear as a single field in the Weblate editor. Translators write the full ICU expression for their language.

!!! warning "Weblate cannot validate plural categories"

    Weblate's checks catch broken ICU *syntax*, but not a grammatically correct form placed in the wrong plural category. Nine Slovak strings shipped with the genitive plural in `many` — a category that, for Czech and Slovak, matches only fractional numbers — so every count from 5 upwards rendered ungrammatically (#747). The string parsed fine and Weblate reported no error.

    [`translation-guide.md`](translation-guide.md) documents the per-language rule and how translators can verify it with `Intl.PluralRules`.
