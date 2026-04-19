# ADR-0001: Share OpenSpec specs and archive in git

- **Status:** Accepted
- **Date:** 2026-04-19
- **Deciders:** @mfuhrmann

## Context

We use [OpenSpec](https://github.com/tbwiss/openspec) as an AI-assisted
spec/change workflow alongside Claude Code. It writes three things to
`openspec/` in the repo root:

| Path | Contents | Lifecycle |
|---|---|---|
| `openspec/specs/<capability>/spec.md` | Durable per-capability requirements | Long-lived, updated when requirements change |
| `openspec/changes/<name>/` | In-flight change proposals (proposal, design, tasks, deltas) | Short-lived — created, worked on, archived |
| `openspec/changes/archive/<date>-<name>/` | Frozen record of a shipped change | Long-lived, append-only |

Today `.gitignore` contains a single line:

```
openspec/
```

That made sense while we were the only user of the tool, but the repo
has since accumulated enough OpenSpec state that the wholesale ignore
costs more than it saves:

- **7 capability specs** live only on one laptop. The knowledge they
  capture (deployment-mode-selection, hub-ui-parity, mkdocs-site,
  playwright-ci, rc-container-tag, scheduled-importer, slim-readme) is
  already reflected in shipped code and docs, but the *why* behind each
  requirement is locked up.
- **6 archived change decisions** (proposal + design + tasks for each
  shipped change) record the trade-offs we walked through. None of that
  survives in git history — commit messages capture *what* shipped, not
  *why we rejected the alternatives*.
- We can't hand off an OpenSpec-driven task to a collaborator via a PR.
  Issue [#190] worked around this by pasting the design inline into the
  issue body, which is fragile.
- Claude Code can't read prior design decisions on a fresh clone,
  which defeats the point of writing them down.

A second contributor (@ronnytrommer) also uses Claude Code + OpenSpec,
so the tool is no longer single-operator.

## Decision

Track `openspec/specs/` and `openspec/changes/archive/` in git. Keep
active `openspec/changes/<name>/` directories ignored.

Replace the `openspec/` line in `.gitignore` with:

```
# OpenSpec — track specs + archived decisions, hide in-flight changes
openspec/changes/*/
!openspec/changes/archive/
!openspec/changes/archive/**
```

This gives us:

| Path | Tracked? | Why |
|---|---|---|
| `openspec/specs/**` | **yes** | Durable requirements; AI tools benefit from reading them on a fresh clone |
| `openspec/changes/archive/**` | **yes** | Decision log — the "why" that commit messages don't carry |
| `openspec/changes/<active>/**` | no | In-flight, churny, often private-in-progress thinking |
| `openspec/AGENTS.md`, top-level config | **yes** | So clones know what the directory is for |

An `openspec/README.md` pointing at this ADR goes in as part of the
implementation so a confused first-time reader has a landing.

## Alternatives considered

- **P0 — Keep `openspec/` wholesale ignored.** The current state. Cheap
  to maintain but makes every decision a single-laptop secret.
- **P1 — Track `openspec/specs/` only.** Gets the durable requirements
  into git but loses the decision log — the most expensive thing to
  recreate. Rejected.
- **P3 — Track everything under `openspec/`.** Includes in-flight
  changes. Creates noisy diffs on every exploration session and forces
  "is my WIP proposal ready for a teammate to see?" into a constant
  judgment call. Rejected.

P2 (this ADR) is the sweet spot: tracks the two artifact kinds with
long-term value, leaves working-memory unshared.

## Consequences

**Positive:**

- Specs and archived decisions survive across machines and appear in
  fresh clones.
- A collaborator can take over an issue and, after the change is
  archived, the decision rationale ships with the merge.
- Claude Code (or any AI tool) can read `openspec/specs/` and prior
  archives as grounding context.
- Git history becomes the AI memory multiplier — every future session
  inherits the reasoning of past sessions.

**Negative / to manage:**

- **First-time coordination gotcha.** @ronnytrommer has a local
  `openspec/` with specs and archives that diverge from
  @mfuhrmann's. When we commit the baseline, one of us will have a
  messy first pull. Two options:
  - *Option A (default):* @mfuhrmann lands the baseline. @ronnytrommer
    reviews the diff against his local state, rebases any genuine
    differences onto the shared baseline in a follow-up PR.
  - *Option B:* pre-sync by diffing the two `openspec/specs/` trees
    before committing. More work, smaller follow-up.
- **In-flight proposals are no longer on the teammate's radar by
  default.** For handoff we'll keep using GitHub issues with the
  proposal pasted inline (pattern established by issue #190). If this
  becomes a real friction we can revisit.
- **`openspec validate` must stay green on `main`.** Add it to CI as
  part of the implementation so broken archives don't rot the shared
  history.

## Implementation plan

Tracked in issue [#192]. Summary:

1. `.gitignore`: replace the `openspec/` line with the pattern in
   "Decision" above.
2. Baseline commit: add `openspec/specs/`, `openspec/changes/archive/`,
   `openspec/AGENTS.md`, `openspec/project.md`, and a small
   `openspec/README.md` pointing at this ADR.
3. `.claude/CLAUDE.md` (or project CLAUDE.md): note that archived
   changes and specs are now tracked, so Claude can read them; active
   changes remain local.
4. Coordinate the baseline with @ronnytrommer using Option A above,
   unless Option B is obviously cheaper by then.
5. Optional follow-up: add `openspec validate` to CI.

## References

- [OpenSpec](https://github.com/tbwiss/openspec)
- Issue [#190] — handoff workaround that motivated this ADR
- Issue [#192] — implementation
