## Tasks

### Database (`importer/api.sql`)

- [x] In `equip_stats` (~`:208`), add `BOOL_OR` for a suitable play device: `e.tags ? 'playground' AND e.tags->'playground' <> 'sandpit' AND e.tags->'wheelchair' IN ('yes','limited','designated')`
- [x] In `equip_stats`, add `BOOL_OR(e.tags ? 'playground' AND e.tags ? 'wheelchair')` as the surveyed flag
- [x] Replace the `for_wheelchair` aggregate at `:237-239` — the `NOT (e.tags ? 'playground')` branch is what lets a shelter or pitch carry the flag
- [x] Add `wheelchair_play text` to `playground_stats`: `'yes'` when suitable, `'no'` when surveyed and not suitable, `NULL` otherwise
- [x] Redefine `for_wheelchair` as `wheelchair_play = 'yes'`, keeping the column name and type
- [x] Comment the rule at the definition site, including why the area tag is excluded (design D1) and why `sandpit` remains excluded (D5)
- [x] Add `wheelchair_play` to the payload of `get_playgrounds_bbox`, `get_playground`, and the deprecated `get_playgrounds`
- [x] Leave `get_playground_clusters`, `get_playground_centroids` and `get_meta` untouched (design D8)
- [x] `make db-apply`, then verify the three state counts against the dataset (expected on Fulda: 18 / 58 / 655)
- [x] Verify `for_wheelchair = (wheelchair_play = 'yes')` for every row
- [x] Fresh-volume check: `make down && docker volume rm spieli_pgdata spieli_pgdata2 && make up`

### Frontend

- [x] `HoverPreview.svelte:18` — replace `attr?.wheelchair === 'yes' || 'limited'` with `attr?.for_wheelchair` (closes #777)
- [x] `PlaygroundPanel.svelte` — wheelchair badge in the status-pill row when `for_wheelchair`
- [x] `PlaygroundPanel.svelte` — explicit line when `wheelchair_play === 'no'`; nothing when `NULL`
- [x] `stores/filters.js` — confirm no change needed (`:41` already reads `for_wheelchair`)
- [x] Unit test in `stores/filters.test.js` — filter still matches on `for_wheelchair`

### i18n (en + de only — every other locale is Weblate-owned)

- [x] `details.wheelchairPlay` — badge label
- [x] `details.wheelchairPlayNone` — surveyed-negative line
- [ ] Confirm the `i18n Guard` CI job passes

### Documentation

- [x] `docs/user-guide.md` — new section: what the wheelchair signal means (equipment, not site access), that `limited` is included because assisted use is the norm for this age group, that a missing badge means unsurveyed rather than inaccessible, and that the surveyed-negative state exists and is empty in regions nobody has surveyed
- [x] `docs/user-guide.md` — update the filter table row for Wheelchair
- [x] `docs/contributing/import-pipeline.md` — replace the `for_wheelchair` row in the derived-flags table; document `wheelchair_play`
- [x] `docs/reference/api.md` — `wheelchair_play` in the affected response shapes
- [x] `CLAUDE.md` — note the tri-state and that the area tag is deliberately not an input
- [x] `make docs-build` passes

### Verification

- [x] `make test` passes
- [ ] `make docker-build`; on port 8080 filter for wheelchair and hover every result — each must show the icon (today 67 of 69 icons match nothing in the filter)
- [ ] Select a `'no'` playground and confirm the explicit line reads as information, not as a warning
- [ ] Select a `NULL` playground and confirm no accessibility claim appears in either direction

### Coordination

- [x] Comment on #728 with the measured breakdown; the area-tag disjunct is what this change drops, the rest of the PR is kept
- [ ] Close #777 with this change (both surfaces now read one source)
- [ ] Label the PR `requires-schema-update`; note the filter result-set change (6 → 18 on Fulda) in the PR body for the release notes
