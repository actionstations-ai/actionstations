# ADR-0067: Repository stats are recorded daily by a workflow on a `stats` branch

## Context

ADR-0002 ruled out GitHub Actions, so stats (#378) were recorded only when someone ran
`pnpm stats` or cut a release, and a macOS reminder (#381) was meant to prompt the maintainer.
The reminder was never installed, so the history had gaps. ADR-0023 now allows free workflows on
this public repository. A job that commits to `main` would bypass the pull request rule.

## Decision

- `.github/workflows/stats.yml` runs `scripts/repo-stats.mjs` daily and on demand, on a standard
  runner, with no artifacts and no caches. Top-level permissions are read-only; only the one job
  has `contents: write`.
- It commits `docs/stats/` to a `stats` branch and pushes only that branch. If the branch is
  missing, the first run creates it as an orphan holding `docs/stats/history.json` copied from
  `main`. A run with no change commits nothing.
- The README chart and badge load from `raw.githubusercontent.com/.../stats/docs/stats/`.
- `scripts/release.sh` takes no snapshot (one writer). `pnpm stats` stays for local use.
- The launchd reminder (`scripts/stats-reminder.mjs`, `pnpm stats:reminder`) is removed.
- `docs/stats/history.json` on `main` stays as the seed and is no longer updated.

## Consequences

- The history has one snapshot a day without anyone remembering to run it.
- `main` gets no stats commits; the branch has its own small history.
- If the workflow is disabled (GitHub disables scheduled workflows after 60 days of repository
  inactivity), snapshots stop until it is re-enabled from the Actions tab.
