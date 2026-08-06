## MODIFIED Requirements

### Requirement: Language graduation threshold

A locale file in `locales/` SHALL be registered in the running application when its translation completeness is ≥ 80%, and SHALL NOT be registered otherwise. Registration SHALL be derived from the contents of `locales/` at build time. No hand-maintained list of language codes may exist in application source.

Completeness SHALL be measured as the fraction of denominator keys present in the locale file. The denominator SHALL be the flattened key set of `locales/en.json` minus excluded long-tail namespaces. `equipAttr.themes.*` SHALL be excluded: 93 decorative theme names that render only on a playground carrying that exact `playground:theme` tag, yet would carry 14% of the score. A namespace not explicitly excluded SHALL be counted, so that an unclassified namespace makes the gate stricter rather than looser.

Against the current 665-key source, the denominator is 572 keys and the threshold is 458 keys.

Locales below the threshold SHALL remain in `locales/` and available in Weblate for contributor work.

#### Scenario: Locale file at or above the threshold

- **WHEN** the application is built and `locales/<lang>.json` contains at least 80% of denominator keys
- **THEN** `<lang>` is registered with a lazy loader and is resolvable as a UI language
- **AND** no change to `app/src/lib/i18n.js` was required to enable it

#### Scenario: Locale file below the threshold

- **WHEN** `locales/<lang>.json` exists but contains fewer than 80% of denominator keys
- **THEN** the application does not register `<lang>`
- **AND** a user whose browser prefers `<lang>` resolves to the next eligible preference, or to `en`

#### Scenario: A translator's work crosses the threshold

- **WHEN** Weblate merges translations that lift a locale from below to at or above 80%
- **THEN** the next build registers that locale with no accompanying source change

#### Scenario: New locale file appears

- **WHEN** Weblate opens a new language and merges `locales/<new>.json`
- **THEN** the build evaluates it against the threshold like any other locale
- **AND** it is never silently unreachable regardless of the outcome

#### Scenario: Locale file is unreachable

- **WHEN** a file exists in `locales/` that is neither registered nor provably below the threshold
- **THEN** the unit test suite fails, naming the file

### Requirement: Browser language detection considers the full preference list

Locale resolution SHALL evaluate the user's ordered browser language preferences, not only the first entry. Resolution order SHALL be: the deployment-configured default if eligible, then the first eligible entry in `navigator.languages` compared on its base tag, then `en`.

The configured default SHALL remain subject to the eligibility gate, so an operator cannot pin the interface to a below-threshold locale.

The resolution function SHALL remain pure, taking the configured value and the ordered preference list as arguments.

#### Scenario: First preference eligible

- **WHEN** the browser reports `['sk', 'de']` and `sk` is eligible
- **THEN** the interface renders in `sk`

#### Scenario: First preference ineligible, second eligible

- **WHEN** the browser reports `['sk', 'de']` and `sk` is not eligible
- **THEN** the interface renders in `de`, not `en`

#### Scenario: No preference eligible

- **WHEN** no entry in the browser's preference list is eligible
- **THEN** the interface renders in `en`

#### Scenario: Operator configures an ineligible default

- **WHEN** `DEFAULT_LOCALE` names a locale below the threshold
- **THEN** the configured value is ignored and resolution falls through to the browser preference list

### Requirement: New source strings may not silently retire a live locale

Because `locales/en.json` is the completeness denominator, adding source strings lowers every community locale's score without those files changing. CI SHALL fail a pull request that would move any locale from eligible to ineligible, naming the affected locale and its before and after percentages. The check SHALL be overridable by an explicit label, mirroring the existing `i18n-manual` escape hatch.

#### Scenario: New strings push a live locale below the threshold

- **WHEN** a PR adds keys to `locales/en.json` such that a currently eligible locale falls below 80%
- **THEN** CI fails and reports the locale, its previous percentage, and its new percentage
- **AND** the message states that the cause is denominator growth, not a change to the locale file

#### Scenario: New strings leave every live locale eligible

- **WHEN** a PR adds keys to `locales/en.json` and every eligible locale remains at or above 80%
- **THEN** the check passes

#### Scenario: Deliberate override

- **WHEN** a maintainer accepts the retirement and applies the override label
- **THEN** the check does not block the merge

## REMOVED Requirements

### Requirement: Language graduation threshold (manual maintainer PR)

**Reason**: The manual step it specified — *"the maintainer opens a PR that adds the language code to `SUPPORTED` in `i18n.js` and adds a `register()` call"* — was never performed for any language. `fr` and `es` sat at ~97% and `sk` at ~96% while the application shipped `de` and `en` only, which is [issue #814](https://github.com/mfuhrmann/spieli/issues/814). A graduation process that depends on a human noticing a Weblate percentage has no failure signal when nobody looks.

**Migration**: Replaced by the derived-registration form of the same requirement above. The 80% threshold is retained; only the mechanism changes, from a manual PR to a build-time computation over `locales/`. Its stated key count (464 of a 580-key source) is superseded — the source is now 665 keys and the denominator 572.
