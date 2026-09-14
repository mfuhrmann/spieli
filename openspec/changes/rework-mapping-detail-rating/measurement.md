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
