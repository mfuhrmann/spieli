import assert from 'node:assert/strict';
import { pickLocale } from './i18n.js';

// The locale this returns is both the UI language and what setupI18n() writes
// to document.documentElement.lang (asserted end-to-end in
// tests/document-language.spec.js), so it decides which speech synthesiser a
// screen reader picks for the whole page — WCAG 3.1.1.

assert.equal(
  pickLocale('en', 'de-DE'),
  'en',
  'a configured default beats the browser language'
);

assert.equal(
  pickLocale('', 'de-DE'),
  'de',
  'the browser language is used when no default is configured, stripped to its base tag'
);

assert.equal(
  pickLocale('', 'de'),
  'de',
  'a browser language with no region subtag works unchanged'
);

assert.equal(
  pickLocale('', 'ja-JP'),
  'en',
  'an unsupported browser language falls back to en'
);

assert.equal(
  pickLocale('ja', 'de-DE'),
  'de',
  'an unsupported configured locale falls through to a supported browser language'
);

assert.equal(
  pickLocale('ja', 'fr-FR'),
  'en',
  'unsupported on both counts falls back to en'
);

assert.equal(
  pickLocale('', null),
  'en',
  'no browser language at all falls back to en'
);

console.log('All i18n tests passed.');
