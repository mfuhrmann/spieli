# Translating spieli

[![Translation status](https://hosted.weblate.org/widget/spieli/ui-strings/svg-badge.svg)](https://hosted.weblate.org/engage/spieli/)

Thanks for helping translate spieli! Translation happens on [Weblate](https://weblate.org/), which hosts this project free of charge under its [Libre plan](https://weblate.org/hosting/). This guide explains everything you need to know.

## What is spieli?

spieli is a free, interactive playground map based on OpenStreetMap data.
Your translation makes it accessible to communities in your language.

## How to translate

1. Create a free account on [hosted.weblate.org](https://hosted.weblate.org)
2. Open the [**spieli** project](https://hosted.weblate.org/engage/spieli/) and pick your language
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

**Languages with four plural forms** (Polish, Czech, Ukrainian) — you must include `one`, `few`, `many`, and `other`:

Polish example:
```
{count, plural, one {# ławka} few {# ławki} many {# ławek} other {# ławki}}
```

Czech example:
```
{count, plural, one {# lavička} few {# lavičky} many {# laviček} other {# lavičky}}
```

Ukrainian example:
```
{count, plural, one {# лавка} few {# лавки} many {# лавок} other {# лавки}}
```

Weblate will warn you if the ICU syntax is broken — fix any flagged strings before saving.

## Things to keep as-is

- Placeholders like `{regionName}`, `{count}`, `{name}` — do not translate these
- The `{count, plural, ...}` structure — only translate the text inside the `{}`

## When does my translation go live?

The app currently ships German and English only. Other languages are
collected in Weblate and activated by a maintainer once they reach
**80% completion** — it is a manual step, not an automatic threshold, so
crossing 80% does not switch your language on by itself. Until then your
work is saved in the repo and visible to other translators.

If your language is complete and still not live, open an issue — that is
the signal to activate it.

## Questions?

Open an issue at [github.com/mfuhrmann/spieli](https://github.com/mfuhrmann/spieli)
or leave a comment directly in Weblate.
