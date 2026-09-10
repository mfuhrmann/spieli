## Why

`SearchBar.svelte` renders a text input and, below it, a suggestion list. Visually the relationship is obvious. In the accessibility tree it does not exist: the input carries only `aria-label` (L119-130), and the results container plus its buttons (L138-147) carry no `role`, no state, no `tabindex` — there is no ARIA anywhere else in the file.

Two consequences:

1. **Screen readers never announce the list.** The input reads as "Location search, edit text". Nothing signals that five suggestions are open below it, nothing signals position within them. WCAG 4.1.2 Name, Role, Value (Level A).
2. **Sighted keyboard users cannot reach the suggestions.** `onKeydown` (L73) handles only `Enter` and `Escape` — no arrow keys, no active-option tracking. Tab does not help either: `onBlur` (L102) unconditionally hides the list 200 ms after the input loses focus, and the tab order runs input → `clear-btn` → results, so the list unmounts while focus is still on the clear button.

The 200 ms timer exists solely so a mouse click on a result lands before the list disappears. That same timer causes a third, currently unreported defect on touch: `.search-results` is `max-height: 280px; overflow-y: auto` (L212-216), and scrolling that list on iOS drops input focus, so the list vanishes mid-scroll.

Related: [GitHub issue #737](https://github.com/mfuhrmann/spieli/issues/737)

## What Changes

**ARIA contract** (`SearchBar.svelte`)
- Input gains `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`, `aria-activedescendant`, `aria-busy` (while `searching`).
- Results container gains `role="listbox"` and a stable `id`.
- Each result gains `role="option"`, a stable `id`, `aria-selected`, and `tabindex="-1"`.

**Keyboard navigation**
- `ArrowDown` / `ArrowUp` move an `activeIndex`; `ArrowDown` on a closed list with cached results reopens it.
- `Enter` selects the active option, falling back to re-running the search when no option is active.
- `Escape` closes the list without blurring the input.
- Active option scrolls into view (`block: 'nearest'`).
- `mousemove` over an option sets `activeIndex`, so pointer and keyboard share one highlight instead of `:hover` competing with a keyboard marker.
- `activeIndex` resets whenever `results` is reassigned.

**Dismissal**
- `setTimeout` in `onBlur` removed. Replaced by `focusout` on `.search-card` testing `currentTarget.contains(e.relatedTarget)`.
- `preventDefault()` on the results' `mousedown` so the input never blurs on click.

**Mobile legibility**
- `.result-text` wraps to two lines on narrow viewports instead of truncating to a single ellipsised line.

## Capabilities

### New Capabilities

- `location-search-a11y`: The location search input and its suggestion list form a conforming ARIA combobox, operable by keyboard and announced correctly by screen readers on desktop and touch.

### Modified Capabilities

*(none — no existing spec-level requirements change)*

## Impact

- **`app/src/components/SearchBar.svelte`** — only file touched. No API, no DB, no store changes.
- **No new i18n strings.** See design D5. Nothing for Weblate, no `i18n Guard` interaction.
- No new dependencies. No PR release label required.
- Three checks are manual-only: Safari desktop mouse selection, iOS Safari scroll inside the results list, TalkBack swipe navigation through options.

## Out of Scope

- Spoken result-count announcement ("5 results"). `role="listbox"` already yields "2 of 5" positional output; a live region would add i18n surface for no measurable gain. The unused `search.found` / `search.foundGeneric` / `search.notFound` keys in `locales/*.json` stay unused and are not removed here.
- `visualViewport` handling for the on-screen keyboard. The search card is top-anchored and the keyboard is bottom-anchored; the overlap case is small-device landscape only. Separate concern.
- Any change to `NearbyPlaygrounds`, `FilterPanel`, or other dropdown-like UI. This change is scoped to the search combobox.
