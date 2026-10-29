import { X509Certificate } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fingerprintOf, generateSelfSigned, loadPem, selfSignedFor } from '../src/tls'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('tls', () => {
  it('generates an ECDSA P-256 self-signed certificate with the hosts as SANs', async () => {
    const material = await generateSelfSigned(['ttx.internal', '10.20.0.5'], Date.UTC(2026, 9, 29))
    const cert = new X509Certificate(material.cert)
    expect(cert.subject).toBe('CN=ttx.internal')
    expect(cert.issuer).toBe('CN=ttx.internal')
    expect(cert.subjectAltName).toContain('DNS:ttx.internal')
    expect(cert.subjectAltName).toContain('IP Address:10.20.0.5')
    expect(cert.publicKey.asymmetricKeyType).toBe('ec')
    expect(new Date(cert.validTo).getUTCFullYear()).toBe(2036)
    expect(material.fingerprintSha256).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)
    expect(material.fingerprintSha256).toBe(cert.fingerprint256)
    expect(material.key).toContain('BEGIN PRIVATE KEY')
    expect(material.selfSigned).toBe(true)
  })

  it('persists the certificate on first start and reuses it, so the fingerprint is stable across restarts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'relay-tls-'))
    dirs.push(dir)
    const first = await selfSignedFor(dir, ['localhost'])
    expect(existsSync(join(dir, 'tls', 'cert.pem'))).toBe(true)
    expect(existsSync(join(dir, 'tls', 'key.pem'))).toBe(true)
    const second = await selfSignedFor(dir, ['other.name'])
    expect(second.fingerprintSha256).toBe(first.fingerprintSha256)
    const loaded = loadPem(join(dir, 'tls', 'cert.pem'), join(dir, 'tls', 'key.pem'))
    expect(loaded.selfSigned).toBe(false)
    expect(fingerprintOf(loaded.cert)).toBe(first.fingerprintSha256)
  })
})
