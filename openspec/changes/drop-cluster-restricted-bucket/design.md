## Context

The cluster tier ships four counts per bucket (`complete`/`partial`/`missing`/`restricted`) and renders a four-segment ring, with `restricted` drawn as a light-gray hatch. The `restricted` count comes from `access_restricted = (pl.access IN ('private','customers'))` in the `playground_stats` materialized view.

PostgreSQL three-valued logic makes `access_restricted` **NULL** whenever `access` is absent. In `get_playground_clusters` the aggregation uses `SUM(CASE WHEN NOT access_restricted AND completeness = … THEN 1 ELSE 0 END)` for the three completeness buckets and `SUM(CASE WHEN access_restricted THEN 1 ELSE 0 END)` for restricted. For a NULL row, `NOT NULL` and `NULL` both yield NULL → the `CASE` falls to `ELSE 0`, so the row is counted in `count` (`COUNT(*)`) but in **none** of the four buckets. In the live Fulda dataset 210 / 463 playgrounds (≈45%) are affected; a cell composed solely of such rows arrives at the client as `{count:N, complete:0, partial:0, missing:0, restricted:0}` and the renderer fills the whole circle with the hatch (`r10 = 10`). The documented invariant `count = complete + partial + missing + restricted` is silently violated.

`completeness` itself is never NULL — its `CASE` ends in `ELSE 'missing'` — so classifying purely by `completeness` is well-defined for every row.

The cluster renderer (`clusterStyle.js`) and the macro renderer (`macroRingStyle.js`) are independent modules with separate colour tables. The macro tier reuses the *gray* idea for a different purpose (offline / unknown-completeness backends), so it is untouched here.

## Goals / Non-Goals

**Goals:**
- Make `count = complete + partial + missing` the cluster-bucket invariant; remove the `restricted` field from the RPC response.
- Eliminate the NULL artifact so untagged playgrounds render by their true completeness.
- Remove all grey/hatch rendering from the cluster ring and single-child dot.
- Keep the `filter_private` toggle working (NULL-safe `access_restricted`).

**Non-Goals:**
- The macro tier's gray "offline / unknown backend" segment (`macroRingStyle.js`, `MacroView.svelte`) — stays.
- Removing `access_restricted` from the polygon tier's per-feature `filter_attrs` (it feeds `filter_private`).

**Folded in:** cluster ring sizing tuned down during live-browser review — radii `26/32/38/44 → 18/22/28/34`, `RING_WIDTH 12 → 8`, centre count `bold 22px → 16px`. Already applied to `clusterStyle.js`; carried in this change since it touches the same renderer the restricted removal does.

## Decisions

**1. Fix the aggregation by classifying on `completeness` alone, not by special-casing access.**
Replace the four `SUM(CASE …)` expressions with three that key only on `completeness` (`SUM(CASE WHEN completeness = 'complete' THEN 1 ELSE 0 END)`, etc.) and drop the `restricted` SUM and JSON key. Because `completeness` is total (never NULL) and the bucket population is otherwise unchanged, `complete + partial + missing = COUNT(*) = count` by construction.
*Alternative considered:* keep four buckets but fix only the NULL bug (`COALESCE(access,'')`). Rejected — the user's decision is to drop `restricted` from the data model entirely, and keeping a near-always-empty fourth bucket adds renderer complexity for no signal.

**2. Make `access_restricted` NULL-safe at its definition, retained for filtering only.**
Change `(pl.access IN ('private','customers'))` to a NULL-safe form (`COALESCE(pl.access,'') IN ('private','customers')` or `(pl.access IN (...)) IS TRUE`) in `playground_stats`. This keeps `filter_private` correct (untagged → public) without the column influencing the completeness aggregation.
*Alternative considered:* drop `access_restricted` + `filter_private` wholesale. Rejected — distinguishing private playgrounds for filtering is still a wanted feature; only the *ring colour* is being simplified.

**3. Cluster renderer becomes three-segment; remove dead grey paths.**
In `clusterStyle.js`: delete `HATCH_BG`/`HATCH_LINE`/`RESTRICTED_DOT`, `makeHatchPattern()`, the `r10` segment, the `restricted` argument to `quantise()`/`drawStackedRing()`, and `r10` from the bitmap-cache key. The single-child dot loses its `restricted > 0 → gray` branch and colours purely by completeness.

**4. Treat the API response change as `requires-schema-update`.**
`importer/api.sql` changes; operators run `API_ONLY=1` (function + materialized-view refresh) — no full re-import. Clients reading a missing `restricted` field degrade gracefully (`?? 0` already present in the orchestrators), so a brief backend/frontend skew during deploy is safe.

## Risks / Trade-offs

- **Loss of the "private playground" visual signal on the map** → Mitigation: this is the intended product decision; `filter_private` still lets users hide private playgrounds, and the lock hint remains on the per-playground panel.
- **Backend/frontend version skew during upgrade** (old frontend expecting `restricted`, or old backend still shipping it) → Mitigation: frontend uses `restricted ?? 0` and, after the renderer change, ignores the field entirely; the new SQL simply omits it. Both directions are non-fatal.
- **`access_restricted` NULL-fix could shift `filter_private` results** for previously-NULL rows → Intended: those untagged playgrounds were incorrectly excluded when `filter_private` was on; they are now correctly treated as public.
- **Stale-volume `make db-apply` can mask ordering bugs** → Mitigation: run the fresh-volume import test (`make down && docker volume rm spieli_pgdata spieli_pgdata2 && make up`) before merge, per project policy.
