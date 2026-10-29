/**
 * The only cryptographic interface the protocol uses. Two implementations: WebCrypto
 * (`webcrypto.ts`, every supported browser and Node 22) and a pure-JavaScript fallback on the
 * noble libraries (`noble.ts`) for the player page in a non-secure context.
 */

/** An opaque private key: a `CryptoKey` for WebCrypto, raw bytes for noble. */
export type PrivateKey = { readonly __brand: 'LivePrivateKey' }

/** JWK form of an EC P-256 private key, the portable form both providers import and export. */
export interface EcPrivateJwk {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
  d: string
}

export interface KeyPair {
  /** Uncompressed point, 65 bytes (0x04 || x || y). */
  publicKey: Uint8Array
  privateKey: PrivateKey
}

export interface CryptoProvider {
  readonly name: 'webcrypto' | 'noble'
  random(bytes: number): Uint8Array
  sha256(data: Uint8Array): Promise<Uint8Array>
  /** HKDF-SHA-256; a string `info` is UTF-8 encoded. Salt defaults to empty. */
  hkdf(
    ikm: Uint8Array,
    info: string | Uint8Array,
    length: number,
    salt?: Uint8Array,
  ): Promise<Uint8Array>
  aesGcmSeal(
    key: Uint8Array,
    nonce: Uint8Array,
    aad: Uint8Array,
    plaintext: Uint8Array,
  ): Promise<Uint8Array>
  /** Throws when the tag does not verify. */
  aesGcmOpen(
    key: Uint8Array,
    nonce: Uint8Array,
    aad: Uint8Array,
    sealed: Uint8Array,
  ): Promise<Uint8Array>
  ecdsaGenerate(): Promise<KeyPair>
  /** Raw r||s, 64 bytes, over SHA-256 of `data`. */
  ecdsaSign(privateKey: PrivateKey, data: Uint8Array): Promise<Uint8Array>
  ecdsaVerify(publicKey: Uint8Array, data: Uint8Array, sig: Uint8Array): Promise<boolean>
  ecdsaExport(privateKey: PrivateKey): Promise<EcPrivateJwk>
  ecdsaImport(jwk: EcPrivateJwk): Promise<KeyPair>
  ecdhGenerate(): Promise<KeyPair>
  /** The shared x coordinate, 32 bytes. Feed it to `hkdf`, never use it directly. */
  ecdhDerive(privateKey: PrivateKey, peerPublic: Uint8Array): Promise<Uint8Array>
  ecdhExport(privateKey: PrivateKey): Promise<EcPrivateJwk>
  ecdhImport(jwk: EcPrivateJwk): Promise<KeyPair>
}
