/**
 * Pure-JavaScript provider for contexts without `crypto.subtle` (the player page over plain
 * HTTP on a trusted LAN). The noble libraries are loaded only when this provider is created,
 * so secure contexts never pay for them.
 */
import { fromBase64Url, toBase64Url, utf8 } from '../bytes'
import type { CryptoProvider, EcPrivateJwk, KeyPair, PrivateKey } from './provider'
import { fillRandom, type CryptoLike } from './webcrypto'

// Type-only: the runtime import happens lazily in loadNoble().
import type { gcm as Gcm } from '@noble/ciphers/aes.js'
import type { p256 as P256 } from '@noble/curves/nist.js'
import type { hkdf as HkdfFn } from '@noble/hashes/hkdf.js'
import type { sha256 as Sha256 } from '@noble/hashes/sha2.js'

type Noble = {
  gcm: typeof Gcm
  p256: typeof P256
  sha256: typeof Sha256
  hkdf: typeof HkdfFn
}

let loading: Promise<Noble> | undefined

function loadNoble(): Promise<Noble> {
  loading ??= Promise.all([
    import('@noble/ciphers/aes.js'),
    import('@noble/curves/nist.js'),
    import('@noble/hashes/sha2.js'),
    import('@noble/hashes/hkdf.js'),
  ]).then(([aes, nist, sha2, kdf]) => ({
    gcm: aes.gcm,
    p256: nist.p256,
    sha256: sha2.sha256,
    hkdf: kdf.hkdf,
  }))
  return loading
}

function asKey(bytes: Uint8Array): PrivateKey {
  return bytes as unknown as PrivateKey
}

function asBytes(key: PrivateKey): Uint8Array {
  return key as unknown as Uint8Array
}

function randomBytes(n: number): Uint8Array {
  // getRandomValues exists in every browser, secure context or not, and in Node 22.
  return fillRandom(globalThis.crypto as unknown as CryptoLike, n)
}

export async function createNobleProvider(): Promise<CryptoProvider> {
  const { gcm, p256, sha256, hkdf } = await loadNoble()

  const keyPair = (secretKey: Uint8Array): KeyPair => ({
    publicKey: p256.getPublicKey(secretKey, false),
    privateKey: asKey(secretKey),
  })
  const exportJwk = (privateKey: PrivateKey): EcPrivateJwk => {
    const secret = asBytes(privateKey)
    const pub = p256.getPublicKey(secret, false)
    return {
      kty: 'EC',
      crv: 'P-256',
      x: toBase64Url(pub.slice(1, 33)),
      y: toBase64Url(pub.slice(33, 65)),
      d: toBase64Url(secret),
    }
  }
  const importJwk = (jwk: EcPrivateJwk): KeyPair => {
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') throw new Error('Not a P-256 private key')
    const pair = keyPair(fromBase64Url(jwk.d))
    const expected = `${toBase64Url(pair.publicKey.slice(1, 33))}.${toBase64Url(pair.publicKey.slice(33))}`
    if (expected !== `${jwk.x}.${jwk.y}`) throw new Error('JWK public point does not match d')
    return pair
  }

  return {
    name: 'noble',
    random: randomBytes,
    sha256: async (data) => sha256(data),
    hkdf: async (ikm, info, length, salt = new Uint8Array(0)) =>
      hkdf(sha256, ikm, salt, typeof info === 'string' ? utf8(info) : info, length),
    aesGcmSeal: async (key, nonce, aad, plaintext) => gcm(key, nonce, aad).encrypt(plaintext),
    aesGcmOpen: async (key, nonce, aad, sealed) => {
      try {
        return gcm(key, nonce, aad).decrypt(sealed)
      } catch {
        throw new Error('AES-GCM tag mismatch')
      }
    },
    ecdsaGenerate: async () => keyPair(p256.utils.randomSecretKey()),
    // WebCrypto signs with hedged k and no low-S rule; both sides accept either form.
    ecdsaSign: async (privateKey, data) =>
      p256.sign(data, asBytes(privateKey), { prehash: true, lowS: false }),
    ecdsaVerify: async (publicKey, data, sig) => {
      try {
        return p256.verify(sig, data, publicKey, { prehash: true, lowS: false, format: 'compact' })
      } catch {
        return false
      }
    },
    ecdsaExport: async (privateKey) => exportJwk(privateKey),
    ecdsaImport: async (jwk) => importJwk(jwk),
    ecdhGenerate: async () => keyPair(p256.utils.randomSecretKey()),
    // getSharedSecret returns the compressed point; its x coordinate is what WebCrypto derives.
    ecdhDerive: async (privateKey, peerPublic) =>
      p256.getSharedSecret(asBytes(privateKey), peerPublic, true).slice(1),
    ecdhExport: async (privateKey) => exportJwk(privateKey),
    ecdhImport: async (jwk) => importJwk(jwk),
  }
}
