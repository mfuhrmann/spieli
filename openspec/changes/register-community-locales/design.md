## Context

Thirteen locale files exist; two are registered. The eleven others have been merged, guarded by CI, and shipped to `main` without ever being reachable by a user.

The graduation step that should have connected them was specified — `add-weblate-community-translations/specs/i18n-language-support/spec.md` says a maintainer opens a PR adding the code to `SUPPORTED` once Weblate shows ≥80%. It was never performed, for any language. `fr` and `es` have sat at ~97% for months.

That is the design constraint worth taking seriously: **the failure mode was a manual step nobody was reminded to take.** A fix that adds five more entries to a hand-maintained array reproduces it on locale #14. Every decision below is chosen to remove the human from the loop or to make omission fail loudly.

## Decision 1 — Derive the locale list, do not maintain it

`SUPPORTED` and the paired `register()` calls become a single derived value.

```
locales/*.json ──► import.meta.glob (lazy loaders, keyed by path)
                          │
                          ├──► code = basename without extension
                          └──► eligible? ──► register()
```

`import.meta.glob` without `eager` returns `{ path: () => import(path) }` — the *keys* are known at build time, the *contents* are not loaded until called. That gives the locale list for free and keeps each locale in its own chunk.

**Why not a static list of thirteen `register()` calls.** It works today and breaks on the next language. Weblate opens languages autonomously; nothing in that path touches `app/src/`, so there is no review step at which someone would notice. This is exactly how #814 happened.

**Alternative considered — glob with `eager: true`.** Would make key counting trivial at module scope, but bundles all thirteen JSON files (~160 KB) into the main chunk so that twelve of them can be discarded. Rejected.

## Decision 2 — Eligibility is computed at build time, not at runtime

This is the non-obvious part of Decision 1. The locale *list* is free from the glob; the *key counts* are not, and counting keys requires reading file contents — the thing lazy loading exists to avoid.

So eligibility is computed in Node at config load and injected as a constant:

```
scripts/localeEligibility.mjs        ← reads locales/*.json, owns denominator + threshold
        │
        ├──► app/vite.config.js      define: { __ELIGIBLE_LOCALES__: [...] }
        ├──► .github/workflows/…     down-crossing guard
        └──► app/src/lib/i18n.test.js  reachability assertion
```

`i18n.js` then intersects the glob keys with `__ELIGIBLE_LOCALES__`. One module owns the threshold and the denominator; three consumers read it. A change to the rule cannot drift between the build, CI, and the tests.

**Why not a Vite plugin with a virtual module.** Cleaner in the abstract, more ceremony than this needs. `vite.config.js` currently carries only `svelte()` and a log filter; a `define` computed at config load is the smallest thing that works in both `make dev` and `make build`.

**Accepted limitation.** Editing a locale file during a running dev server does not update eligibility until restart, because `define` is resolved at config load. Weblate merges do not happen mid-session; not worth solving.

**Why not commit a generated `eligibleLocales.js`.** A committed artifact can go stale relative to `locales/`, which is the same class of bug as `SUPPORTED`.

## Decision 3 — The denominator excludes `equipAttr.themes.*`

Threshold: **≥80% of 572 keys** — `en.json` (665) minus 93 `equipAttr.themes.*`.

A percentage needs a denominator, and counting all 665 keys weights every string equally. They are not equal:

| Namespace | Keys | Share of score | When it renders |
|---|---:|---:|---|
| `appTitle` | 1 | 0.15% | every screen |
| `nav.*` | 3 | 0.45% | every screen |
| `equipment.*` | 158 | 23.8% | every playground panel |
| `equipAttr.themes.*` | 93 | 14.0% | only on a playground tagged with that exact theme |

`equipAttr.themes.*` is decorative theme nouns — `bear`, `bee`, `bible`, `beetle`, `caterpillar`, `aeroplane`. It is the rarest-firing text in the app and carries a seventh of the score.

Slovak shows what that distortion costs. Its 71-key gap is **47 theme nouns**, plus 14 `details.*` and 10 miscellaneous. It has 100% of nav, search, filters, POI and modals, all 158 device names, and all 117 non-theme `equipAttr` keys — yet scores 89.3% on the naive denominator, docked seven points for not naming cartoon animals.

| | all 665 | **−themes (572)** | −all equipAttr (455) |
|---|---:|---:|---:|
| `fr` / `es` | 96.7% | **96.2%** | 95.2% |
| `sk` | 89.3% | **95.8%** | 94.7% |
| eight others | 13.7% | **15.9%** | 20.0% |

`−themes` gives `sk` +6.5pp for a 0.5pp cost to `fr`/`es`. Excluding *all* of `equipAttr` is worse: `sk` translated the 117 non-theme attribute keys properly, and discarding them throws away real signal.

**Second-order benefit.** `equipAttr.themes.*` tracks `SUPPORTED_THEMES` in `app/src/lib/playgroundThemes.js`, and `playground-theme-highlight` is still in flight. It is the namespace most likely to keep growing — so excluding it also removes the largest source of denominator drift (see Decision 4).

**Cost, and how it is blunted.** Someone must classify namespaces as long-tail, in code — a judgment that can rot the way `SUPPORTED` did. The exclusion list is therefore **opt-out with a counted default**: a namespace nobody classifies is counted, so forgetting makes the gate *stricter*, never looser. The list holds one entry (`equipAttr.themes.`) with a comment explaining why.

**Threshold value.** 80%, carried over from the existing spec. Today any value from 21% to 89% partitions the thirteen files identically — the gap between 15.9% and 95.8% is enormous. The number only starts to matter as the held-back locales grow.

## Decision 4 — CI fails a PR that drops a live locale below the gate

`locales/en.json` is the denominator **and it grows**. Every new UI string a developer adds to `en.json`/`de.json` lowers every community locale's score without anyone touching those files:

```
sk 548/572 = 95.8% ✅
                        developer merges 90 new en.json strings
                        ──────────────────────────────────────►
sk 548/662 = 82.8% ✅   still safe

                        …and another 60
                        ──────────────────────────────────────►
sk 548/722 = 75.9% ⏸   Slovak silently disappears from the build
```

Nobody edited Slovak. A translator's finished work goes dark because someone shipped a feature — the same silent-disappearance class as #814 itself, which is precisely what this change exists to eliminate.

The guard fails the PR and names the locale. That puts the cost where the decision is: the developer adding strings can either accept it, split the batch, or apply the override label deliberately.

**Why fail rather than warn.** A warning annotation is scrolled past, and a scrolled-past warning is how a language goes dark unnoticed. Failing is recoverable in seconds via label; a silently dropped locale is discovered by a user filing an issue, months later.

**Why not never-demote.** Persisting "once live, always live" needs committed state — an allowlist file that CI appends to. It works, but it reintroduces the maintained artifact this change is removing. The CI guard achieves the same protection with no stored state.

## Decision 5 — `pickLocale()` walks the full `navigator.languages`

Independent of registration, and the second half of what confused the reporter. Resolution order becomes:

1. `APP_CONFIG.defaultLocale`, if eligible
2. first eligible entry in `navigator.languages`, each stripped to its base tag
3. `'en'`

With `sk` registered, the reporter's `[sk, de]` resolves to `sk`. If Slovak were still below threshold it would resolve to `de` — their actual second choice — instead of English.

`pickLocale` stays a pure function taking `(configured, browserLanguages)`, so `i18n.test.js` continues to exercise it without stubbing globals. The signature widens from a string to an ordered array; the existing seven assertions carry over as single-element arrays.

**Note on `defaultLocale`.** It is gated by the same eligibility set (current `i18n.js:22`), so an operator setting `DEFAULT_LOCALE=sk` today is silently ignored. That is fixed as a consequence, not as a separate decision. Keeping the gate on the configured value is deliberate: it prevents an operator pinning a 15%-translated locale.

## Risks

| Risk | Mitigation |
|---|---|
| `import.meta.glob` may not resolve across the Vite root boundary — `locales/` sits outside `app/` | Spike it first (task 1.1). The existing static `import('../../../locales/de.json')` works, so the path is served; glob outside root can still hit `server.fs.allow`. Verify in **both** `make dev` and `make build` before anything else is built on it. Fallback: move eligibility *and* loader generation into `scripts/localeEligibility.mjs` and inject an explicit map. |
| A locale registers but fails to load at runtime (malformed JSON from a Weblate merge) | `fallbackLocale: 'en'` already covers per-key misses; a whole-file parse failure surfaces in the console. The eligibility script parses every file, so malformed JSON fails the build, not the browser. |
| Eight new locales become selectable and someone reports "the UI is half English" | They cannot — all eight are at 15.9%, far below the gate. This is the gate's entire purpose. |
| `de` is both hand-editable and 100% by construction, so it can never fail the gate | Correct and intended. If a German translator ever joins Weblate, `de` leaves the hand-editable set (per the `i18n Guard` header note) and becomes subject to the gate like any other language. |

## Open questions

None blocking. The glob-across-root behaviour is the one unknown, and task 1.1 resolves it before the rest of the work depends on it.
