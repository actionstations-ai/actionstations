# ADR-0069: Tabletop Benchmark keeps scoring in the app repository and publishes hashed task sets

## Context

The benchmark of spec 0434 produces run files that only this project reads. The owner wants a
public, citable benchmark of LLMs generating tabletop exercises (#586): a separate public
repository, a Hugging Face dataset and leaderboard Space, a page on actionstations.ai, and open
submissions. Scoring depends on the app's own lint, citation grounding, pipeline and prompts, and
the cases drive the built app. GitHub and services must cost nothing (ADR-0023).

## Decision

- The benchmark is named **Tabletop Benchmark**. Public repo `actionstations-ai/tabletop-bench`;
  Hugging Face dataset and Space under the organization `actionstations` (`tabletop-benchmark`, `tabletop-benchmark-leaderboard`); a
  page on actionstations.ai.
- **Scoring and runner stay in this repository.** The public repository holds the exported task
  sets (`pnpm bench:export`), results, verification records, methods, and tooling that aggregates
  scores but computes none. This keeps one implementation of scoring.
- A task set is a set of files with a sha256 over their paths and hashes. Runs record
  `taskSetHash`; the public runner refuses to run when the app's hash differs from the repository's.
  Task sets are immutable; changes make a new version.
- Scoring stays model-free (spec 0434). Published models are open-weight and local, with sampling
  from model-card profiles (ADR-0068). Hosted adapters can plug in later; no paid call is made now.
- Anyone may submit a run file by pull request; it is `community` until a maintainer rerun agrees
  within a stated tolerance (`verified`) or not (`disputed`).
- Licenses: task sets and results CC BY 4.0; code under the app's license. No GitHub Actions.

## Consequences

- Reproducing a result needs an Action Stations checkout at the recorded commit; the task sets are
  readable without one.
- A scoring change bumps the scoring version and results are not ranked across versions.
- Task inputs are public, so contamination is possible; a private held-out suite is a later option.
- The Hugging Face assets can move to an organization without changing file formats.
