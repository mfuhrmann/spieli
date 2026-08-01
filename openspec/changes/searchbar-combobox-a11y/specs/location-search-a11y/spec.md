## ADDED Requirements

### Requirement: Search input and suggestion list expose an ARIA combobox contract

The location search input SHALL identify itself as a combobox that owns its suggestion list, and the list and its entries SHALL carry listbox and option semantics, so assistive technology can announce that suggestions exist and where the user is within them. Element identifiers SHALL be unique per component instance.

#### Scenario: Input advertises the combobox role and its popup

- **WHEN** the search bar is rendered
- **THEN** the input carries `role="combobox"` and `aria-autocomplete="list"`
- **AND** `aria-controls` references the `id` of the suggestion container

#### Scenario: Expanded state tracks list visibility

- **WHEN** the suggestion list is rendered
- **THEN** the input's `aria-expanded` is `true`
- **AND** when the list is not rendered, `aria-expanded` is `false`

#### Scenario: Suggestion list and entries carry listbox semantics

- **WHEN** the suggestion list is rendered with results
- **THEN** the container carries `role="listbox"` with a stable `id`
- **AND** each entry carries `role="option"` with a stable `id`
- **AND** each entry's `aria-selected` reflects whether it is the active option

#### Scenario: In-flight search is announced as busy

- **WHEN** a Nominatim request is in flight
- **THEN** the input carries `aria-busy="true"`
- **AND** `aria-busy` returns to `false` once the request settles, whether it succeeded or failed

#### Scenario: Identifiers do not collide between instances

- **WHEN** two search bars are mounted on the same page
- **THEN** their listbox and option `id` values differ
- **AND** each input's `aria-controls` and `aria-activedescendant` reference its own listbox and options

### Requirement: Suggestions are operable by keyboard without moving focus out of the input

Arrow keys SHALL move an active option while DOM focus remains in the input, exposed through `aria-activedescendant`, so the user can keep typing while browsing suggestions. Suggestions SHALL NOT be tab stops.

#### Scenario: Arrow keys move the active option

- **WHEN** the list is open and the user presses `ArrowDown` or `ArrowUp`
- **THEN** the active option moves accordingly
- **AND** the input's `aria-activedescendant` names the active option's `id`
- **AND** DOM focus remains on the input

#### Scenario: No active option means no activedescendant

- **WHEN** the list is open and no option is active
- **THEN** the input has no `aria-activedescendant` attribute

#### Scenario: ArrowDown reopens a closed list with cached results

- **WHEN** the list is closed, previous results are still cached, and the user presses `ArrowDown`
- **THEN** the list reopens

#### Scenario: Enter selects the active option

- **WHEN** an option is active and the user presses `Enter`
- **THEN** that option is selected, the map animates to its coordinates, and the list closes

#### Scenario: Enter without an active option re-runs the search

- **WHEN** no option is active and the user presses `Enter`
- **THEN** the search is re-run for the current query

#### Scenario: Escape closes the list and keeps focus

- **WHEN** the list is open and the user presses `Escape`
- **THEN** the list closes
- **AND** DOM focus remains on the input

#### Scenario: Suggestions are outside the tab order

- **WHEN** the list is open and the user presses `Tab` repeatedly from the input
- **THEN** focus moves to the clear button and then out of the search card
- **AND** focus never lands on a suggestion

#### Scenario: Active option is scrolled into view

- **WHEN** the active option lies outside the visible area of the scrollable list
- **THEN** the list scrolls the active option into view

### Requirement: Exactly one suggestion is highlighted, and it matches what is announced

Pointer and keyboard SHALL share a single active-option state, so the visually highlighted row is always the row named by `aria-activedescendant`. Stale active state SHALL NOT survive a change of results.

#### Scenario: Pointer movement sets the active option

- **WHEN** the pointer moves over a suggestion
- **THEN** that suggestion becomes the active option

#### Scenario: Pointer and keyboard do not produce competing highlights

- **WHEN** the pointer rests over one suggestion and the user arrows to a different one
- **THEN** only one suggestion is visually highlighted
- **AND** it is the suggestion named by `aria-activedescendant`

#### Scenario: Changing results clears the active option

- **WHEN** the result set is replaced by a new search, or cleared
- **THEN** no option is active
- **AND** the input has no `aria-activedescendant` attribute

### Requirement: Dismissal is driven by focus leaving the search card

The suggestion list SHALL remain visible while focus is anywhere inside the search card and SHALL close when focus leaves it. Dismissal SHALL NOT depend on a timer, so neither a mouse click nor a touch scroll can race it.

#### Scenario: Focus on the clear button keeps the list open

- **WHEN** the list is open and focus moves from the input to the clear button
- **THEN** the list stays open

#### Scenario: Focus leaving the card closes the list

- **WHEN** focus moves from inside the search card to an element outside it
- **THEN** the list closes

#### Scenario: Mouse selection succeeds in Safari

- **WHEN** a user clicks a suggestion in Safari on desktop
- **THEN** the suggestion is selected
- **AND** the list does not close before the click is handled

#### Scenario: Scrolling the list on touch does not dismiss it

- **WHEN** a user scrolls the suggestion list on iOS Safari
- **THEN** the list stays open

### Requirement: Suggestions are legible and operable on small viewports

Suggestion text SHALL remain readable on narrow screens, and activation SHALL NOT depend on mechanisms that touch screen readers do not support.

#### Scenario: Long suggestion text wraps on mobile

- **WHEN** the viewport is at or below the 1023px mobile breakpoint and a suggestion's text exceeds one line
- **THEN** the text wraps to two lines rather than truncating to a single ellipsised line

#### Scenario: Touch screen reader can reach and activate a suggestion

- **WHEN** a TalkBack or VoiceOver user swipes through the open list
- **THEN** each suggestion is reachable and announces its role and position
- **AND** activating it selects that suggestion without relying on `aria-activedescendant`
