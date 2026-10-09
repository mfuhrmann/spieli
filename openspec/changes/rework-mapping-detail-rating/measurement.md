# Step 0 measurement — bucket composition

## Run 1 — Landkreis Fulda (local dev stack), 2026-07-31

Dataset: `relation_id=62700`, `playground_count=926`, measured after a fresh-volume import (`make down` + volume drop + `make up`). **Not** the Hessen instance the issue quotes — this is the local dev region, used as a proxy while the Hessen run is pending.

```sql
SELECT completeness, has_equipment, has_info, has_photo, count(*)
FROM playground_stats GROUP BY 1,2,3,4 ORDER BY 5 DESC;
```

| completeness | has_equipment | has_info | has_photo | count |
|---|---|---|---|---|
| missing | f | f | f | 586 |
| partial | f | t | f | 117 |
| partial | t | f | f | 91 |
| complete | t | t | t | 74 |
| partial | t | t | f | **54** |
| partial | t | f | t | 2 |
| partial | f | f | t | 1 |
| partial | f | t | t | 1 |

Totals: `missing` 586 (63.3%), `partial` 266 (28.7%), `complete` 74 (8.0%). Playgrounds carrying a photo tag at all: 78 (8.4%). No NULLs in any of the three columns.

### The hypothesis does not hold on this dataset

`design.md` predicted that the majority of `partial` would be equipment ✓ + info ✓ + photo ✗ — the "mapper did the expensive work, gets amber for it" case.

Actual: that case is **54 of 266 partial rows (20%)**. The two larger `partial` groups are single-criterion rows — info only (117) and equipment only (91) — which are genuinely thinly mapped and would stay `partial` under the proposed rule too.

The dominant fact in this region is not the photo gate at all: **586 playgrounds (63%) satisfy no criterion**, i.e. they are bare `leisure=playground` geometry with no equipment, no `surface`, no `opening_hours`, no `access`.

### Effect of the proposed rule (D2) on this dataset

`complete = hasEquipment AND hasInfo`, `partial = hasEquipment OR hasInfo`, else `missing`:

| Bucket | Now | After | Δ |
|---|---|---|---|
| `complete` | 74 (8.0%) | 128 (13.8%) | +54 (+73%) |
| `partial` | 266 (28.7%) | 211 (22.8%) | −55 |
| `missing` | 586 (63.3%) | 587 (63.4%) | +1 |

The rule change lifts `complete` by nearly three quarters and is directionally right, but it does not move the bulk of the region — 63% stays in the bottom bucket either way.

### Caveats

- Fulda is one Landkreis; the Hessen-wide distribution (see Run 2) is materially different. The photo-gate share is larger there.
- The `+1` in `missing` is the single photo-only row, which loses its bucket under the new rule.

## Run 2 — Hessen instance

Full breakdown pending (requires PR A deployed to the Hessen data node). Bucket totals are already known from the region panel:

| Bucket | Label | Count | Share |
|---|---|---|---|
| `complete` | high | 87 | **1.0%** |
| `partial` | medium | 3231 | 36.7% |
| `missing` | low | 5484 | 62.3% |
| | | 8802 | |

(The issue's "5.5k grounds, ~3k yellow" was the `low` and `medium` counts, not the region total.)

### This reverses the Run 1 conclusion

Fulda and Hessen agree closely on the bottom bucket — 63.3% vs 62.3%. They diverge sharply at the top: Fulda `complete` is 8.0%, Hessen `complete` is **1.0%**.

The rule is identical, so the difference is input availability, and the only axis that can produce it is the photo. Fulda has 78 playgrounds with a photo tag (8.4% of 926) — it is the well-surveyed home region. Extrapolating Fulda's photo rate to Hessen would predict roughly 740 photographed playgrounds and a `complete` bucket in the high hundreds. Actual is 87. Hessen's photo coverage is therefore around an order of magnitude lower, and **the photo axis is what holds Hessen's top bucket at 1%.**

Fulda is the outlier, not Hessen. Run 1 measured the one region where the photo gate happens not to bind.

### Estimated effect of D2 on Hessen

Fulda has `hasEquipment AND hasInfo` on 128 of 926 playgrounds = 13.8%. Applying that rate to Hessen's 8802:

| Bucket | Now | Estimated after | Δ |
|---|---|---|---|
| `complete` | 87 (1.0%) | ~1215 (14%) | **~14×** |
| `partial` | 3231 (36.7%) | ~2100 | −1130 |
| `missing` | 5484 (62.3%) | ~5490 | ~0 |

Rough — Hessen's equipment and info coverage may differ from Fulda's, and only the deployed breakdown query settles it. Direction and magnitude are not in doubt: the photo gate is suppressing Hessen's top bucket by roughly an order of magnitude.

### Gate verdict

**Passed.** The original hypothesis was aimed at the right target. The precise wording in `design.md` ("the majority of `partial` is equipment ✓ + info ✓ + photo ✗") is still unverified and false for Fulda, but the underlying claim — the photo axis is the binding constraint on the top bucket — holds decisively for Hessen, which is the deployment the issue is about.

Note that D2 leaves `missing` untouched at ~62%. That bucket is an import-coverage problem, not a rating problem, and is out of scope here.

## Run 3 — Hessen, after deployment (v0.11.0), 2026-10-04

Measured on the production Hessen data node after the v0.11.0 sweep (`API_ONLY=1`, `get_meta` reporting `version: 0.11.0`, `importing: false`). Same query as Run 1. This is the deployed rule — D2 *and* the #776 narrowing of `has_equipment` to play infrastructure, which the Run 2 estimate did not model.

| completeness | has_equipment | has_info | has_photo | count |
|---|---|---|---|---|
| missing | f | f | f | 5836 |
| partial | f | t | f | 1536 |
| partial | t | f | f | 920 |
| complete | t | t | f | **451** |
| complete | t | t | t | 88 |
| partial | f | t | t | 6 |
| partial | t | f | t | 4 |
| missing | f | f | t | 1 |

Totals of 8842: `complete` 539 (6.1%), `partial` 2466 (27.9%), `missing` 5837 (66.0%). Inputs: `has_equipment` 1463 (16.5%), `has_info` 2081 (23.5%), `has_photo` 99 (1.1%).

### Against the Run 2 baseline and estimate

| Bucket | Before (Run 2) | Estimated | **Measured** |
|---|---|---|---|
| `complete` | 87 (1.0%) | ~1215 (14%) | **539 (6.1%)** — ~6× |
| `partial` | 3231 (36.7%) | ~2100 | **2466 (27.9%)** |
| `missing` | 5484 (62.3%) | ~5490 | **5837 (66.0%)** |

### What it confirms

- **The photo gate was the binding constraint.** 451 of the 539 `complete` playgrounds (84%) have equipment and info but no photo — exactly the case the old rule held at `partial`. Only 99 playgrounds in Hessen carry a photo tag at all (1.1%, against Fulda's 8.4%), which settles Run 2's "an order of magnitude lower" inference with a direct count.
- **The old top bucket survived intact.** `complete` with a photo is 88, against 87 `complete` under the old rule — the playgrounds that were already top-rated still are.
- **Photo is no longer an input.** The one photo-only playground is `missing`, as D2 specifies.

### Where the estimate missed

- **`complete` is less than half the estimate.** The estimate applied Fulda's equipment-and-info rate (13.8%) to Hessen; the measured rate is 6.1%. Fulda is better surveyed on every axis, not only photos — the caveat in Run 2 is what bit.
- **`missing` rose by 353, not ~0**, while the region grew by only 40 playgrounds. That is consistent with #776 removing benches, shelters and picnic tables from `has_equipment`: a playground whose only mapped "equipment" was street furniture drops from `partial` to `missing`. Consistent with, not measured — the pre-deployment breakdown was never taken, so the move cannot be attributed row by row.

The closing note of Run 2 stands, now more firmly: two thirds of Hessen is bare `leisure=playground` geometry, and no rating rule moves that bucket.
