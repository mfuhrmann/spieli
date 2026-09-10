## Context

`SearchBar.svelte` is mounted once, from `AppShell.svelte:439`, inside `.search-area`. On mobile the whole search area unmounts while a playground is selected (`AppShell.svelte:437`), so the combobox and the detail panel never coexist on small screens.

The component is in Svelte 5 **legacy mode** (`export let` props, L10-12), so runes are unavailable — notably `$props.id()` for unique element ids.

Nominatim results arrive through `nominatimFetch` (`app/src/lib/nominatim.js`), which uses plain `fetch`, not JSONP. That matters for testing: Playwright can intercept the request with `page.route`.

## Goals / Non-Goals

**Goals:**
- Conforming ARIA 1.2 combobox contract between input and suggestion list.
- Suggestions operable by keyboard alone, on desktop.
- Dismissal driven by focus containment rather than a timer, fixing Safari click selection and the iOS scroll-dismiss defect together.
- Suggestion text legible on narrow viewports.

**Non-Goals:**
- Changing search behaviour: debounce interval, Nominatim parameters, result limit, viewbox biasing, and distance sorting all stay as they are.
- Generalising the pattern into a reusable combobox primitive under `ui/`.
- Spoken result counts or any new translatable string.

## Decisions

**D1 — Options stay `<button>`, with `tabindex="-1"`.**
`role="option"` overrides the native button role, so the two do not conflict. Keeping `<button>` preserves the existing click handler and native activation for free.

The decisive argument is touch. Screen readers on touch (TalkBack, VoiceOver) navigate with a virtual cursor that does not move real DOM focus and does not follow `aria-activedescendant`. Those users reach options by swiping directly to them and activating in place. A `<div role="option">` without its own activation handler would be inert for them. The button keeps working; `tabindex="-1"` is simply ignored by the virtual cursor.

**D2 — `aria-activedescendant`, not roving tabindex.**
The ARIA APG combobox pattern keeps DOM focus in the input — the user is still typing — and moves only a referenced active option. Roving tabindex would move real focus out of the input and break continued typing.

This also means the tab order becomes input → `clear-btn` → out of the card. The issue's original framing ("tab doesn't reach results") is resolved by removing results from the tab order, not by adding them to it.

**D3 — Focus containment on `.search-card`, not `relatedTarget` on the input.**
The obvious version — inspecting `e.relatedTarget` in the input's `blur` — breaks mouse selection in Safari, which does not reliably focus a button on mousedown, so `relatedTarget` is `null` and the list closes before the click lands. Listening for `focusout` on the outer `.search-card` and testing `currentTarget.contains(e.relatedTarget)` covers the whole card, so focus moving to `clear-btn` no longer dismisses.

Paired with `preventDefault()` on the results' `mousedown`, which stops the input from blurring on click at all.

**Deliberately `mousedown`, not `pointerdown`.** On touch, `mousedown` is a synthetic event dispatched after the tap completes, so preventing it cannot interfere with scrolling. `pointerdown` fires at touch start, and preventing it would break scrolling inside the results list — the exact behaviour this change is meant to fix.

**D4 — Element ids from a module-scoped counter.**
`aria-activedescendant` and `aria-controls` need stable ids. Legacy mode rules out `$props.id()`. A module-scoped incrementing counter gives each instance a unique prefix (`searchbar-2-option-3`). Only one instance exists today, but ids are global and the component is not marked single-use.

**D5 — No result-count live region, therefore no new strings.**
`role="listbox"` plus `role="option"` already produces positional output ("2 of 5") in NVDA, JAWS, VoiceOver, and TalkBack. An extra `role="status"` announcement would duplicate that, add pluralisation strings, and pull the change into the Weblate cycle for no measurable gain. The pre-existing unused `search.found*` / `search.notFound` keys stay untouched — removing them is unrelated cleanup.

**D6 — `mousemove` sets `activeIndex`; `:hover` stops being the highlight.**
With both a `:hover` rule (L231) and a keyboard active class, pointing at one row while arrowing to another yields two highlights and no single source of truth. Letting `mousemove` write `activeIndex` and styling only `.active` keeps exactly one highlighted row, which is also what `aria-activedescendant` reports.

**D7 — Reset `activeIndex` on every `results` reassignment.**
The input debounce is 450 ms (L85). Arrowing to option 3 and continuing to type swaps the result set underneath a stale index, so `aria-activedescendant` would name the wrong row. Reset on assignment in `search()`, `clearSearch()`, and the error path.

**D8 — Two-line result text below the mobile breakpoint.**
`.result-text` is `white-space: nowrap; text-overflow: ellipsis` (L235-241). Nominatim `display_name` values are long, and on mobile `.search-area` is further narrowed to dodge the top-right controls (`AppShell.svelte:733-738`). The visible text degrades to "Fulda, Landkreis F…", making multiple results hard to tell apart — screen readers get the full string, sighted users with magnification do not. Two lines via line-clamp at the existing 1023px breakpoint, which is a CSS-only change.

## Risks / Trade-offs

- [Safari and iOS behaviour cannot be verified in CI] Both `focusout` decisions rest on browser quirks that Playwright's Chromium will not reproduce. → Manual check on Safari desktop and iOS Safari before merge; recorded as explicit tasks.
- [`aria-activedescendant` support on touch is weak] Accepted, not worked around. Touch screen readers navigate the options directly, which D1 keeps functional. Arrow-key support is a desktop feature and degrades to no-op on touch.
- [Removing options from the tab order is a visible behaviour change] Users who currently tab into results within the 200 ms window lose that path. It was never reliable, and arrow keys replace it.
- [Two-line results make the dropdown taller] `max-height: 280px` is unchanged, so the list scrolls sooner on mobile. Scrolling is exactly what D3 fixes, so this is acceptable.

## Testing

- Playwright spec stubbing `**/nominatim.openstreetmap.org/**` via `page.route`: `aria-expanded` toggles with the list, arrow keys move `aria-activedescendant`, `Enter` selects the active option, `Escape` closes without blurring, focus on `clear-btn` keeps the list open.
- Manual: Safari desktop mouse selection; iOS Safari scroll inside the results list; TalkBack swipe through options; NVDA or VoiceOver announcement of role and position.

## Migration Plan

None. Single component, no persisted state, no API surface, no configuration.
