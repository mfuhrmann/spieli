## ADDED Requirements

### Requirement: Opening-hours evaluation resolves holidays against the deployment's region

`opening_hours` rules referencing public holidays SHALL be evaluated against the country, and where applicable the state, that the deployment actually serves, so a playground is not reported open or closed on another country's calendar.

#### Scenario: Configured country drives holiday resolution

- **WHEN** a playground's `opening_hours` value references public holidays and the deployment configures a region country
- **THEN** the evaluation uses that country's holiday calendar
- **AND** every call site evaluating `opening_hours` uses the same configured value

#### Scenario: State refines holiday resolution when configured

- **WHEN** a region state is configured
- **THEN** it is passed alongside the country so state-specific public holidays resolve correctly

#### Scenario: Empty state preserves current behaviour

- **WHEN** no region state is configured
- **THEN** no state is passed and holiday resolution behaves exactly as it did before this change

#### Scenario: Default country preserves current behaviour

- **WHEN** a deployment configures no region country
- **THEN** evaluation uses the country previously hardcoded at the call sites

#### Scenario: Rules without holiday references are unaffected

- **WHEN** an `opening_hours` value contains no public-holiday reference
- **THEN** its evaluated state is identical regardless of the configured country or state

#### Scenario: Unparseable values stay non-fatal

- **WHEN** an `opening_hours` value cannot be parsed
- **THEN** no opening-hours state is displayed and the surrounding UI renders normally
