# Translating spieli

[![Translation status](https://hosted.weblate.org/widget/spieli/ui-strings/svg-badge.svg)](https://hosted.weblate.org/engage/spieli/)

Thanks for helping translate spieli! Translation happens on [Weblate](https://weblate.org/), which hosts this project free of charge under its [Libre plan](https://weblate.org/hosting/). This guide explains everything you need to know.

## What is spieli?

spieli is a free, interactive playground map based on OpenStreetMap data.
Your translation makes it accessible to communities in your language.

## How to translate

1. Create a free account on [hosted.weblate.org](https://hosted.weblate.org)
2. Open the [**spieli** project](https://hosted.weblate.org/engage/spieli/), choose the **ui-strings** component, and pick your language — `ui-strings` is the one that reaches the app. The project also lists a `glossary` component; that holds terminology only, and translations made there never ship.
3. Click any untranslated string and type your translation
4. Save — that's it. No GitHub account needed.

## What to translate

Most strings are short UI labels like buttons, tooltips, and status messages:

| English | Example translation (DE) |
|---|---|
| `Show my location` | `Meinen Standort anzeigen` |
| `Filter` | `Filter` |
| `Reset all` | `Alle zurücksetzen` |

## Things to keep as-is

- Placeholders like `{regionName}`, `{count}`, `{name}` — do not translate these
- The `{count, plural, ...}` structure — only translate the text inside the `{}`

## Plural forms

Some strings contain a count, like:

```
{count, plural, one {# bench} other {# benches}}
```

Keep the `{count, plural, ...}` wrapper and translate only the text inside.
Weblate shows this as a **single input field** — you must write the complete ICU string including all plural forms for your language.

**Languages with two plural forms** (German, Spanish, French, Italian, Dutch, Swedish, Portuguese):

```
{count, plural, one {# Bank} other {# Bänke}}
```

**Languages with no plural forms** (Japanese): use `other` only:

```
{count, plural, other {# ベンチ}}
```

**Languages with four plural forms** (Polish, Ukrainian, Czech, Slovak) — you must include `one`, `few`, `many`, and `other`.

Careful here: these languages all use four categories, but they **disagree about which category a large number lands in**. Getting this wrong is easy, because the string still looks complete and Weblate reports no error — it just renders the wrong word for every count from 5 upwards.

| Language | `many` matches | `other` matches |
|---|---|---|
| Polish | integers 0 and 5+, **except** those ending in 2–4 (22 → `few`; 12–14 stay `many`) | fractions (1.5) |
| Ukrainian | integers 0 and 5+, **except** those ending in 1–4 (21 → `one`, 22 → `few`; 11–14 stay `many`) | fractions (1.5) |
| Czech, Slovak | fractions (1.5) | **integers 0 and 5+** (21, 22, 101 all `other`) |

So in Polish and Ukrainian the genitive plural goes in `many`, and in Czech and Slovak it goes in `other`.

Polish example — genitive `ławek` in `many`, fraction form in `other`:
```
{count, plural, one {# ławka} few {# ławki} many {# ławek} other {# ławki}}
```

Ukrainian example — genitive `лавок` in `many`, fraction form in `other`:
```
{count, plural, one {# лавка} few {# лавки} many {# лавок} other {# лавки}}
```

Czech example — genitive `laviček` in **`other`**, fraction form in `many`:
```
{count, plural, one {# lavička} few {# lavičky} many {# lavičky} other {# laviček}}
```

Slovak example — genitive `lavičiek` in **`other`**, fraction form in `many`:
```
{count, plural, one {# lavička} few {# lavičky} many {# lavičky} other {# lavičiek}}
```

If you are unsure which category your language uses for a given number, check it directly. In any browser's developer console:

```js
new Intl.PluralRules('cs').select(5)   // "other"
new Intl.PluralRules('pl').select(5)   // "many"
```

This is the same rule the app uses at runtime, so it is authoritative.

Weblate will warn you if the ICU *syntax* is broken — fix any flagged strings before saving. It cannot tell you that a grammatically correct form is sitting in the wrong category, so that part is on you.

## When does my translation go live?

The app currently ships **German, English and Slovak**. Other languages are collected in Weblate and switched on by a maintainer once they reach **80% completion**. That is a manual step: crossing 80% does not switch your language on by itself, but the project's tests then flag it, so it does not get forgotten. Until then your work is saved in the repository and visible to other translators.

A language can also be held back on purpose. French and Spanish currently are ([#752](https://github.com/mfuhrmann/spieli/issues/752)): no region on the map serves those languages yet, so they wait until one does. Your work is kept and goes live with it.

If your language has reached 80%, is not held back, and is still not live, open an issue — that is the signal to activate it.

Browsers whose language is not live get the English version. See [User Guide → Language](../user-guide.md#language).

## Questions?

Open an issue at [github.com/mfuhrmann/spieli](https://github.com/mfuhrmann/spieli)
or leave a comment directly in Weblate.
