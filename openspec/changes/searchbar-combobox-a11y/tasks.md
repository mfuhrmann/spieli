## Tasks

### ARIA contract

- [x] Add module-scoped id counter and derive `listboxId` / `optionId(i)` (`SearchBar.svelte`)
- [x] Add `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-busy` to the input (L119-130)
- [x] Add `role="listbox"` + `id` to the results container (L139)
- [x] Add `role="option"`, `id`, `aria-selected`, `tabindex="-1"` to each result button (L141)

### Keyboard navigation

- [x] Add `activeIndex` state; reset it in `search()`, `clearSearch()`, and the search error path
- [x] Handle `ArrowDown` / `ArrowUp` in `onKeydown` (L73); reopen a closed list with cached results on `ArrowDown`
- [x] Bind `aria-activedescendant` on the input to the active option's id, absent when `activeIndex < 0`
- [x] `Enter` selects the active option, falls back to `search()` when none is active
- [x] `Escape` closes the list without calling `inputEl.blur()` (L77)
- [x] Scroll the active option into view with `block: 'nearest'` on `activeIndex` change
- [x] Set `activeIndex` from `mousemove` on options; replace the `:hover` rule (L231) with an `.active` class as the single highlight

### Dismissal

- [x] Remove the `setTimeout` from `onBlur` (L102-107)
- [x] Add `focusout` on `.search-card` testing `currentTarget.contains(e.relatedTarget)`
- [x] Add `preventDefault()` on the results' `mousedown` (not `pointerdown` — see design D3)

### Mobile legibility

- [x] Two-line clamp for `.result-text` inside a `max-width: 1023px` media query (L235-241)

### Verification

- [x] Playwright spec `tests/searchbar-a11y.spec.js` stubbing `**/nominatim.openstreetmap.org/**` via `page.route`: `aria-expanded` toggle, arrow-key `aria-activedescendant` movement, `Enter` selection, `Escape` close, list stays open with focus on the clear button
- [x] `make test` passes
- [ ] Manual: Safari desktop — mouse selection of a suggestion works
- [ ] Manual: iOS Safari — scrolling the suggestion list does not dismiss it
- [ ] Manual: TalkBack — swipe reaches each option, announces role and position, activation works
- [ ] Manual: NVDA or VoiceOver desktop — input announces as combobox, arrow keys announce "N of M"
- [ ] `make docker-build` and re-check on port 8080

### Docs

- [x] Note the combobox pattern in `docs/contributing/frontend-guide.md` under SearchBar
