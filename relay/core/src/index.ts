/**
 * `@actionstations/relay-core`: what the two relay adapters share and the hub does not provide.
 * The server contract itself is `SessionHub` in `src/shared/live/hub.ts` (one implementation for
 * the LAN server, the relay and the self-hosted server); this package adds the HTTP shapes, the
 * connection contract, tokens and edge rate windows. It imports the protocol's schemas, limits
 * and byte helpers from `src/shared/live/` and nothing with a key.
 */
export * from './api'
export * from './quota'
export * from './tokens'
