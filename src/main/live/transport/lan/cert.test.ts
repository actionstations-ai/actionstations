import { createServer } from 'node:https'
import { request } from 'node:https'
import type { TLSSocket } from 'node:tls'
import { describe, expect, it } from 'vitest'
import { createSessionCertificate, formatFingerprint, parseCertificate } from './cert'

const SESSION = 'c2Vzc2lvbi1pZC0wMDAwMDA'

describe('per-session certificate (spec 0407 FR-4)', () => {
  it('is ECDSA P-256 with the address as its only subject alternative name', async () => {
    const cert = await createSessionCertificate('127.0.0.1', SESSION)
    const parsed = parseCertificate(cert.cert)
    expect(parsed.subject).toBe(`CN=Action Stations session ${SESSION.slice(0, 8)}`)
    expect(parsed.publicKey.algorithm).toMatchObject({ name: 'ECDSA', namedCurve: 'P-256' })
    const san = parsed.extensions.find((e) => e.type === '2.5.29.17')
    expect(san).toBeDefined()
    expect(
      JSON.stringify((san as unknown as { names: { toJSON(): unknown } }).names.toJSON()),
    ).toBe(JSON.stringify([{ type: 'ip', value: '127.0.0.1' }]))
    expect(cert.key).toMatch(/^-----BEGIN PRIVATE KEY-----/)
  })

  it('is valid from five minutes ago for seven days', async () => {
    const now = new Date('2026-10-28T10:00:00Z')
    const cert = await createSessionCertificate('192.168.4.20', SESSION, now)
    const parsed = parseCertificate(cert.cert)
    expect(parsed.notBefore.toISOString()).toBe('2026-10-28T09:55:00.000Z')
    expect(parsed.notAfter.toISOString()).toBe('2026-11-04T10:00:00.000Z')
  })

  it('reports the SHA-256 fingerprint in the grouped form the phone shows', async () => {
    const cert = await createSessionCertificate('127.0.0.1', SESSION)
    expect(cert.fingerprintSha256).toMatch(/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/)
    expect(formatFingerprint(new Uint8Array([0, 171, 255]))).toBe('00:AB:FF')
  })

  it('is accepted by a client that pins the fingerprint and makes a new key per session', async () => {
    const cert = await createSessionCertificate('127.0.0.1', SESSION)
    const other = await createSessionCertificate('127.0.0.1', SESSION)
    expect(other.fingerprintSha256).not.toBe(cert.fingerprintSha256)
    const server = createServer({ cert: cert.cert, key: cert.key }, (_req, res) => res.end('ok'))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    const seen = await new Promise<string>((resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port, path: '/', rejectUnauthorized: false },
        (res) => {
          const peer = (res.socket as TLSSocket).getPeerCertificate()
          res.resume()
          res.on('end', () => resolve(peer.fingerprint256))
        },
      )
      req.on('error', reject)
      req.end()
    })
    server.close()
    expect(seen).toBe(cert.fingerprintSha256)
  })
})
