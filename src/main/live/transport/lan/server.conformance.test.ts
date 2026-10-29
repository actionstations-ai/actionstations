// The spec 0406 server contract against the LAN server (#407) over real connections: WebSocket
// on HTTPS with the per-session certificate, and the SSE + POST fallback on plain HTTP. The same
// suite runs against MemoryServer in src/shared/live; the controller is attached in process here
// as the app does.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionHub } from '@shared/live/hub'
import { describeServerContract, type ServerFactory } from '@shared/live/server-conformance'
import { MemoryServer } from '@shared/live/transport-memory'
import { LanLog } from './log'
import { startLanServer } from './server'
import { sseTransport, wsTransport } from './test-clients'

function lanFactory(tls: 'self-signed' | 'none', via: typeof wsTransport): ServerFactory {
  return async (opts) => {
    const hub = new SessionHub(opts)
    const dir = mkdtempSync(join(tmpdir(), 'ttx-lan-conf-'))
    const lan = await startLanServer({
      address: '127.0.0.1',
      port: 0,
      tls,
      hub,
      bundleDir: join(dir, 'no-bundle'),
      log: new LanLog(join(dir, 'lan.log')),
      version: 'test',
    })
    const local = new MemoryServer({ hub })
    const origin = lan.status.url.slice(0, lan.status.url.indexOf('/s/'))
    return {
      connect: (o) =>
        o.controller
          ? local.connect(o)
          : via(origin, opts.sessionId, {
              clientId: o.clientId,
              ...(o.joinToken ? { joinToken: o.joinToken } : {}),
              ...(o.resumeToken ? { resumeToken: o.resumeToken } : {}),
            }),
      kick: (id) => hub.kick(id),
      end: () => hub.end(),
      setJoinTokenHash: (hex) => hub.setJoinTokenHash(hex),
      get lastIndex() {
        return hub.lastIndex
      },
      get connected() {
        return hub.connected
      },
      stop: () => lan.stop(),
    }
  }
}

describeServerContract('LAN server, WebSocket over HTTPS', lanFactory('self-signed', wsTransport))
describeServerContract('LAN server, SSE + POST over HTTP', lanFactory('none', sseTransport))
