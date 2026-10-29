/**
 * A self-signed certificate for one LAN session (spec 0407 FR-4): ECDSA P-256, subject
 * alternative name = the bound IP address, valid from five minutes ago for seven days. The
 * private key exists in memory and in the TLS context only; a new one is made per session and
 * per address switch. The fingerprint is what the facilitator reads out beside the QR code so a
 * player can compare it with the phone's warning page.
 */
import { webcrypto } from 'node:crypto'
import * as x509 from '@peculiar/x509'

export interface SessionCertificate {
  /** PEM certificate, for `https.createServer`. */
  cert: string
  /** PEM PKCS#8 private key, for `https.createServer`. Never written anywhere. */
  key: string
  /** `A1:B2:…` SHA-256 of the DER certificate. */
  fingerprintSha256: string
  address: string
  notBefore: Date
  notAfter: Date
}

const ALG = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const
const VALID_DAYS = 7
const BACKDATE_MS = 5 * 60_000

x509.cryptoProvider.set(webcrypto as unknown as Parameters<typeof x509.cryptoProvider.set>[0])

export function formatFingerprint(der: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(der)]
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':')
}

function pem(label: string, der: ArrayBuffer): string {
  const b64 = Buffer.from(der).toString('base64')
  const lines = b64.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

export async function createSessionCertificate(
  address: string,
  sessionId: string,
  now = new Date(),
): Promise<SessionCertificate> {
  const subtle = webcrypto.subtle
  const keys = await subtle.generateKey(ALG, true, ['sign', 'verify'])
  const notBefore = new Date(now.getTime() - BACKDATE_MS)
  const notAfter = new Date(now.getTime() + VALID_DAYS * 24 * 3600_000)
  const certificate = await x509.X509CertificateGenerator.createSelfSigned({
    name: `CN=Action Stations session ${sessionId.slice(0, 8)}`,
    notBefore,
    notAfter,
    signingAlgorithm: ALG,
    keys,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth], false),
      new x509.SubjectAlternativeNameExtension([{ type: 'ip', value: address }], false),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  })
  const pkcs8 = await subtle.exportKey('pkcs8', keys.privateKey)
  return {
    cert: certificate.toString('pem'),
    key: pem('PRIVATE KEY', pkcs8),
    fingerprintSha256: formatFingerprint(await certificate.getThumbprint('SHA-256')),
    address,
    notBefore,
    notAfter,
  }
}

/** Parse a PEM certificate back (tests, and the fingerprint of a presented certificate). */
export function parseCertificate(pemText: string): x509.X509Certificate {
  return new x509.X509Certificate(pemText)
}
