# Action Stations relay

The servers that carry a live exercise between the facilitator's Action Stations app and the
players' devices when they are not all on one laptop's Wi-Fi. Two programs share one core:

| Package                                                         | What it is                                                                                                                                                                                                    | Spec                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [`core/`](core/) `@actionstations/relay-core`                   | The server contract of the live play protocol as a state machine: who may connect, what a frame must look like, routing, catch-up for late joiners, blob chunks, rate limits, retention. No sockets, no keys. | [0406](../docs/specs/0406-live-protocol.md)           |
| [`cloudflare/`](cloudflare/) `@actionstations/relay-cloudflare` | The **Action Stations relay** at `relay.actionstations.ai`: a Cloudflare Worker with one Durable Object per session, on the free Workers plan with no payment method.                                         | [0408](../docs/specs/0408-live-relay-cloudflare.md)   |
| `node/` `@actionstations/relay-node`                            | The **self-hosted server** an organization runs on its own network, with no internet at all. Lands with issue #409.                                                                                           | [0409](../docs/specs/0409-live-self-hosted-server.md) |

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

Per session: 60 devices, 64 KiB per message, blobs up to 8 MiB each and 64 MiB in total, 4,000
stored messages, 30 messages a minute per participant (bursts of 10), 600 a minute per session,
20 reconnects per device per hour. Account-wide: 25 sessions a day (UTC). Past a limit the app
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

The conformance suite in [`core/test/conformance.ts`](core/test/conformance.ts) is the server
contract as tests. It runs against the reference `MemoryServer` in `src/shared/live`, against
`SessionHub` on every store, and against each adapter (the Cloudflare Durable Object under a
runtime shim, the Node server over real sockets). A new server passes when the suite does.

Deploying the relay: [`cloudflare/DEPLOY.md`](cloudflare/DEPLOY.md). Problems: open an issue
with the `area:live` label; never paste a session id or an invite link into one.
