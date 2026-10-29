// Organization keys for regional exercises (spec 0440 FR-2). Pure Node crypto, no Electron:
// the key store (identity.ts) decides where the private halves live.
//
//   bundle key  Ed25519, signs .asexercise bundles; public half is base64 SPKI DER
//   live key    P-256 (ECDSA), the organization's controller key in a joint live session;
//               public half is the 65-byte uncompressed point, base64url (the roster format)
import {
  createPrivateKey,
  createPublicKey,
  createHash,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto'

export interface OrgKeyPair {
  /** base64 PKCS#8 DER. */
  privateKey: string
  /** base64 SPKI DER. */
  publicKey: string
}

export function generateBundleKeys(): OrgKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  }
}

/** A P-256 key pair: PKCS#8 private (base64) and the roster-format public key (base64url). */
export function generateLiveKeys(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = publicKey.export({ format: 'jwk' })
  const point = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x!, 'base64url'),
    Buffer.from(jwk.y!, 'base64url'),
  ])
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
    publicKey: point.toString('base64url'),
  }
}

export function signBytes(privateKeyB64: string, data: Buffer): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  })
  return sign(null, data, key).toString('base64')
}

/** Never throws: a malformed key or signature is simply not valid. */
export function verifyBytes(publicKeyB64: string, data: Buffer, signatureB64: string): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      format: 'der',
      type: 'spki',
    })
    if (key.asymmetricKeyType !== 'ed25519') return false
    return verify(null, data, key, Buffer.from(signatureB64, 'base64'))
  } catch {
    return false
  }
}

/** sha256 of the SPKI DER, first 16 bytes, as 8 groups of 4 lowercase hex characters. */
export function fingerprintOf(publicKeyB64: string): string {
  const hex = createHash('sha256')
    .update(Buffer.from(publicKeyB64, 'base64'))
    .digest('hex')
    .slice(0, 32)
  return hex.match(/.{4}/g)!.join(' ')
}

/** Spaces, case and separators do not matter when a person types or reads a fingerprint. */
export const normalizeFingerprint = (text: string): string =>
  text.toLowerCase().replace(/[^0-9a-f]/g, '')

export const sameFingerprint = (a: string, b: string): boolean => {
  const na = normalizeFingerprint(a)
  return na.length === 32 && na === normalizeFingerprint(b)
}
