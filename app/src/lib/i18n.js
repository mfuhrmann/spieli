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
//   fr, es      ~96% complete but 20 malformed placeholders each; blocked on
//               #751, and they are the only two worth graduating after it
//   others      ~20% translated, so placeholders are not what holds them back
const SUPPORTED = ['de', 'en', 'sk'];

register('de', () => import('../../../locales/de.json'));
register('en', () => import('../../../locales/en.json'));
register('sk', () => import('../../../locales/sk.json'));

// Resolve the locale to use:
// 1. Deployment-configured default (APP_CONFIG.defaultLocale)
// 2. Browser language (navigator.language, stripped to base tag)
// 3. Fallback to 'en'
function resolveLocale() {
    if (configuredLocale && SUPPORTED.includes(configuredLocale)) {
        return configuredLocale;
    }
    const browser = getLocaleFromNavigator()?.split('-')[0];
    if (browser && SUPPORTED.includes(browser)) {
        return browser;
    }
    return 'en';
}

export async function setupI18n() {
    await init({
        fallbackLocale: 'en',
        initialLocale: resolveLocale(),
    });
}

export { locale };
