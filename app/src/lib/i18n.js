import { register, init, getLocaleFromNavigator, locale } from 'svelte-i18n';
import { defaultLocale as configuredLocale } from './config.js';

// Locales the app will actually serve. `locales/` holds thirteen files; a file
// being present is NOT what makes a locale reachable — it has to be registered
// here and listed below, or resolveLocale() never selects it and svelte-i18n
// never fetches it. Nothing errors and nothing logs when that happens, which
// is why #814 was reported as "translation not activating" against a locale
// file that was perfectly good.
//
// Graduating a locale has two requirements, and both are load-bearing:
//
//   1. Substantially complete. An 80%-translated locale is a worse experience
//      than English, because the gaps are scattered rather than contained.
//   2. ICU-parseable. svelte-i18n formats through intl-messageformat, which
//      throws SyntaxError: MALFORMED_ARGUMENT on the i18next-style
//      `{{placeholder}}` form. That is a render-time throw, not a graceful
//      fallback, so a single bad string breaks the view that uses it.
//
// Current state, measured rather than assumed (see i18n.test.js, which fails
// the build if a registered locale stops parsing):
//
//   de, en, sk  registered — complete and ICU-clean
//   fr, es      ~96% complete but carrying strings the formatter cannot
//               parse (14 and 12 respectively); blocked on #751, and #752 is
//               the graduation task once it lands. They are the only two
//               worth graduating: the rest are nowhere near the bar.
//   others      ~20% translated, so placeholders are not what holds them back
const SUPPORTED = ['de', 'en', 'sk'];

register('de', () => import('../../../locales/de.json'));
register('en', () => import('../../../locales/en.json'));
register('sk', () => import('../../../locales/sk.json'));

/**
 * Resolve the locale to use, in order:
 * 1. Deployment-configured default (APP_CONFIG.defaultLocale)
 * 2. Browser language, stripped to its base tag
 * 3. Fallback to 'en'
 *
 * Kept free of module state so it is testable without stubbing globals — the
 * value it returns is also the document language, so it is worth pinning down.
 *
 * @param {string} configured  APP_CONFIG.defaultLocale, possibly empty
 * @param {string|null} browserLanguage  e.g. 'de-DE'
 */
export function pickLocale(configured, browserLanguage) {
    if (configured && SUPPORTED.includes(configured)) {
        return configured;
    }
    const browser = browserLanguage?.split('-')[0];
    if (browser && SUPPORTED.includes(browser)) {
        return browser;
    }
    return 'en';
}

function resolveLocale() {
    return pickLocale(configuredLocale, getLocaleFromNavigator());
}

// The page language (WCAG 3.1.1) is NOT set here, and that is deliberate.
// svelte-i18n's runtime subscribes to its own locale store and does it for us:
//
//   internalLocale.subscribe((newLocale) => {
//     if (typeof window !== "undefined" && newLocale != null) {
//       document.documentElement.setAttribute("lang", newLocale);
//     }
//   });                       -- svelte-i18n 4.0.1, dist/runtime.js:313
//
// So `<html lang>` already follows whatever init() resolves to, and the
// explicit assignment #754 proposed would have been a second writer of the
// same attribute with no observable effect. The issue grepped this repo, found
// nothing writing it, and concluded the attribute was never updated — true of
// our code, false of the running page.
//
// What we do NOT have is a guarantee: this is inherited library behaviour that
// a minor upgrade could drop silently, and a screen reader announcing every
// label with the wrong phonetics is invisible to everyone not using one. That
// is what tests/document-language.spec.js pins down. If those page-language
// tests ever fail after a dependency bump, the fix is to reinstate the
// assignment here.
export async function setupI18n() {
    await init({
        fallbackLocale: 'en',
        initialLocale: resolveLocale(),
    });
}

export { locale };
