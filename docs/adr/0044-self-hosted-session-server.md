# ADR-0044: Self-hosted session server: Node adapter, `node:sqlite`, single executable

Date: 2026-10-29 · Status: Accepted · Issue: #409 · Spec: [0409](../specs/0409-live-self-hosted-server.md) · Related: [ADR-0034](0034-live-relay-hosting.md), [ADR-0032](0032-lan-session-server.md), [ADR-0027](0027-live-play-protocol.md)

## Context

An organization with no internet, or with a rule against third-party services, needs the same live play server on its own network. The shared `SessionHub` (ADR-0034) already holds the whole server contract; what remained was a host for it that an IT department can install, review and run without the project's help.

## Decision

- **A third adapter, not a third implementation.** `relay/node` runs `SessionHub` with a `HubStore` on `node:sqlite` and nothing else of its own that touches a frame. WebSocket and SSE + POST connections are the LAN server's code (`src/main/live/transport/lan/ws.ts`, `fallback.ts`, `respond.ts`, `connect-params.ts`), shared by import. The only change to that code was that it takes a `ConnectionLog` interface instead of the LAN log class, and that a WebSocket may be a controller the server authenticated.
- **One database file for all sessions.** `node:sqlite` needs no native addon, so the single executable stays one file. Per-session running totals sit in the session's row and change in the same savepoint as the rows they describe. Blob chunks are rows by default or files under the data directory (`--blobs disk`), named from validated ids. The shared `HubStore` contract suite and the server contract suite both run against it.
- **A server key guards creation.** A random secret printed once at first start (only its SHA-256 is stored; `rotate-key` replaces it at once) is required on `POST /v1/sessions`. Without it a stranger on the network can read nothing and create nothing; the controller token and join token work as in the protocol.
- **No outbound connection, enforced three ways.** An ESLint rule bans HTTP clients, DNS, `net`/`tls` connects and `fetch` in the package; a test runs the bundled server with every way out replaced by a recorder and drives a full session; the systemd unit and a Docker internal network deny egress in the operating system.
- **TLS is the organization's or a pinned self-signed one.** PEM files, or an ECDSA P-256 certificate generated on first start and kept in the data directory, whose fingerprint is printed and reported by `/v1/health` for the app to pin. Plain HTTP only with `--insecure-http` and a warning.
- **Packaging is Docker plus Node SEA.** A multi-stage image (non-root, read-only root, `/data` volume) and a single executable for Windows and Linux x64 built with Node's single executable tooling and `postject`, the bundle and the player page embedded. A Windows service and a systemd unit are written by the program itself (`service install`), so they match its version.
- **Logs hold fixed fields only.** `connections.log` and `server.log` are JSON lines rotated at 10 MB × 5; a guard throws on any record carrying a payload, frame, token or key field. The log level has no setting that prints messages.
- **The image is not published by this change.** The commands to publish a public image on GitHub Container Registry are documented; publishing waits for the owner to confirm the organization's Packages budget (ADR-0023).

## Consequences

- A change to connection handling in the LAN server reaches the self-hosted server; both are covered by the shared suites.
- `node:sqlite` is newer than `better-sqlite3` and its API is smaller. The `HubStore` interface isolates it; switching is one file.
- The server runs one process per data directory. Clustering and high availability are out of scope.
- Devices behind a gateway or reverse proxy share one address, so the hub's per-address limit on new device identities is raised to the session's client cap; the client cap is the bound on this server.
- The app side (the "Your server" client with certificate pinning) is a separate change with #410.
