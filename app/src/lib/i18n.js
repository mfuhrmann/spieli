import { register, init, getLocaleFromNavigator, locale } from 'svelte-i18n';
import { defaultLocale as configuredLocale } from './config.js';

const SUPPORTED = ['de', 'en'];

register('de', () => import('../../../locales/de.json'));
register('en', () => import('../../../locales/en.json'));

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

export async function setupI18n() {
    const resolved = resolveLocale();
    await init({
        fallbackLocale: 'en',
        initialLocale: resolved,
    });
    // `index.html` ships a static lang attribute; without this assignment a
    // screen reader announces the whole UI with that build-time language's
    // phonetics no matter which locale actually rendered (WCAG 3.1.1).
    // A single assignment is enough: there is no language switcher, so
    // `resolveLocale()` runs once and its result never changes.
    if (typeof document !== 'undefined') {
        document.documentElement.lang = resolved;
    }
}

export { locale };
