# Release procedure

## Container images

Three images are published to GHCR on every release:

| Image | Used by |
|---|---|
| `ghcr.io/mfuhrmann/spieli` | app container (standalone + hub) |
| `ghcr.io/mfuhrmann/spieli-data` | data-node proxy (no frontend) |
| `ghcr.io/mfuhrmann/spieli-importer` | OSM importer |

### Tags published per event

| Git event | Tags written |
|---|---|
| Push to `main` | `:rc` |
| Push of `v*` tag | `:latest`, `:X.Y.Z`, `:X.Y` |

`compose.prod.yml` and `install.sh` both reference `:latest`. Without a properly tagged release, new operator installs fail with `image not found`.

## Version convention

`app/package.json` always carries the *next* version as an `-rc` suffix on `main` (e.g. `0.2.6-rc`). The `-rc` is removed only for the release commit. After tagging, `main` is immediately bumped to the next `-rc`.

## Release checklist

```bash
# 1. Make sure main is green and all intended PRs are merged.

# 2. Remove the -rc suffix in app/package.json.
#    Example: "0.2.6-rc" → "0.2.6"
$EDITOR app/package.json

# 3. Commit.
git commit -am "chore: release v0.2.6"

# 4. Tag and push the tag.  CI fires on the tag push and publishes
#    :latest, :0.2.6, and :0.2 for all three images.
git tag v0.2.6
git push origin main
git push origin v0.2.6

# 5. Create the GitHub release.  This is NOT done automatically by CI —
#    without this step the tag exists but the Releases page stays stale
#    and operators have no release notes.
gh release create v0.2.6 \
  --title "v0.2.6 — <short summary>" \
  --notes "$(cat <<'EOF'
## What's new
- ...

## Breaking changes
- none

## Images
\`\`\`
ghcr.io/mfuhrmann/spieli:0.2.6
ghcr.io/mfuhrmann/spieli-importer:0.2.6
\`\`\`
EOF
)"

# 6. Verify all three images are visible in GHCR and :latest is updated.
#    https://github.com/mfuhrmann?tab=packages&repo_name=spieli

# 7. Bump main to the next -rc.
#    Example: "0.2.6" → "0.2.7-rc"
$EDITOR app/package.json
git commit -am "chore: bump version to 0.2.7-rc"
git push origin main
```

## Current state (as of 2026-04-26)

| Item | State |
|---|---|
| `app/package.json` on `main` | `0.2.6-rc` |
| Latest git tag on origin | `v0.2.4` |
| Latest GitHub release | `v0.2.0` (2026-04-19, by @rntrommer) |
| `:latest` container | **does not exist** → root cause of #274 |

**What went wrong with v0.2.4:** the release commit (`chore: release v0.2.4`) and the `v0.2.4` tag were pushed to origin, which caused CI to run and publish `:latest`, `:0.2.4`, `:0.2`. However, step 5 (`gh release create`) was never run, so the Releases page still shows v0.2.0 as the latest release.

Additionally, tags `v0.2.1`–`v0.2.3` were created locally but never pushed to origin and have no effect.

**To fix #274:** run steps 5–7 above for `v0.2.6` (after merging the remaining open work), or re-trigger CI for `v0.2.4` and create a GitHub release for it if that version is considered stable.

## E2E tests and tag pushes

The E2E test workflow runs on pushes to `main` and on pull requests — **not** on tag pushes. This means the image published on a tag push is built from a commit that was already tested when it landed on `main`. No additional test run is needed before tagging.
