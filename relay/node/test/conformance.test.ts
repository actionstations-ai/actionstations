// The shared contracts (specs 0406 and 0409) against the Node adapter over real sockets: the
// server contract with participants on a WebSocket over HTTPS (self-signed certificate) and on
// the SSE + POST fallback over HTTP, and the HubStore contract against `node:sqlite` with blob
// chunks in the database and on disk.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeHubStoreContract } from '@shared/live/hub-store-conformance'
import { LIMITS } from '@shared/live/protocol'
import { describeServerContract, type ServerFactory } from '@shared/live/server-conformance'
import { sseTransport, wsTransport } from '@main/live/transport/lan/test-clients'
import { RelayDatabase } from '../src/sqlite-store'
import { startTestServer } from './helpers'

function nodeFactory(tls: 'self-signed' | 'none', via: typeof wsTransport): ServerFactory {
  return async (opts) => {
    const limits = { ...(opts.kind === 'self-hosted' ? {} : LIMITS[opts.kind]), ...opts.limits }
    const s = await startTestServer({
      tls,
      limits,
      maxClients: limits.clients,
      hubOverrides: {
        kind: opts.kind,
        ...(opts.framesPerMinute !== undefined ? { framesPerMinute: opts.framesPerMinute } : {}),
        ...(opts.storedEnvelopes !== undefined ? { storedEnvelopes: opts.storedEnvelopes } : {}),
        ...(opts.storedBytes !== undefined ? { storedBytes: opts.storedBytes } : {}),
        ...(opts.rowWriteBudget !== undefined ? { rowWriteBudget: opts.rowWriteBudget } : {}),
        ...(opts.catchupBytes !== undefined ? { catchupBytes: opts.catchupBytes } : {}),
      },
    })
    const created = await s.registry.create(opts.joinTokenHash, opts.sessionId)
    if (!created.ok) throw new Error('could not create the session')
    const live = s.registry.get(opts.sessionId)!
    const controllerOptions = {
      protocols: ['as-live.v1'],
      headers: { Authorization: `Bearer ${created.controllerToken}` },
    }
    let coOptions: typeof controllerOptions | undefined
    const coControllerOptions = async () => {
      if (!coOptions) {
        const token = await s.registry.addController(live)
        coOptions = { protocols: ['as-live.v1'], headers: { Authorization: `Bearer ${token}` } }
      }
      return coOptions
    }
    return {
      connect: async (o) =>
        o.controller
          ? wsTransport(
              s.url,
              opts.sessionId,
              { clientId: o.clientId },
              o.host === false ? await coControllerOptions() : controllerOptions,
            )
          : via(s.url, opts.sessionId, {
              clientId: o.clientId,
              ...(o.joinToken ? { joinToken: o.joinToken } : {}),
              ...(o.resumeToken ? { resumeToken: o.resumeToken } : {}),
            }),
      kick: (id) => live.hub.kick(id),
      end: () => s.registry.end(opts.sessionId),
      setJoinTokenHash: (hex) => live.hub.setJoinTokenHash(hex),
      get lastIndex() {
        return live.hub.lastIndex
      },
      get connected() {
        return live.hub.connected
      },
      stop: () => s.destroy(),
    }
  }
}

describeServerContract(
  'self-hosted server, WebSocket over HTTPS',
  nodeFactory('self-signed', wsTransport),
)
describeServerContract(
  'self-hosted server, SSE + POST over HTTP',
  nodeFactory('none', sseTransport),
)

function storeHarness(blobs: 'db' | 'disk') {
  return () => {
    const dir = mkdtempSync(join(tmpdir(), 'relay-store-'))
    const db = RelayDatabase.open(dir, blobs)
    return {
      store: db.storeFor('session-00000000000000'),
      close: () => {
        db.close()
        rmSync(dir, { recursive: true, force: true })
      },
    }
  }
}

describeHubStoreContract('node:sqlite, chunks in the database', storeHarness('db'))
describeHubStoreContract('node:sqlite, chunks on disk', storeHarness('disk'))
