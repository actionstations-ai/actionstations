/* eslint-disable @typescript-eslint/no-require-imports */
// Loaded into the server process with --require by no-outbound.test.ts: every way out of the
// process is replaced with one that records the attempt in OUTBOUND_LOG and throws. Listening
// sockets are untouched. DNS lookups of plain addresses are what `listen` does and are not
// recorded; a lookup of a name would be.
'use strict'
const fs = require('node:fs')
const net = require('node:net')
const tls = require('node:tls')
const http = require('node:http')
const https = require('node:https')
const dns = require('node:dns')

const logPath = process.env.OUTBOUND_LOG
function record(what) {
  fs.appendFileSync(logPath, what + '\n')
  return new Error(`outbound attempt: ${what}`)
}

const socketConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function patchedConnect(...args) {
  const target =
    typeof args[0] === 'object'
      ? JSON.stringify({ host: args[0].host, port: args[0].port, path: args[0].path })
      : String(args[0])
  throw record(`net.Socket.connect ${target}`)
}
void socketConnect
for (const [mod, name] of [
  [net, 'connect'],
  [net, 'createConnection'],
  [tls, 'connect'],
  [http, 'request'],
  [http, 'get'],
  [https, 'request'],
  [https, 'get'],
]) {
  mod[name] = () => {
    throw record(
      `${mod === net ? 'net' : mod === tls ? 'tls' : mod === http ? 'http' : 'https'}.${name}`,
    )
  }
}
globalThis.fetch = () => {
  throw record('fetch')
}
const lookup = dns.lookup
dns.lookup = function patchedLookup(hostname, ...rest) {
  if (!net.isIP(hostname) && hostname !== 'localhost')
    fs.appendFileSync(logPath, `dns.lookup ${hostname}\n`)
  return lookup.call(this, hostname, ...rest)
}
for (const name of ['resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveTxt', 'resolveSrv']) {
  dns[name] = () => {
    throw record(`dns.${name}`)
  }
}
