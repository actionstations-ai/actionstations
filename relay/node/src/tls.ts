/**
 * TLS material (spec 0409 FR-4): the organization's PEM certificate and key, or a self-signed
 * ECDSA P-256 certificate generated on first start, kept in `<data-dir>/tls/` and identified to
 * the app by its SHA-256 fingerprint, which the app pins (#410).
 */
import { X509Certificate, webcrypto } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { join } from 'node:path'
// @peculiar/x509 uses tsyringe, which needs this polyfill loaded first.
import 'reflect-metadata'
import * as x509 from '@peculiar/x509'

export interface TlsMaterial {
  cert: string
  key: string
  /** `AA:BB:…` SHA-256 of the DER certificate, as browsers and the app show it. */
  fingerprintSha256: string
  selfSigned: boolean
}

export function fingerprintOf(certPem: string): string {
  return new X509Certificate(certPem).fingerprint256
}

export function loadPem(certPath: string, keyPath: string): TlsMaterial {
  const cert = readFileSync(certPath, 'utf8')
  const key = readFileSync(keyPath, 'utf8')
  return { cert, key, fingerprintSha256: fingerprintOf(cert), selfSigned: false }
}

const TEN_YEARS_MS = 10 * 365 * 24 * 3600 * 1000

/** A fresh self-signed certificate for `hosts` (names as DNS SANs, addresses as IP SANs). */
export async function generateSelfSigned(
  hosts: readonly string[],
  now = Date.now(),
): Promise<TlsMaterial> {
  x509.cryptoProvider.set(webcrypto as unknown as Parameters<typeof x509.cryptoProvider.set>[0])
  const alg = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' }
  const keys = await webcrypto.subtle.generateKey(alg, true, ['sign', 'verify'])
  const names = hosts.length ? hosts : ['localhost']
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: Array.from(webcrypto.getRandomValues(new Uint8Array(12)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join(''),
    name: `CN=${names[0]}`,
    notBefore: new Date(now - 60_000),
    notAfter: new Date(now + TEN_YEARS_MS),
    signingAlgorithm: alg,
    keys,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyAgreement,
        true,
      ),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
      new x509.SubjectAlternativeNameExtension(
        names.map((h) =>
          isIP(h) ? { type: 'ip' as const, value: h } : { type: 'dns' as const, value: h },
        ),
      ),
    ],
  })
  const certPem = cert.toString('pem')
  const keyPem = x509.PemConverter.encode(
    await webcrypto.subtle.exportKey('pkcs8', keys.privateKey),
    'PRIVATE KEY',
  )
  return { cert: certPem, key: keyPem, fingerprintSha256: fingerprintOf(certPem), selfSigned: true }
}

/** The persisted self-signed certificate, generated on the first start and reused after. */
export async function selfSignedFor(
  dataDir: string,
  hosts: readonly string[],
  now = Date.now(),
): Promise<TlsMaterial> {
  const dir = join(dataDir, 'tls')
  const certPath = join(dir, 'cert.pem')
  const keyPath = join(dir, 'key.pem')
  if (existsSync(certPath) && existsSync(keyPath))
    return { ...loadPem(certPath, keyPath), selfSigned: true }
  const material = await generateSelfSigned(hosts, now)
  mkdirSync(dir, { recursive: true })
  writeFileSync(certPath, material.cert)
  writeFileSync(keyPath, material.key, { mode: 0o600 })
  return material
}
