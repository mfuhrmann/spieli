## ADDED Requirements

### Requirement: The document declares the active interface language

The page SHALL declare the language the interface is actually rendered in, so assistive technology selects the matching speech synthesiser rather than a build-time default.

#### Scenario: Page language follows the resolved locale

- **WHEN** the application initialises with a resolved locale
- **THEN** `document.documentElement.lang` equals that locale

#### Scenario: Configured default locale wins

- **WHEN** the deployment sets `defaultLocale` to a supported locale and a visitor arrives with a different browser language
- **THEN** `document.documentElement.lang` equals the configured locale

#### Scenario: Browser language is used when no default is configured

- **WHEN** no `defaultLocale` is configured and the visitor's browser language is supported
- **THEN** `document.documentElement.lang` equals that browser language

#### Scenario: Unsupported languages fall back

- **WHEN** neither the configured default nor the browser language is supported
- **THEN** the interface renders in the fallback locale
- **AND** `document.documentElement.lang` equals that same fallback locale

### Requirement: OSM-derived names declare the region's data language

Playground names come from OSM tags and are proper nouns in the language of the mapped region, independent of the interface language. Every element rendering such a name SHALL declare that language, so a change of interface language does not cause the names to be pronounced wrongly.

#### Scenario: Every name rendering carries the data language

- **WHEN** a playground name derived from OSM tags is rendered in the hover preview, the playground panel, or the nearby-playgrounds list
- **THEN** the element carries a `lang` attribute equal to the configured region language

#### Scenario: Data language is independent of interface language

- **WHEN** the interface renders in a locale different from the region language
- **THEN** the document language is the interface locale
- **AND** rendered OSM names still carry the region language

#### Scenario: Region language is not derived from the interface locale

- **WHEN** a deployment configures an interface locale and a region language that differ
- **THEN** both values are honoured independently, and neither overrides the other

#### Scenario: Untagged playgrounds fall back in the interface language

- **WHEN** a playground has none of the OSM name tags and its title falls back to a translated placeholder
- **THEN** the rendered title carries the interface locale, not the region language

#### Scenario: Long compound names still hyphenate

- **WHEN** a name too long for the hover preview's width is rendered
- **THEN** it is hyphenated using the region language's dictionary rather than left unbroken

#### Scenario: Default region language preserves current behaviour

- **WHEN** a deployment configures no region language
- **THEN** rendered OSM names carry the same language previously hardcoded in the markup
