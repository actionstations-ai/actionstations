/**
 * The admin socket (spec 0409 FR-10): a local unix socket (or named pipe on Windows) that answers
 * one JSON status document per connection, for `actionstations-relay status`. Local IPC only; it
 * never listens on a network address.
 */
import { existsSync, unlinkSync } from 'node:fs'
import { createServer, createConnection, type Server } from 'node:net'
import { join } from 'node:path'

export interface AdminStatus {
  version: string
  uptimeSec: number
  urls: string[]
  fingerprintSha256?: string
  sessions: { live: number; ended: number; max: number }
  clients: number
  storage: { databaseBytes: number; envelopes: number; blobBytes: number }
  dataDir: string
}

export function adminSocketPath(dataDir: string, platform = process.platform): string {
  return platform === 'win32' ? '\\\\.\\pipe\\actionstations-relay' : join(dataDir, 'admin.sock')
}

export function startAdmin(path: string, status: () => AdminStatus): Promise<Server> {
  if (process.platform !== 'win32' && existsSync(path)) unlinkSync(path)
  const server = createServer((socket) => {
    socket.end(JSON.stringify(status()) + '\n')
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, () => resolve(server))
  })
}

/** Reads the status from a running server over its local socket. */
export function queryAdmin(path: string, timeoutMs = 3000): Promise<AdminStatus> {
  return new Promise((resolve, reject) => {
    // Local IPC to this machine's own server process, not a network connection.
    // eslint-disable-next-line no-restricted-syntax
    const socket = createConnection(path)
    let data = ''
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('No answer from the server socket'))
    }, timeoutMs)
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => (data += chunk))
    socket.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    socket.on('end', () => {
      clearTimeout(timer)
      try {
        resolve(JSON.parse(data) as AdminStatus)
      } catch {
        reject(new Error('Bad answer from the server socket'))
      }
    })
  })
}
