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

const registered = [...src.matchAll(/register\('([a-z-]+)'/g)].map(m => m[1]);
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
// This is the check that makes graduating a locale safe: a file with
// i18next-style {{placeholders}} throws at render, so it must not be
// registered until those are fixed (#751).
{
    for (const lang of registered) {
        const dict = JSON.parse(
            readFileSync(new URL(`locales/${lang}.json`, root), 'utf8'),
        );
        const bad = [];
        const walk = (obj, path) => {
            for (const [k, v] of Object.entries(obj)) {
                const at = path ? `${path}.${k}` : k;
                if (typeof v === 'string') {
                    try {
                        // ignoreTag mirrors svelte-i18n's own default
                        // (runtime.cjs sets it), without which every string
                        // containing <br> fails as UNCLOSED_TAG — including
                        // en's and de's, which ship and work. A check stricter
                        // than the runtime reports defects that do not exist.
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
        assert.deepEqual(bad, [],
            `${lang} has strings intl-messageformat cannot parse:\n  ${bad.join('\n  ')}`);
    }
}

// --- the locales NOT registered are excluded for a stated reason ----------
// Recorded so the exclusion is a decision rather than an oversight — which is
// exactly what #814 turned out to be. A locale that becomes complete and
// clean should be registered; this asserts the reason it is not, so the day it
// stops being true the test says so.
{
    const en = JSON.parse(readFileSync(new URL('locales/en.json', root), 'utf8'));
    const enSize = JSON.stringify(en).length;

    for (const f of readdirSync(new URL('locales/', root)).filter(f => f.endsWith('.json'))) {
        const lang = f.slice(0, -5);
        if (registered.includes(lang)) continue;
        const raw = readFileSync(new URL(`locales/${f}`, root), 'utf8');
        const malformed = (raw.match(/\{\{[^}]+\}\}/g) || []).length;
        const ratio = JSON.stringify(JSON.parse(raw)).length / enSize;
        assert.ok(
            malformed > 0 || ratio < 0.8,
            `${lang} is complete (${(ratio * 100).toFixed(0)}% of en) and ICU-clean, `
            + 'so it should be registered in i18n.js — see #751/#752',
        );
    }
}

console.log('i18n.test.js: all assertions passed');
