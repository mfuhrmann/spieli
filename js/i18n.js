//----------------------------------//
// Internationalisierung (i18next)  //
//----------------------------------//

import i18next from 'i18next';
import de from '../locales/de.json';
import en from '../locales/en.json';
import fr from '../locales/fr.json';
import es from '../locales/es.json';
import it from '../locales/it.json';
import pl from '../locales/pl.json';
import nl from '../locales/nl.json';
import cs from '../locales/cs.json';
import pt from '../locales/pt.json';
import sv from '../locales/sv.json';
import uk from '../locales/uk.json';
import ja from '../locales/ja.json';

// Pick language: URL parameter ?lang=xx overrides browser setting, fall back to German
const urlLang = new URLSearchParams(window.location.search).get('lang');
const lng = urlLang || (navigator.language || 'de').split('-')[0];

// initImmediate: false → synchronous init (safe because resources are bundled, no HTTP fetch needed)
i18next.init({
    lng,
    fallbackLng: 'en',
    resources: {
        de: { translation: de },
        en: { translation: en },
        fr: { translation: fr },
        es: { translation: es },
        it: { translation: it },
        pl: { translation: pl },
        nl: { translation: nl },
        cs: { translation: cs },
        pt: { translation: pt },
        sv: { translation: sv },
        uk: { translation: uk },
        ja: { translation: ja },
    },
    interpolation: { escapeValue: false },
    initImmediate: false,
});

// The language that was actually selected (e.g. 'de' or 'en')
export const language = i18next.language;

// Translation function — use as: t('some.key') or t('some.key', { count: 3 })
export const t = i18next.t.bind(i18next);

// Apply translations to static HTML elements marked with data-i18n attributes.
// Call once after the DOM is ready.
export function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
        el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
    });
    document.documentElement.lang = i18next.language;
}
