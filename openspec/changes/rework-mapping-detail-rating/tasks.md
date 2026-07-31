## 1. PR A — Expose the rating inputs and measure

- [x] 1.1 Add `has_photo`, `has_equipment`, `has_info` to the `playground_stats` matview select list in `importer/api.sql` (the flags already exist in the CTE around `:315-340`; select them through instead of discarding them)
- [x] 1.2 Document the three new columns in `docs/reference/completeness.md` (not `api.md` — the matview is documented there, and `docs/contributing/import-pipeline.md` is being fully rewritten by the in-flight `fix-import-pipeline-docs` change)
- [x] 1.3 Verify with a fresh-volume import: `make down && docker volume rm spieli_pgdata spieli_pgdata2 && make up`, then confirm the columns exist and `completeness` is unchanged by this PR
- [~] 1.4 Run the breakdown and record the output in `openspec/changes/rework-mapping-detail-rating/measurement.md` — **Fulda (local, 926) done; Hessen run still pending, needs PR A deployed**:
      `SELECT completeness, has_equipment, has_info, has_photo, count(*) FROM playground_stats GROUP BY 1,2,3,4 ORDER BY 5 DESC;`
- [x] 1.5 **Decision gate — passed.** Not via the originally stated test (Fulda's `partial` is only 20% photo-blocked), but via Hessen's bucket totals: `complete` sits at 87 of 8802 (1.0%) against Fulda's 8.0% under the same rule, which only photo availability can explain. See `measurement.md` Run 2. D2 stands
- [x] 1.6 Open PR A with the `requires-schema-update` label — [#803](https://github.com/mfuhrmann/spieli/pull/803)

## 2. PR B — Rework the rule

- [x] 2.1 Create `app/src/lib/completenessPalette.js` exporting fill bases, stroke colours and hatch strokes keyed by `complete` / `partial` / `missing` (values per `design.md` D4)
- [x] 2.2 Rewrite the classification in `app/src/lib/completeness.js:42` to `hasEquipment && hasInfo` → `complete`, `hasEquipment || hasInfo` → `partial`, else `missing`; export `hasPhotoSignal(props)` as the single photo predicate
- [x] 2.3 Mirror the same rule in the `playground_stats` `CASE` in `importer/api.sql` (~`:326`); add a comment at both sites noting the identifier/label mismatch (`complete` displays as "detailed")
- [x] 2.4 Update `app/src/lib/vectorStyles.js:44-67` to import from the palette module — polygon fills, strokes and `makeHatchStyle` colours
- [x] 2.5 Update `app/src/lib/clusterStyle.js:15-19` to import from the palette module; delete the now-obsolete "keep in sync by hand" comment
- [x] 2.6 Update `app/src/hub/macroRingStyle.js` `COLOR` map to import from the palette module
- [x] 2.7 Update `app/src/components/CompletenessLegend.svelte` swatches to the palette module and replace `Badge` variants `success` / `warning` / `destructive` with neutral variants (add new variants if those three are used outside this context)
- [x] 2.8 Add the camera glyph to the polygon style for features where `hasPhotoSignal(props)` is true, rendered only at the polygon tier
- [x] 2.9 Add the photo badge to `app/src/components/PlaygroundPanel.svelte`
- [x] 2.10 Update `app/src/lib/completeness.test.js` for the new rule — cover equipment+info without photo → `complete`, equipment alone → `partial`, info alone → `partial`, photo alone → `missing`, empty-string tags → absent
- [x] 2.11 Add a JS↔SQL parity check covering every `hasEquipment` × `hasInfo` combination
- [ ] 2.12 Contrast-check `partial` and `missing` polygons over `landuse=grass` and `leisure=park` on the real basemap; darken the values if they wash out
- [x] 2.13 Update `docs/contributing/import-pipeline.md` (rating rule) and the `completeness.js` ↔ `api.sql` mirror note in `CLAUDE.md`
- [ ] 2.14 Verify with a fresh-volume import, then `make db-apply && make docker-build` and re-run the breakdown query to confirm the `complete` share moved as predicted
- [x] 2.15 Run `make test`
- [ ] 2.16 Open PR B with the `requires-schema-update` label; note the bucket-count shift in the PR body for the release notes

## 3. PR C — Reframe the wording

- [x] 3.1 Add a `mappingDetail` block to `locales/en.json` (`legendTitle`: "Mapping detail", `detailed`, `basic`, `notMapped`: "not mapped yet") and remove the old `completeness` rating keys at `:80-84`
- [x] 3.2 Mirror the same keys in `locales/de.json` ("Erfasste Details", "detailliert", "grundlegend", "noch nicht erfasst"); **edit no other locale file**
- [x] 3.3 Repoint `CompletenessLegend.svelte`, `FilterPanel.svelte` and `FilterChips.svelte` at the new keys (`filterStore` keys `showComplete` / `showPartial` / `showMissing` stay unchanged)
- [x] 3.4 Update the `completeness` label at `locales/en.json:99` and any remaining "Data Quality" / "Data complete" strings
- [x] 3.5 Add a legend line explaining the camera glyph
- [ ] 3.6 Reframe the `missing` case in `PlaygroundPanel` as a contribution invitation and confirm the `DataContributionModal` entry point is reachable from it
- [ ] 3.7 Confirm the `i18n Guard` CI job passes and `make test` is green
- [ ] 3.8 Open PR C

## 4. Rollout

- [ ] 4.1 Confirm no API response shape changed — `get_playground_clusters`, `get_playgrounds_bbox`, `get_playground`, `get_meta` still emit the same field names
- [ ] 4.2 Smoke-test hub mode against a mix of upgraded and un-upgraded backends; confirm macro rings still render
- [ ] 4.3 Roll out with `scripts/upgrade-stacks.sh` (its `API_ONLY=1`-before-daemon-restart order is correct for a matview-only change)
- [ ] 4.4 Close [#733](https://github.com/mfuhrmann/spieli/issues/733) and archive this change with `/opsx:archive`
