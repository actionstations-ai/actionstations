// Records every outbound connection a Node process makes, from its first line of code (#273).
// e2e/packs.spec.ts loads it with Electron's `-r` switch (Playwright drops NODE_OPTIONS), so it
// runs in the app's main process before the app does. Each record is one JSON line appended to
// $TTX_NET_LOG: a start marker, fetch (undici), http(s).request and TCP sockets.
/* eslint-disable @typescript-eslint/no-require-imports -- preloaded with -r, so CommonJS */
'use strict'
const dc = require('node:diagnostics_channel')
const { appendFileSync } = require('node:fs')

const out = process.env.TTX_NET_LOG
if (out) {
  const write = (rec) => {
    try {
      appendFileSync(out, JSON.stringify({ pid: process.pid, ...rec }) + '\n')
    } catch {
      // A missing log fails the spec's own "the recorder saw the catalog" check.
    }
  }
  write({ via: 'start', argv: process.argv.slice(0, 3) })
  dc.subscribe('undici:request:create', ({ request }) =>
    write({ via: 'fetch', origin: String(request.origin), path: request.path }),
  )
  dc.subscribe('http.client.request.start', ({ request }) =>
    write({ via: 'http', host: request.host, path: request.path }),
  )
  dc.subscribe('net.client.socket', ({ socket }) =>
    socket.once('connect', () =>
      write({ via: 'socket', host: socket.remoteAddress, port: socket.remotePort }),
    ),
  )
}
