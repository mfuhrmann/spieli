# Translate spieli

[![Translation status](https://hosted.weblate.org/widget/spieli/ui-strings/svg-badge.svg)](https://hosted.weblate.org/engage/spieli/)

spieli is translated with [Weblate](https://weblate.org/), which hosts the project free of charge under its [Libre plan](https://weblate.org/hosting/) for free software projects. Translators work through a web UI — no GitHub account or knowledge of JSON is required.

**[Help translate spieli →](https://hosted.weblate.org/engage/spieli/)**

## How translations reach the app

```
Translator edits strings       Weblate pushes commit         Maintainer merges PR
on hosted.weblate.org    →     to weblate-translations   →   into main
  (web UI, no GitHub)           branch on GitHub              → make docker-build
                                                               → live in app
```

Weblate batches translation saves and periodically pushes a commit to the `weblate-translations` branch. The maintainer opens a PR from `weblate-translations` → `main`, reviews the JSON diff, and merges. The next `make docker-build` bundles the updated locale files into the app.

Weblate never pushes directly to `main` — every translation update goes through a PR.

## Language graduation

Weblate collects translations for every registered language, but the app loads only the languages listed in `SUPPORTED` in `app/src/lib/i18n.js` — today that is `de` and `en`. There is no automatic threshold: reaching 100% in Weblate does not by itself make a language visible. Until a maintainer registers it, the locale file sits in the repo and users with that browser language fall back to English.

**≥ 80% completion** is the bar a maintainer uses to decide a language is ready to activate. When a language crosses it:

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

The `.weblate.yml` file in the repo root documents the intended component configuration for the manual setup step. Key settings:

| Setting | Value |
|---|---|
| File format | `json-nested` |
| File mask | `locales/*.json` |
| Source template | `locales/en.json` |
| Source language | `en` |
| Push branch | `weblate-translations` |

ICU plural strings appear as a single field in the Weblate editor. Translators write the full ICU expression for their language — Weblate's built-in checks catch syntax errors.
