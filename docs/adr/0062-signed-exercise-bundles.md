# ADR-0062: Signed exercise bundles for regional exercises

Date: 2026-10-29 · Status: Accepted · Issue: #440

## Context

Several organizations plan one exercise and each keeps its plans on its own computer. They must
exchange exercise material (a shared frame, each organization's rows and injects) and be sure who
made a bundle and that it was not changed. Packs (ADR-0018) are unsigned, installed into the app
and reusable; an exercise belongs to one scenario and is exchanged in rounds.

## Decision

- A new `.asexercise` format, sibling to `.aspack`. It reuses the pack archive reader's checks
  (single reading of the zip, entry and byte limits, the pack path rules, `zipTree` for a
  deterministic archive) and is never installed into `userData/packs/`.
- Each organization identity has an Ed25519 key (signs bundles) and a P-256 key (its controller key
  in a joint live session, listed in the signed roster). Private keys are encrypted with
  safeStorage under `org-key-<orgId>`; the public keys and the fingerprint are in settings.json.
  Key creation is refused when the OS cannot encrypt.
- `bundle.json` lists the sha256 of every other file and is signed over its canonical JSON.
  Trust is per exercise: the first key from an organization is pinned only after the user types
  the fingerprint received by phone or in person; a different key later is refused until the user
  states they verified the new fingerprint. No certificate authority.
- What may leave is a path allow-list plus strict zod schemas for the frame, slice, row and
  inject. Citations are reduced to document title and heading unless the owner shares quotes.
  A row private to the owner's controllers leaves as a placeholder.
- The host merges. Slices are checked for ownership (id prefix and owner), revision regression,
  duplicates, stale frame, timing and dependencies; the merged bundle is signed by the host only.
- Org ids are the lowercase prefix; a row is reserved to an organization by its id prefix
  (`AIR-I-07`), and an inject by its row.
- The live roster and per-organization log slices are pure functions; the protocol side
  (`controller.roster`, scope checks) already exists in `src/shared/live/`.

## Consequences

- A partner's merged-bundle slices are trusted through the host's signature, not their own.
- One identity per prefix per computer; two organizations can be played on one computer for tests.
- Generation (`msel_phase`) is not yet restricted to the organization's own rows; user saves that
  touch a partner's row are refused (`assertOwnRowsOnly`).
- Packs may gain signing later by reusing `src/main/regional/keys.ts`, in a separate ADR.
