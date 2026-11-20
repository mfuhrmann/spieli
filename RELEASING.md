# Release procedure

## Container images

Two images are published to GHCR on every release:

| Image | Used by |
|---|---|
| `ghcr.io/mfuhrmann/spieli` | app container (standalone + hub) |
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

`main` is protected by the same rule as every other change: version bumps go through a pull request too.

```bash
# 1. Make sure main is green and all intended PRs are merged.
#    Check the merged PRs' labels (requires-schema-update, requires-reimport,
#    requires-env-update, requires-compose-update): any of them → minor bump,
#    none → patch bump.

# 2. On a branch, remove the -rc suffix (e.g. "0.2.6-rc" → "0.2.6") in
#    app/package.json and app/package-lock.json, and set TAG= to the new tag
#    in the install block of docs/getting-started/quick-start.md.
#    Commit as "chore: release v0.2.6", open a PR, merge it.

# 3. Tag the merge commit on main and push the tag.
git switch main && git pull
git tag v0.2.6
git push origin v0.2.6

#    CI fires on the tag push. It publishes :latest, :0.2.6 and :0.2 for both
#    images, then creates the GitHub release itself: release notes generated
#    from the merged PRs, an upgrade table as footer, and install.sh plus
#    install.sh.sha256 as release assets. Nothing to do by hand.

# 4. Verify the release page and that both images are visible in GHCR with
#    :latest updated.
#    https://github.com/mfuhrmann/spieli/releases
#    https://github.com/mfuhrmann?tab=packages&repo_name=spieli

# 5. On a branch, bump to the next -rc ("0.2.6" → "0.2.7-rc") in
#    app/package.json and app/package-lock.json.
#    Commit as "chore: bump version to 0.2.7-rc", open a PR, merge it.
```

## E2E tests and tag pushes

The E2E test workflow runs on pushes to `main` and on pull requests — **not** on tag pushes. This means the image published on a tag push is built from a commit that was already tested when it landed on `main`. No additional test run is needed before tagging.
