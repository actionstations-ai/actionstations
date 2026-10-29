# ADR-0034: Live play relay: shared core, Cloudflare free plan, hand deploy

Date: 2026-10-29 · Status: Accepted · Issues: #408 (#409 adds the Node adapter) · Specs: [0408](../specs/0408-live-relay-cloudflare.md), [0409](../specs/0409-live-self-hosted-server.md) · Related: [ADR-0027](0027-live-play-protocol.md), [ADR-0023](0023-free-github-actions.md)

## Context

Remote and hybrid exercises need a meeting point on the internet; organizations without internet need the same thing on their own network; and the in-app server for the room's Wi-Fi (#407) implements the same contract. The protocol (ADR-0027) already makes every server blind to content. What remained to decide: where the server code lives, how three servers stay identical in behaviour, what the public relay runs on without ever costing money (CONTRIBUTING, Project rules 1), and how it is deployed without a secret in GitHub.

## Decision

- **One core, three adapters, in this repository.** `relay/core` (`@actionstations/relay-core`, a pnpm workspace package) is the server contract of spec 0406 as a pure state machine (`SessionHub`) over a synchronous `SessionStore` interface, importing only the protocol's schemas, limits and byte helpers from `src/shared/live`. Adapters own sockets and storage: `relay/cloudflare` (Durable Object + SQLite), `relay/node` (#409, `ws` + `node:sqlite`), and the LAN server inside the app (#407, in memory). Protocol and servers change in one pull request, one `ci:local`, one issue tracker.
- **The contract is a test suite.** `relay/core/test/conformance.ts` is run against the reference `MemoryServer` (spec 0406), against the hub on every store, and against each adapter through a harness that speaks `Transport`. A server is conformant when the suite passes; `MemoryServer` itself was corrected where it strayed from the spec (it announced presence for refused connections and returned a client's own frames in catch-up).
- **Server-only caps live in the core.** `HubLimits` adds to the protocol's `LIMITS` what only a server enforces: stored envelopes per session and token-bucket rates per participant, per controller and per session, plus a reconnect window. The relay's numbers protect a shared free allowance; LAN and self-hosted defaults are looser.
- **The public relay runs on Cloudflare's free Workers plan on an account with no payment method.** One Durable Object per session (SQLite backend, hibernation API, alarms for 72-hour retention and the one-hour tombstone), a singleton quota object capping sessions at 25 a day, static assets for the player page, and a mapping of the runtime's limit errors to `503 DAILY_LIMIT`. Past an allowance Cloudflare fails the operation and bills nothing; the deploy guide makes checking the plan and the absence of a payment method the first step of every deploy.
- **Deployed by hand, never by a workflow.** `wrangler` is run through `pnpm dlx` at a pinned version from a developer's machine after a browser login; it is not a dependency of the repository, and no Cloudflare token exists in GitHub. `wrangler.toml` holds names and bindings only.
- **The server stores no session name.** `POST /v1/sessions` takes the protocol version and, optionally, the join-token hash; the app keeps whatever it calls the session. Because the join token is derived from the session id the server mints, the app sets the hash with `POST …/join-token` right after creation.

## Consequences

- Any server operator, the project included, sees ids, sizes, timing and addresses and nothing else; the relay's README states it and the deploy guide repeats it.
- The relay cannot incur a charge: no payment method, free products only, and every limit fails closed. The price is that a very busy day ends at 25 sessions until 00:00 UTC, and the app must say so plainly (#410).
- The Cloudflare adapter is tested under a small runtime shim (`SqlStorage` on `node:sqlite`, fake hibernatable sockets) inside the root Vitest run, because `@cloudflare/vitest-pool-workers` pins vitest 4 and the repository is on 5. A run under `wrangler dev` (`LIVE=1`) is a follow-up; the Worker bundle is checked with `wrangler deploy --dry-run`.
- `@cloudflare/workers-types` is not used: it replaces the DOM globals the shared protocol code compiles against. The adapter declares the slice of the runtime it uses in `src/workers-runtime.d.ts`.
- Adding a server later (another host, another storage) means one adapter and one harness; the contract and its tests do not change.
