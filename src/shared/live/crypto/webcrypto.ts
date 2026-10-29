import { fromBase64Url, utf8 } from '../bytes'
import type { CryptoProvider, EcPrivateJwk, PrivateKey } from './provider'

/**
 * The slice of WebCrypto this provider uses, typed structurally so the file compiles with
 * either the DOM or the Node type library (`src/shared` is built under both).
 */
interface KeyLike {
  readonly type: string
}
interface JwkLike {
  kty?: string
  crv?: string
  x?: string
  y?: string
  d?: string
  ext?: boolean
}
interface SubtleLike {
  digest(algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer>
  importKey(
    format: 'raw',
    keyData: ArrayBuffer,
    algorithm: unknown,
    extractable: boolean,
    usages: string[],
  ): Promise<KeyLike>
  importKey(
    format: 'jwk',
    keyData: JwkLike,
    algorithm: unknown,
    extractable: boolean,
    usages: string[],
  ): Promise<KeyLike>
  exportKey(format: 'raw', key: KeyLike): Promise<ArrayBuffer>
  exportKey(format: 'jwk', key: KeyLike): Promise<JwkLike>
  generateKey(
    algorithm: unknown,
    extractable: boolean,
    usages: string[],
  ): Promise<{ publicKey: KeyLike; privateKey: KeyLike }>
  deriveBits(algorithm: unknown, baseKey: KeyLike, length: number): Promise<ArrayBuffer>
  encrypt(algorithm: unknown, key: KeyLike, data: ArrayBuffer): Promise<ArrayBuffer>
  decrypt(algorithm: unknown, key: KeyLike, data: ArrayBuffer): Promise<ArrayBuffer>
  sign(algorithm: unknown, key: KeyLike, data: ArrayBuffer): Promise<ArrayBuffer>
  verify(
    algorithm: unknown,
    key: KeyLike,
    signature: ArrayBuffer,
    data: ArrayBuffer,
  ): Promise<boolean>
}
export interface CryptoLike {
  subtle?: SubtleLike
  getRandomValues<T extends ArrayBufferView>(array: T): T
}

/** `getRandomValues` fills at most 65536 bytes per call. */
export function fillRandom(crypto: CryptoLike, n: number): Uint8Array {
  const out = new Uint8Array(n)
  for (let o = 0; o < n; o += 65536) crypto.getRandomValues(out.subarray(o, Math.min(n, o + 65536)))
  return out
}

/** Copies a view into a standalone ArrayBuffer, which WebCrypto's typings demand. */
function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer
}

function asKey(key: KeyLike): PrivateKey {
  return key as unknown as PrivateKey
}

function asKeyLike(key: PrivateKey): KeyLike {
  return key as unknown as KeyLike
}

const P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const

async function exportPrivate(subtle: SubtleLike, key: PrivateKey): Promise<EcPrivateJwk> {
  const jwk = await subtle.exportKey('jwk', asKeyLike(key))
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y || !jwk.d) {
    throw new Error('Not a P-256 private key')
  }
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }
}

function publicFromJwk(jwk: EcPrivateJwk): Uint8Array {
  const out = new Uint8Array(65)
  out[0] = 0x04
  out.set(fromBase64Url(jwk.x), 1)
  out.set(fromBase64Url(jwk.y), 33)
  return out
}

/** Builds the provider on a WebCrypto object; the default is the global one. */
export function createWebCryptoProvider(
  crypto: CryptoLike = globalThis.crypto as unknown as CryptoLike,
): CryptoProvider {
  const subtle = crypto.subtle
  if (!subtle) throw new Error('WebCrypto is not available in this context')

  const importAes = (key: Uint8Array) =>
    subtle.importKey('raw', buf(key), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  const gcmParams = (nonce: Uint8Array, aad: Uint8Array) => ({
    name: 'AES-GCM',
    iv: buf(nonce),
    additionalData: buf(aad),
  })

  return {
    name: 'webcrypto',
    random: (n) => fillRandom(crypto, n),
    sha256: async (data) => new Uint8Array(await subtle.digest('SHA-256', buf(data))),
    hkdf: async (ikm, info, length, salt = new Uint8Array(0)) => {
      const key = await subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits'])
      const bits = await subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: buf(salt),
          info: buf(typeof info === 'string' ? utf8(info) : info),
        },
        key,
        length * 8,
      )
      return new Uint8Array(bits)
    },
    aesGcmSeal: async (key, nonce, aad, plaintext) =>
      new Uint8Array(
        await subtle.encrypt(gcmParams(nonce, aad), await importAes(key), buf(plaintext)),
      ),
    aesGcmOpen: async (key, nonce, aad, sealed) => {
      const k = await importAes(key)
      try {
        return new Uint8Array(await subtle.decrypt(gcmParams(nonce, aad), k, buf(sealed)))
      } catch {
        throw new Error('AES-GCM tag mismatch')
      }
    },
    ecdsaGenerate: async () => {
      const pair = await subtle.generateKey(P256, true, ['sign', 'verify'])
      const publicKey = new Uint8Array(await subtle.exportKey('raw', pair.publicKey))
      return { publicKey, privateKey: asKey(pair.privateKey) }
    },
    ecdsaSign: async (privateKey, data) =>
      new Uint8Array(await subtle.sign(SIGN, asKeyLike(privateKey), buf(data))),
    ecdsaVerify: async (publicKey, data, sig) => {
      try {
        const key = await subtle.importKey('raw', buf(publicKey), P256, false, ['verify'])
        return await subtle.verify(SIGN, key, buf(sig), buf(data))
      } catch {
        return false
      }
    },
    ecdsaExport: (privateKey) => exportPrivate(subtle, privateKey),
    ecdsaImport: async (jwk) => {
      const key = await subtle.importKey('jwk', { ...jwk, ext: true }, P256, true, ['sign'])
      return { publicKey: publicFromJwk(jwk), privateKey: asKey(key) }
    },
    ecdhGenerate: async () => {
      const pair = await subtle.generateKey(ECDH, true, ['deriveBits'])
      const publicKey = new Uint8Array(await subtle.exportKey('raw', pair.publicKey))
      return { publicKey, privateKey: asKey(pair.privateKey) }
    },
    ecdhDerive: async (privateKey, peerPublic) => {
      const peer = await subtle.importKey('raw', buf(peerPublic), ECDH, false, [])
      const bits = await subtle.deriveBits(
        { name: 'ECDH', public: peer },
        asKeyLike(privateKey),
        256,
      )
      return new Uint8Array(bits)
    },
    ecdhExport: (privateKey) => exportPrivate(subtle, privateKey),
    ecdhImport: async (jwk) => {
      const key = await subtle.importKey('jwk', { ...jwk, ext: true }, ECDH, true, ['deriveBits'])
      return { publicKey: publicFromJwk(jwk), privateKey: asKey(key) }
    },
  }
}
