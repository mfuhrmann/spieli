# Translating spieli

Thanks for helping translate spieli! This guide explains everything you need to know.

## What is spieli?

spieli is a free, interactive playground map based on OpenStreetMap data.
Your translation makes it accessible to communities in your language.

## How to translate

1. Create a free account on [hosted.weblate.org](https://hosted.weblate.org)
2. Open the **spieli** project and pick your language
3. Click any untranslated string and type your translation
4. Save — that's it. No GitHub account needed.

## What to translate

Most strings are short UI labels like buttons, tooltips, and status messages:

| English | Example translation (DE) |
|---|---|
| `Show my location` | `Meinen Standort anzeigen` |
| `Filter` | `Filter` |
| `Reset all` | `Alle zurücksetzen` |

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
| Polish, Ukrainian | integers 0 and 5+ | fractions (1.5) |
| Czech, Slovak | fractions (1.5) | **integers 0 and 5+** |

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

## Things to keep as-is

- Placeholders like `{regionName}`, `{count}`, `{name}` — do not translate these
- The `{count, plural, ...}` structure — only translate the text inside the `{}`

## When does my translation go live?

A language appears in the app once it reaches **80% completion**.
Until then your work is saved and visible to other translators.

## Questions?

Open an issue at [github.com/mfuhrmann/spieli](https://github.com/mfuhrmann/spieli)
or leave a comment directly in Weblate.
