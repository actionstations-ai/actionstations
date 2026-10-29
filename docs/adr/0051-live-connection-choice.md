# ADR-0051: Live play connection choice, consent and certificate pinning

Date: 2026-10-29 · Status: Accepted · Issue: #410

## Context

Live play can run on the facilitator's computer (LAN), on the Action Stations relay (Cloudflare) or on an organization's own server. Project rules 3 says the app makes no network call to a provider the user did not configure. The relay and a self-hosted server also need a trust rule: a self-hosted server often has a self-signed certificate, and a bearer credential (the server key) must not reach a server whose certificate was never confirmed.

## Decision

- The connection is chosen per scenario and stored in `facilitator.json` (`live.connection`); `live.consented` records which remote kinds the facilitator confirmed for that scenario. `settings.json` only pre-selects a kind for a scenario with none and lists remembered servers.
- No probe runs on its own. `live:connection-test` and `live:session-start` are the only callers of the relay and server clients. Remote kinds need consent first; a test or start without it is refused in main, not only disabled in the UI. A unit test asserts that importing the live play modules opens no socket and makes no request.
- The relay address is a constant (`src/shared/live/servers.ts`); an unpackaged run can override it with `TTX_LIVE_RELAY_URL` for tests.
- Self-hosted trust: https only (http only for a loopback or private host with an explicit "no TLS" tick). With no pin, certificates validate against system roots. A self-signed server is first inspected by an unauthenticated `GET /v1/health` that records its fingerprint; the facilitator confirms it and the app pins it. A pinned connection accepts exactly that certificate. Node skips `checkServerIdentity` once chain validation fails, so the pin is enforced by an agent that corks writes until `secureConnect` has compared the fingerprint; the server key and every header are sent only after the match. A mismatch stops with "The server's certificate changed".
- The server key is stored with the other secrets under `live-server-<sha256 of the address>` (secret names cannot contain `:`). Settings and IPC answers carry `hasKey` only.
- A remote session is the same `LiveClient` as a LAN session; only the controller's transport differs (a WebSocket with `Authorization: Bearer <controllerToken>` instead of the in-process hub). Failure after the server session was created ends it.

## Consequences

- Choosing the relay or a server costs one extra click per scenario and nothing is sent before it.
- A changed certificate is a hard stop, never a prompt to continue.
- The server's key check (`POST /v1/sessions/probe`) is optional: a server without it gets a "checked when the session starts" line instead of a failure.
- Kick and key rotation (#417) are not part of this change.
