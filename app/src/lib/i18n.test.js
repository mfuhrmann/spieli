import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
// Named export, not default: this package's default is the CJS namespace
// object, and using it yields "IntlMessageFormat is not a constructor" for
// every string — which reads like 140 malformed locale strings rather than one
// wrong import.
import { IntlMessageFormat } from 'intl-messageformat';

// NOTE: this must stay on the same major as the parser svelte-i18n actually
// runs (it pins intl-messageformat ^10.5.3). If the devDependency drifts ahead,
// npm nests a second copy and this guard starts validating against a parser the
// app never uses — it would pass strings that break at runtime, and fail ones
// that work, both without a word. Dependabot is told to hold the major in
// .github/dependabot.yml; lift that together with svelte-i18n, not before.

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
// form rather than degrading, and on a placeholder the caller does not pass.
// A registered locale carrying one of those breaks the view that renders it.
// So these tests check both directions — every locale file, registered or not,
// must parse and use only en's placeholders (#751), every registered locale
// must exist, and a locale must not be registered without being listed.

const root = new URL('../../../', import.meta.url);
const src = readFileSync(new URL('lib/i18n.js', new URL('app/src/', root)), 'utf8');

// One definition of "broken", run with the real parser rather than a grep for
// `{{ }}`: a locale broken for any other reason (an unbalanced brace, a plural
// block missing `other`) must fail just the same.
//
// A string that parses can still throw at render: an argument en does not
// have (a translated `{nombreRegion}` for `{regionName}`) is never passed, and
// intl-messageformat raises MISSING_VALUE. So each string's argument names
// must be a subset of its en counterpart's. Fewer is fine — a translation may
// drop a value its language does not need.
//
// ignoreTag mirrors svelte-i18n's own default (runtime.cjs sets it), without
// which every string containing <br> fails as UNCLOSED_TAG — including en's
// and de's, which ship and work. A check stricter than the runtime reports
// defects that do not exist.
function argNames(ast, out = new Set()) {
    for (const el of ast) {
        if (typeof el.value === 'string' && el.type >= 1 && el.type <= 6) out.add(el.value);
        for (const opt of Object.values(el.options ?? {})) argNames(opt.value, out);
        if (el.children) argNames(el.children, out);
    }
    return out;
}

function parse(str, lang) {
    return new IntlMessageFormat(str, lang, undefined, { ignoreTag: true }).getAst();
}

function leafStrings(obj, path = '', out = new Map()) {
    for (const [k, v] of Object.entries(obj)) {
        const at = path ? `${path}.${k}` : k;
        if (typeof v === 'string') out.set(at, v);
        else if (v && typeof v === 'object') leafStrings(v, at, out);
    }
    return out;
}

function broken(dict, lang, enArgs) {
    const bad = [];
    for (const [at, v] of leafStrings(dict)) {
        let names;
        try {
            names = argNames(parse(v, lang));
        } catch (e) {
            bad.push(`${lang} ${at}: ${e.message.split('\n')[0]}`);
            continue;
        }
        const allowed = enArgs.get(at) ?? new Set();
        const unknown = [...names].filter(n => !allowed.has(n));
        if (unknown.length) bad.push(`${lang} ${at}: placeholder not in en: {${unknown.join('}, {')}}`);
    }
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

// Every locale file, registered or not.
const locales = readdirSync(new URL('locales/', root))
    .filter(f => f.endsWith('.json'))
    .map(f => f.slice(0, -5));

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
    for (const lang of registered) {
        assert.ok(locales.includes(lang), `registered locale has no file: ${lang}`);
    }
}

// --- every locale parses under ICU, registered or not ---------------------
// A string the formatter cannot parse throws at render. Checking only the
// registered locales let ten unregistered ones carry 190 `{{placeholder}}`
// strings for months (#751), which turned graduating any of them into a
// repair job. Checking every file fails the Weblate PR that introduces a bad
// string, so it is fixed in Weblate before it lands and a locale that reaches
// the graduation bar can simply be registered.
//
// Collected across all locales before asserting, so one CI run lists every
// broken string rather than one language per Weblate round trip.
{
    const enArgs = new Map(
        [...leafStrings(load('en'))].map(([at, v]) => [at, argNames(parse(v, 'en'))]),
    );
    const bad = locales.flatMap(lang => broken(load(lang), lang, enArgs));
    assert.deepEqual(bad, [],
        'locale strings that would throw at render — fix them in Weblate, not in the file');
}

// --- the locales NOT registered are excluded for a stated reason ----------
// Recorded so the exclusion is a decision rather than an oversight — which is
// exactly what #814 turned out to be. Every locale parses (above), so a locale
// is excluded either for coverage, or because a maintainer decided not to ship
// it and recorded why in DECLINED. Any other locale that reaches the bar
// should be registered, and this fails until someone does.
//
// 0.8 is the documented graduation bar (docs/contributing/translations.md),
// applied to key coverage rather than byte size for the reason given above.
//
// es and fr sit just under the bar (79% on 2026-10-20) and are translated in
// Weblate, but no backend serves a Spanish- or French-speaking region, so
// shipping them was declined (#752). Remove an entry to graduate it.
const DECLINED = { es: '#752', fr: '#752' };
{
    const enKeys = leafKeys(load('en'));

    for (const lang of Object.keys(DECLINED)) {
        assert.ok(!registered.includes(lang), `${lang} is registered but listed in DECLINED`);
    }

    for (const lang of locales) {
        if (registered.includes(lang) || lang in DECLINED) continue;

        const have = leafKeys(load(lang));
        const covered = [...enKeys].filter(k => have.has(k)).length / enKeys.size;

        assert.ok(
            covered < 0.8,
            `${lang} is ${(covered * 100).toFixed(0)}% complete, `
            + 'so it should be registered in app/src/lib/i18n.js — see docs/contributing/translations.md',
        );
    }
}

// --- locale resolution ----------------------------------------------------
// The checks above are static: they read i18n.js as text and never run it.
// These call the real resolver, because the locale it returns is not only the
// UI language — svelte-i18n mirrors it onto document.documentElement.lang, so
// it also decides which speech synthesiser a screen reader picks for the whole
// page (WCAG 3.1.1). That mirroring is asserted end to end in
// tests/document-language.spec.js; what is asserted here is the value being
// mirrored. The static half above cannot see a regression in either.
//
// Importing i18n.js pulls in svelte-i18n and config.js, which the static half
// deliberately avoids. Verified to work under plain `node` — no
// --conditions=node needed in the test:unit script.
{
    const { pickLocale } = await import('./i18n.js');

    assert.equal(pickLocale('en', 'de-DE'), 'en',
        'a configured default beats the browser language');
    assert.equal(pickLocale('', 'de-DE'), 'de',
        'the browser language is used when no default is configured, stripped to its base tag');
    assert.equal(pickLocale('', 'de'), 'de',
        'a browser language with no region subtag works unchanged');
    assert.equal(pickLocale('', 'ja-JP'), 'en',
        'an unsupported browser language falls back to en');
    assert.equal(pickLocale('ja', 'de-DE'), 'de',
        'an unsupported configured locale falls through to a supported browser language');
    assert.equal(pickLocale('ja', 'fr-FR'), 'en',
        'unsupported on both counts falls back to en');
    assert.equal(pickLocale('', null), 'en',
        'no browser language at all falls back to en');

    // Resolution must agree with the SUPPORTED list the static half parsed,
    // rather than with a second hardcoded copy of it — otherwise graduating a
    // locale passes every assertion here while never actually being selectable.
    for (const lang of supported) {
        assert.equal(pickLocale(lang, 'ja-JP'), lang,
            `${lang} is in SUPPORTED but pickLocale will not select it`);
    }
}

console.log('i18n.test.js: all assertions passed');
