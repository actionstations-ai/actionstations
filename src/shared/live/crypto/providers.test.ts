import { describe, expect, it } from 'vitest'
import { bytesEqual, fromBase64Url, fromHex, toHex, utf8 } from '../bytes'
import { createNobleProvider } from './noble'
import type { CryptoProvider, EcPrivateJwk } from './provider'
import { hasSubtle, resetCryptoProviderSelection, selectCryptoProvider } from './select'
import vectors from './__fixtures__/vectors.json'
import { createWebCryptoProvider } from './webcrypto'

const providers: Record<string, () => Promise<CryptoProvider>> = {
  webcrypto: async () => createWebCryptoProvider(),
  noble: () => createNobleProvider(),
}

describe.each(Object.entries(providers))('%s provider', (_name, make) => {
  it('reproduces the SHA-256 vectors', async () => {
    const p = await make()
    for (const v of vectors.sha256) {
      expect(toHex(await p.sha256(fromHex(v.data))), v.name).toBe(v.digest)
    }
  })

  it('reproduces the HKDF-SHA-256 vectors (RFC 5869 and the protocol label)', async () => {
    const p = await make()
    for (const v of vectors.hkdf) {
      const okm = await p.hkdf(fromHex(v.ikm), fromHex(v.info), v.length, fromHex(v.salt))
      expect(toHex(okm), v.name).toBe(v.okm)
    }
    // A string label is its UTF-8 bytes.
    const v = vectors.hkdf[1]!
    const label = new TextDecoder().decode(fromHex(v.info))
    expect(toHex(await p.hkdf(fromHex(v.ikm), label, v.length))).toBe(v.okm)
  })

  it('reproduces the AES-256-GCM vectors (NIST cases 13, 14, 16) both ways', async () => {
    const p = await make()
    for (const v of vectors.aesGcm) {
      const sealed = await p.aesGcmSeal(
        fromHex(v.aesKey),
        fromHex(v.nonce),
        fromHex(v.aad),
        fromHex(v.plaintext),
      )
      expect(toHex(sealed), v.name).toBe(v.sealed)
      const opened = await p.aesGcmOpen(
        fromHex(v.aesKey),
        fromHex(v.nonce),
        fromHex(v.aad),
        fromHex(v.sealed),
      )
      expect(toHex(opened), v.name).toBe(v.plaintext)
    }
  })

  it('refuses a sealed message whose AAD changed', async () => {
    const p = await make()
    const v = vectors.aesGcm[3]!
    await expect(
      p.aesGcmOpen(
        fromHex(v.aesKey),
        fromHex(v.nonce),
        utf8('[1,"abc",3,"x","all","join",1]'),
        fromHex(v.sealed),
      ),
    ).rejects.toThrow(/tag/)
  })

  it('verifies the recorded ECDSA signature and refuses it over another message', async () => {
    const p = await make()
    const v = vectors.ecdsa[0]!
    expect(
      await p.ecdsaVerify(fromHex(v.publicKey), fromHex(v.message), fromHex(v.signature)),
    ).toBe(true)
    expect(await p.ecdsaVerify(fromHex(v.publicKey), utf8('other'), fromHex(v.signature))).toBe(
      false,
    )
    const flipped = fromHex(v.signature)
    flipped[10]! ^= 1
    expect(await p.ecdsaVerify(fromHex(v.publicKey), fromHex(v.message), flipped)).toBe(false)
  })

  it('imports the recorded private key and signs something the recorded public key verifies', async () => {
    const p = await make()
    const v = vectors.ecdsa[0]!
    const pair = await p.ecdsaImport(v.jwk as EcPrivateJwk)
    expect(toHex(pair.publicKey)).toBe(v.publicKey)
    const sig = await p.ecdsaSign(pair.privateKey, utf8('hello'))
    expect(sig.length).toBe(64)
    expect(await p.ecdsaVerify(fromHex(v.publicKey), utf8('hello'), sig)).toBe(true)
  })

  it('derives the recorded ECDH shared secret from either side', async () => {
    const p = await make()
    const v = vectors.ecdh[0]!
    const a = await p.ecdhImport(v.a as EcPrivateJwk)
    const b = await p.ecdhImport(v.b as EcPrivateJwk)
    expect(toHex(await p.ecdhDerive(a.privateKey, fromHex(v.bPublic)))).toBe(v.shared)
    expect(toHex(await p.ecdhDerive(b.privateKey, fromHex(v.aPublic)))).toBe(v.shared)
  })

  it('round-trips a generated key through JWK', async () => {
    const p = await make()
    const pair = await p.ecdsaGenerate()
    const jwk = await p.ecdsaExport(pair.privateKey)
    expect(jwk.crv).toBe('P-256')
    const again = await p.ecdsaImport(jwk)
    expect(bytesEqual(again.publicKey, pair.publicKey)).toBe(true)
    expect(fromBase64Url(jwk.d).length).toBe(32)
  })

  it('produces random bytes of the asked length that differ between calls', async () => {
    const p = await make()
    const a = p.random(32)
    const b = p.random(32)
    expect(a.length).toBe(32)
    expect(bytesEqual(a, b)).toBe(false)
  })
})

describe('cross-provider interoperability', () => {
  it('opens what the other sealed, verifies what the other signed, agrees on ECDH', async () => {
    const web = createWebCryptoProvider()
    const noble = await createNobleProvider()
    const key = web.random(32)
    const nonce = web.random(12)
    const aad = utf8('header')
    const text = utf8('{"secret":"content"}')
    expect(
      toHex(await noble.aesGcmOpen(key, nonce, aad, await web.aesGcmSeal(key, nonce, aad, text))),
    ).toBe(toHex(text))
    expect(
      toHex(await web.aesGcmOpen(key, nonce, aad, await noble.aesGcmSeal(key, nonce, aad, text))),
    ).toBe(toHex(text))

    const webSigner = await web.ecdsaGenerate()
    const nobleSigner = await noble.ecdsaGenerate()
    for (let i = 0; i < 8; i++) {
      // Several rounds: WebCrypto may produce high-S signatures, which noble must still accept.
      const msg = web.random(40)
      expect(
        await noble.ecdsaVerify(
          webSigner.publicKey,
          msg,
          await web.ecdsaSign(webSigner.privateKey, msg),
        ),
      ).toBe(true)
      expect(
        await web.ecdsaVerify(
          nobleSigner.publicKey,
          msg,
          await noble.ecdsaSign(nobleSigner.privateKey, msg),
        ),
      ).toBe(true)
    }

    const a = await web.ecdhGenerate()
    const b = await noble.ecdhGenerate()
    const ab = await web.ecdhDerive(a.privateKey, b.publicKey)
    const ba = await noble.ecdhDerive(b.privateKey, a.publicKey)
    expect(toHex(ab)).toBe(toHex(ba))

    const ikm = web.random(32)
    expect(toHex(await web.hkdf(ikm, 'label', 32))).toBe(toHex(await noble.hkdf(ikm, 'label', 32)))
  })

  it('a key exported by one provider imports into the other', async () => {
    const web = createWebCryptoProvider()
    const noble = await createNobleProvider()
    const pair = await web.ecdsaGenerate()
    const imported = await noble.ecdsaImport(await web.ecdsaExport(pair.privateKey))
    expect(toHex(imported.publicKey)).toBe(toHex(pair.publicKey))
    const back = await web.ecdhImport(
      await noble.ecdhExport((await noble.ecdhGenerate()).privateKey),
    )
    expect(back.publicKey.length).toBe(65)
  })
})

describe('provider selection', () => {
  it('picks WebCrypto where subtle exists and caches the choice', async () => {
    resetCryptoProviderSelection()
    expect(hasSubtle()).toBe(true)
    const a = await selectCryptoProvider()
    const b = await selectCryptoProvider()
    expect(a.name).toBe('webcrypto')
    expect(a).toBe(b)
    resetCryptoProviderSelection()
  })

  it('throws plainly when asked to build WebCrypto without subtle', () => {
    expect(() => createWebCryptoProvider({ getRandomValues: (x) => x })).toThrow(/not available/)
  })
})
