import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
// Named export, not default: this package's default is the CJS namespace
// object, and using it yields "IntlMessageFormat is not a constructor" for
// every string — which reads like 140 malformed locale strings rather than one
// wrong import.
import { IntlMessageFormat } from 'intl-messageformat';

// The guard that #814 needed and did not have.
//
// A locale file being present in locales/ does not make it reachable: it has
// to be registered in i18n.js AND listed in SUPPORTED. When it is not, nothing
// errors and nothing logs — the locale is simply never selected. That is how
// Slovak shipped complete and unreachable, and why the reporter found a clean
// console.
//
// The opposite failure is louder but no better: svelte-i18n formats through
// intl-messageformat, which THROWS on the i18next-style `{{placeholder}}`
// form rather than degrading. A registered locale carrying one of those breaks
// the view that renders it. So these tests check both directions — every
// registered locale must exist and must parse, and a locale must not be
// registered without being listed.

const root = new URL('../../../', import.meta.url);
const src = readFileSync(new URL('lib/i18n.js', new URL('app/src/', root)), 'utf8');

// One definition of "parseable", used by both halves below. The graduation
// gate and the exclusion check previously disagreed — the gate ran the real
// parser while the exclusion check grepped for `{{ }}` — so a locale broken
// for any other reason (an unbalanced brace, a plural block missing `other`)
// counted as clean and the exclusion assertion told the maintainer to register
// it. That is the inversion this file exists to prevent.
//
// ignoreTag mirrors svelte-i18n's own default (runtime.cjs sets it), without
// which every string containing <br> fails as UNCLOSED_TAG — including en's
// and de's, which ship and work. A check stricter than the runtime reports
// defects that do not exist.
function unparseable(dict, lang) {
    const bad = [];
    const walk = (obj, path) => {
        for (const [k, v] of Object.entries(obj)) {
            const at = path ? `${path}.${k}` : k;
            if (typeof v === 'string') {
                try {
                    new IntlMessageFormat(v, lang, undefined, { ignoreTag: true });
                } catch (e) {
                    bad.push(`${at}: ${e.message.split('\n')[0]}`);
                }
            } else if (v && typeof v === 'object') {
                walk(v, at);
            }
        }
    };
    walk(dict, '');
    return bad;
}

// Leaf key paths, so completeness is measured as KEY COVERAGE rather than
// serialized byte size. Size is not a proxy for coverage: it counts the
// English key names too, and it moves with how verbose a language is. Measured
// on this repo, sk is 0.957 by size but 0.889 by keys, and a size ratio of 0.8
// corresponds to roughly 74% coverage — below the documented 80% bar, so a
// size-based gate would demand graduation of a locale the policy calls unready
// and break CI on main for every unrelated PR until someone did.
function leafKeys(obj, path = '', out = new Set()) {
    for (const [k, v] of Object.entries(obj)) {
        const at = path ? `${path}.${k}` : k;
        if (typeof v === 'string') {
            if (v.trim()) out.add(at);
        } else if (v && typeof v === 'object') {
            leafKeys(v, at, out);
        }
    }
    return out;
}

function load(lang) {
    return JSON.parse(readFileSync(new URL(`locales/${lang}.json`, root), 'utf8'));
}

// Both quote styles: a future register("pt", …) must not be invisible to the
// pairing assertion below, since a registered-but-unlisted locale is the exact
// silent no-op of #814.
const registered = [...src.matchAll(/register\(\s*['"]([a-zA-Z-]+)['"]/g)].map(m => m[1]);
const supported = JSON.parse(
    src.match(/const SUPPORTED = (\[[^\]]*\])/)[1].replace(/'/g, '"'),
);

// --- registration and the SUPPORTED list must agree ----------------------
// Either half alone is a no-op: a registered locale that is not listed is
// never selected, and a listed locale that is not registered resolves to a
// missing dictionary.
{
    assert.deepEqual([...registered].sort(), [...supported].sort(),
        'every registered locale must be in SUPPORTED and vice versa');
    assert.ok(supported.includes('en'), 'en is the fallbackLocale and must be registered');
}

// --- every registered locale file exists ---------------------------------
{
    const available = readdirSync(new URL('locales/', root))
        .filter(f => f.endsWith('.json'))
        .map(f => f.slice(0, -5));
    for (const lang of registered) {
        assert.ok(available.includes(lang), `registered locale has no file: ${lang}`);
    }
}

// --- every registered locale parses under ICU ----------------------------
// This is what makes graduating a locale safe: a string the formatter cannot
// parse throws at render, so it must not be registered until that is fixed
// (#751).
{
    for (const lang of registered) {
        assert.deepEqual(unparseable(load(lang), lang), [],
            `${lang} has strings intl-messageformat cannot parse`);
    }
}

// --- the locales NOT registered are excluded for a stated reason ----------
// Recorded so the exclusion is a decision rather than an oversight — which is
// exactly what #814 turned out to be. A locale that becomes complete AND
// parseable should be registered, and this fails until someone does.
//
// 0.8 is the documented graduation bar (docs/contributing/translations.md),
// applied to key coverage rather than byte size for the reason given above.
{
    const enKeys = leafKeys(load('en'));

    for (const f of readdirSync(new URL('locales/', root)).filter(f => f.endsWith('.json'))) {
        const lang = f.slice(0, -5);
        if (registered.includes(lang)) continue;

        const dict = load(lang);
        const bad = unparseable(dict, lang);
        const have = leafKeys(dict);
        const covered = [...enKeys].filter(k => have.has(k)).length / enKeys.size;

        assert.ok(
            bad.length > 0 || covered < 0.8,
            `${lang} is ${(covered * 100).toFixed(0)}% complete and parses cleanly, `
            + 'so it should be registered in app/src/lib/i18n.js — see #752',
        );
    }
}

console.log('i18n.test.js: all assertions passed');
