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

Weblate batches translation saves and periodically pushes a commit to the `weblate-translations` branch, then opens — or reuses — a pull request against `main`. It keeps **one long-lived PR** ("Translations update from Hosted Weblate") rather than opening a new one per batch, so the same PR number accumulates commits until a maintainer merges it. The maintainer reviews the JSON diff and merges; the next `make docker-build` bundles the updated locale files into the app.

Weblate never pushes directly to `main` — every translation update goes through a PR.

Merge that PR with whichever button you like. `main` allows only squash and rebase merges, and both rewrite Weblate's commits, but the component is set to `merge_style: merge` so it integrates `main` by merging rather than by replaying its own commits — see [If the component gets stuck](#if-the-component-gets-stuck).

The live component is [`spieli/ui-strings`](https://hosted.weblate.org/projects/spieli/ui-strings/). The project also contains an auto-created `spieli/glossary` component backed by a local-only repository; it holds terminology, has no git remote, and needs no maintenance.

### If the component gets stuck

Weblate integrates `main` on every pull. When that integration fails it **stays** failed — Weblate stops pulling entirely, no translation can reach the repo, and `auto_lock_error` locks the component. Two distinct causes have hit this project.

**1. An upstream commit edited a locale Weblate had pending.** Editing `fr.json` or `sk.json` by hand collides with whatever a translator has unmerged for that file. The component sat in this state from May to July 2026. The `i18n Guard` CI job exists to prevent it; see below.

**2. A Weblate PR was squash-merged.** `main` is governed by the `protect_main` ruleset, whose `allowed_merge_methods` is `["squash", "rebase"]` — both rewrite commits, so a Weblate PR can never land with its commits intact and they never become ancestors of `main`. Under the old `merge_style: rebase` Weblate replayed all of them on every update, and they conflicted against the already-squashed state:

```
Rebasing (2/12)
dropping d2359df Translated using Weblate (Czech) -- patch contents already upstream
CONFLICT (content): Merge conflict in locales/fr.json
error: could not apply 5ed1863... Translated using Weblate (French)
```

This was structural — it recurred on every Weblate PR merge. Fixed on 2026-07-29 (#794) by switching the component to `merge_style: merge`, which integrates `main` by merging instead of replaying. **If this cause reappears, check that setting first.**

#### Diagnosing

`wlc repo` reports the component's git state, including the full failure text:

```console
$ wlc repo
merge_failure: CONFLICT (content): Merge conflict in locales/fr.json
needs_commit: False
needs_merge: True
```

`needs_commit: False` means no translator edits are sitting uncommitted in Weblate's database — important, because a reset discards Weblate's git commits and you want to know nothing unsaved is riding on them.

#### Recovery

Before resetting, prove no translation is lost. Add Weblate's exported repo as a remote and diff every locale against `main`:

```bash
git remote add weblate https://hosted.weblate.org/git/spieli/ui-strings/
git remote update weblate
for f in locales/*.json; do
  echo "$f: $(git diff --numstat origin/main weblate/main -- "$f")"
done
```

A locale that prints nothing is byte-identical on both sides and cannot lose anything. For any locale that does differ, inspect the diff and decide which side is correct — then:

1. Land anything valuable from Weblate in a normal PR first, labelled `i18n-manual`, since the reset discards it.
2. Confirm the salvaged work is merged into `main`.
3. Reset Weblate onto upstream:

    ```bash
    wlc lock && wlc reset && wlc pull && wlc unlock
    ```

    The same four actions exist in the web UI under Operations → Repository maintenance.

4. Verify: `wlc repo` shows an empty `merge_failure` and `needs_merge: False`, and `git remote update weblate` leaves `weblate/main` at the same commit as `origin/main`.

Do **not** use "Reset and reapply translations" for this — it replays the pending commits onto the reset state and reproduces the same conflict.

A reset touches only Weblate's git checkout. Its database is untouched, so per-string translation history, authorship, suggestions and comments all survive.

#### The `wlc` CLI

[`wlc`](https://docs.weblate.org/en/latest/wlc.html) drives the Weblate API from a shell. It is not packaged for Debian or Arch, and PEP 668 blocks `pip install --user` on most distros:

```bash
uv tool install wlc     # or: pipx install wlc
```

Configure `~/.config/weblate`, then `chmod 600` it — it holds an API token from [your profile](https://hosted.weblate.org/accounts/profile/#api):

```ini
[weblate]
url = https://hosted.weblate.org/api/
translation = spieli/ui-strings

[keys]
https://hosted.weblate.org/api/ = YOUR_API_KEY
```

| Command | Does |
|---|---|
| `wlc repo` | Show git state — `merge_failure`, `needs_commit`, `needs_merge` |
| `wlc commit` | Flush pending translator edits into Weblate's git |
| `wlc lock` / `wlc unlock` | Block translations while doing repository surgery |
| `wlc reset` | Hard-reset Weblate's checkout onto upstream |
| `wlc pull` | Fetch and integrate `main` |

Lock state is not in `wlc show`; read it from `GET /api/components/spieli/ui-strings/lock/`.

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

The `.weblate.yml` file in the repo root records the component configuration. Weblate does not read it — it is a checklist for manual setup and a record of what the live component is set to.

| Setting | Value | Where |
|---|---|---|
| File format | `json-nested` | Settings → Files |
| File mask | `locales/*.json` | Settings → Files |
| Source template | `locales/en.json` | Settings → Files |
| Source language | `en` | Settings → Basic |
| Push branch | `weblate-translations` | Settings → Version control |
| Merge style | `merge` | Settings → Version control |
| JSON indentation | `2`, spaces | Settings → Files |
| Sort JSON keys | **off** | Settings → Files |
| Cleanup translation files | enabled | Operations → Add-ons |

**Merge style must stay `merge`.** Weblate's default is `rebase`, which replays Weblate's own commits onto `main` on every pull. Because `main` allows only squash and rebase merges, those commits never become ancestors of `main`, so the replay repeats forever and eventually conflicts — see [If the component gets stuck](#if-the-component-gets-stuck). With `merge`, Weblate merges `main` into its branch instead and a squashed upstream PR integrates cleanly.

`json_indent` replaced the "Customize JSON output" add-on, which Weblate removed in 5.13. Leave key sorting off — Weblate follows the `en.json` template order, and sorting would reshuffle every locale file into one unreviewable diff.

The **Cleanup translation files** add-on (`weblate.cleanup.generic`) removes keys no longer present in `en.json`. Without it, locale files accumulate stale keys.

ICU plural strings appear as a single field in the Weblate editor. Translators write the full ICU expression for their language.

!!! warning "Weblate cannot validate plural categories"

    Weblate's checks catch broken ICU *syntax*, but not a grammatically correct form placed in the wrong plural category. Nine Slovak strings shipped with the genitive plural in `many` — a category that, for Czech and Slovak, matches only fractional numbers — so every count from 5 upwards rendered ungrammatically (#747). The string parsed fine and Weblate reported no error.

    [`translation-guide.md`](translation-guide.md) documents the per-language rule and how translators can verify it with `Intl.PluralRules`.
