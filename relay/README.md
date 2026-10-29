# Action Stations relay

The servers that carry a live exercise between the facilitator's Action Stations app and the
players' devices when they are not all on one laptop's Wi-Fi. Two programs share one core:

| Package                                                         | What it is                                                                                                                                                                                                                                                             | Spec                                                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`core/`](core/) `@actionstations/relay-core`                   | What the two relay adapters share and the hub does not: the HTTP shapes, the connection contract, tokens, edge rate windows. The server contract itself is `SessionHub` in [`src/shared/live/hub.ts`](../src/shared/live/hub.ts), one implementation for every server. | [0406](../docs/specs/0406-live-protocol.md), [ADR-0034](../docs/adr/0034-live-relay-hosting.md) |
| [`cloudflare/`](cloudflare/) `@actionstations/relay-cloudflare` | The **Action Stations relay** at `relay.actionstations.ai`: a Cloudflare Worker with one Durable Object per session, on the free Workers plan with no payment method.                                                                                                  | [0408](../docs/specs/0408-live-relay-cloudflare.md)                                             |
| [`node/`](node/) `@actionstations/relay-node`                   | The **self-hosted server** an organization runs on its own network, with no internet at all: Node, `node:sqlite`, Docker and a single executable. Guide: [self-hosted-server.md](../docs/guides/self-hosted-server.md).                                                | [0409](../docs/specs/0409-live-self-hosted-server.md)                                           |

The in-app server for the room's Wi-Fi ("This computer", issue #407) runs the same core inside
the desktop app.

## What a relay can and cannot see

Every message is encrypted on the device that sends it, with keys that travel only in the invite
link's `#fragment` and never reach a server ([ADR-0027](../docs/adr/0027-live-play-protocol.md)).
A relay, whoever runs it, forwards and stores ciphertext.

| Sees                                                                                                                                                                                               | Does not see                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Session ids, creation time, client ids, connection times and IP addresses, frame types, sizes and timing, destinations (`all`, `controller`, `role:<opaque id>`), blob ids and sizes, token hashes | Any payload: inject text or media, messages, votes, hot wash items, observations, role names, player names, keys |

The relay refuses frames it cannot account for (wrong sender, replayed sequence number,
controller-only type from a participant) and filters catch-up by destination, but no
confidentiality depends on that: a server that ignored every rule could still read nothing.

## Limits on the Action Stations relay

Per session: 60 devices, 64 KiB per message, blobs up to 8 MiB each and 64 MiB in total, 1,500
stored messages (12 MiB) and a lifetime budget of 3,600 row writes, 30 messages a minute per
participant. Per address: 3 sessions a day; account-wide: 25 sessions a day (UTC). Past a limit the app
shows a plain message and the way out: switch the session to **This computer** or **Your
server**, or try after 00:00 UTC. Nothing is ever billed; the account has no payment method, and
Cloudflare fails an operation past the free allowance with an error.

## Retention

Stored messages and blobs are deleted when the facilitator ends the session, or 72 hours after
it was created, whichever comes first. A content-free marker stays for one hour after the end
so a late reconnect gets "session ended" instead of "unknown session". Nothing is stored
anywhere else: no logs with payloads, no backups, no analytics.

## Run your own

Organizations that cannot use the internet or a third party run the same core on their network:
see spec [0409](../docs/specs/0409-live-self-hosted-server.md); the install guide
(`docs/guides/self-hosted-server.md`) lands with issue #409.

## Development

```
pnpm test                                   # root Vitest runs relay/*/test alongside the app's tests
pnpm typecheck                              # includes relay/core and relay/cloudflare
pnpm --filter @actionstations/relay-cloudflare bundle:check   # wrangler --dry-run (no login, no deploy)
```

The conformance suite in [`src/shared/live/server-conformance.ts`](../src/shared/live/server-conformance.ts)
is the server contract as tests. It runs against `MemoryServer`, the LAN server over WebSocket
and SSE, and the Cloudflare Durable Object under a runtime shim; `hub-store-conformance.ts` runs
against every `HubStore`. A new server or store passes when the suites do.

Connecting (every server): `GET /v1/sessions/<id>/ws?client=<clientId>` with the subprotocols
`as-live.v1`, `j.<joinToken>`, `r.<resumeToken>`; controllers send `Authorization: Bearer`. Tokens
in a query string are refused.

Deploying the relay: [`cloudflare/DEPLOY.md`](cloudflare/DEPLOY.md). Problems: open an issue
with the `area:live` label; never paste a session id or an invite link into one.
