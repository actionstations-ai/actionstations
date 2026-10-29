import { describe, expect, it } from 'vitest'
import { BlobAssembler, BlobError, assertBlobSize, chunkBlob, openBlob, sealBlob } from './blob'
import { bytesEqual, toBase64Url } from './bytes'
import { createWebCryptoProvider } from './crypto/webcrypto'
import { keysFromInvite, makeController } from './fixtures/setup'
import { LIMITS } from './protocol'
import { BlobRef } from './schemas'

const crypto = createWebCryptoProvider()
const meta = { kind: 'image' as const, mime: 'image/png', name: 'device', width: 1200, height: 630 }

describe('blobs', () => {
  it('seals, chunks, reassembles out of order and opens with the sha256 verified', async () => {
    const ctl = await makeController(crypto)
    const player = await keysFromInvite(ctl, 'players')
    const plaintext = crypto.random(5000)
    const { ref, sealed } = await sealBlob(crypto, ctl.keys, meta, plaintext, {
      limits: LIMITS.relay,
      uploader: 'controller',
    })
    expect(BlobRef.safeParse(ref).success).toBe(true)
    expect(ref.bytes).toBe(5000)
    expect(ref.k).toBe('s1')
    expect(sealed.length).toBe(5016)

    const chunks = chunkBlob(ref.blobId, sealed, 1024)
    expect(chunks.length).toBe(5)
    const assembler = new BlobAssembler(ref.blobId, BlobAssembler.sealedSize(ref), 1024)
    for (const chunk of [chunks[3]!, chunks[0]!, chunks[4]!, chunks[1]!, chunks[2]!, chunks[2]!])
      assembler.add(chunk)
    expect(assembler.complete).toBe(true)
    expect(bytesEqual(assembler.bytes(), sealed)).toBe(true)
    expect(bytesEqual(await openBlob(crypto, player, ref, assembler.bytes()), plaintext)).toBe(true)
  })

  it('fails on a missing chunk, a chunk of another blob and an index out of range', async () => {
    const ctl = await makeController(crypto)
    const { ref, sealed } = await sealBlob(crypto, ctl.keys, meta, crypto.random(3000), {
      limits: LIMITS.lan,
      uploader: 'controller',
    })
    const chunks = chunkBlob(ref.blobId, sealed, 1000)
    const assembler = new BlobAssembler(ref.blobId, BlobAssembler.sealedSize(ref), 1000)
    assembler.add(chunks[0]!)
    assembler.add(chunks[2]!)
    expect(assembler.complete).toBe(false)
    expect(() => assembler.bytes()).toThrow(BlobError)
    expect(() => assembler.add({ ...chunks[1]!, blobId: 'AAAAAAAAAAAAAAAAAAAAAA' })).toThrow(
      /another blob/,
    )
    expect(() => assembler.add({ ...chunks[1]!, index: 9 })).toThrow(/out of range/)
    expect(() => assembler.add({ ...chunks[1]!, count: 2 })).toThrow(/count changed/)
  })

  it('bounds what it buffers by the announced size: too many chunks, too many bytes, conflicting duplicates', async () => {
    const ctl = await makeController(crypto)
    const { ref, sealed } = await sealBlob(crypto, ctl.keys, meta, crypto.random(2000), {
      limits: LIMITS.lan,
      uploader: 'controller',
    })
    const chunks = chunkBlob(ref.blobId, sealed, 1000) // 3 chunks for 2016 sealed bytes
    const fresh = () => new BlobAssembler(ref.blobId, BlobAssembler.sealedSize(ref), 1000)
    expect(fresh().maxCount).toBe(3)
    expect(() => fresh().add({ ...chunks[0]!, count: 4 })).toThrow(/More chunks/)
    const a = fresh()
    a.add(chunks[0]!)
    expect(() => a.add({ ...chunks[1]!, bytes: toBase64Url(new Uint8Array(1017)) })).toThrow(
      /More bytes/,
    )
    const b = fresh()
    b.add(chunks[0]!)
    expect(() => b.add({ ...chunks[0]!, bytes: toBase64Url(new Uint8Array(1000)) })).toThrow(
      /Conflicting/,
    )
    expect(b.add(chunks[0]!)).toBe(false) // an identical duplicate is fine
    // A short last chunk (fewer bytes than announced) is caught when assembling.
    const c = fresh()
    c.add(chunks[0]!)
    c.add(chunks[1]!)
    c.add({ ...chunks[2]!, bytes: toBase64Url(new Uint8Array(5)) })
    expect(() => c.bytes()).toThrow(/differs/)
    expect(() => new BlobAssembler(ref.blobId, 15, 1000)).toThrow(/bounds/)
  })

  it('refuses a tampered blob and a reference with the wrong hash', async () => {
    const ctl = await makeController(crypto)
    const { ref, sealed } = await sealBlob(crypto, ctl.keys, meta, crypto.random(100), {
      limits: LIMITS.lan,
      uploader: 'controller',
    })
    const flipped = sealed.slice()
    flipped[5]! ^= 1
    await expect(openBlob(crypto, ctl.keys, ref, flipped)).rejects.toMatchObject({
      code: 'BAD_TAG',
    })
    await expect(
      openBlob(crypto, ctl.keys, { ...ref, sha256: 'b'.repeat(64) }, sealed),
    ).rejects.toMatchObject({ code: 'SHA_MISMATCH' })
    await expect(
      openBlob(crypto, ctl.keys, { ...ref, blobId: 'AAAAAAAAAAAAAAAAAAAAAA' }, sealed),
    ).rejects.toMatchObject({ code: 'BAD_TAG' })
  })

  it('refuses a blob over the connection cap before any work, per uploader', async () => {
    expect(() => assertBlobSize(LIMITS.relay, 'controller', 8 * 1024 * 1024)).not.toThrow()
    expect(() => assertBlobSize(LIMITS.relay, 'controller', 8 * 1024 * 1024 + 1)).toThrow(BlobError)
    expect(() => assertBlobSize(LIMITS.relay, 'player', 1024 * 1024 + 1)).toThrow(/cap/)
    expect(() => assertBlobSize(LIMITS.lan, 'player', 2 * 1024 * 1024)).not.toThrow()
    expect(() => assertBlobSize(LIMITS['self-hosted'], 'player', 4 * 1024 * 1024 + 1)).toThrow(
      BlobError,
    )
    const ctl = await makeController(crypto)
    await expect(
      sealBlob(crypto, ctl.keys, meta, new Uint8Array(LIMITS.relay.playerBlobBytes + 1), {
        limits: LIMITS.relay,
        uploader: 'player',
      }),
    ).rejects.toMatchObject({ code: 'BLOB_TOO_LARGE' })
  })

  it('a staff-sealed blob opens for staff and not for a player', async () => {
    const ctl = await makeController(crypto)
    const player = await keysFromInvite(ctl, 'players')
    const staff = await keysFromInvite(ctl, 'staff')
    const data = crypto.random(64)
    const { ref, sealed } = await sealBlob(
      crypto,
      ctl.keys,
      { ...meta, kind: 'pdf', mime: 'application/pdf' },
      data,
      {
        limits: LIMITS.lan,
        uploader: 'controller',
        key: 'staff',
      },
    )
    expect(ref.k).toBe('t1')
    expect(bytesEqual(await openBlob(crypto, staff, ref, sealed), data)).toBe(true)
    await expect(openBlob(crypto, player, ref, sealed)).rejects.toMatchObject({
      code: 'STAFF_ONLY',
    })
    await expect(
      sealBlob(crypto, player, meta, data, {
        limits: LIMITS.lan,
        uploader: 'player',
        key: 'staff',
      }),
    ).rejects.toThrow(/no staff key/)
  })

  it('a blob sealed under an epoch the holder lacks is UNKNOWN_EPOCH', async () => {
    const ctl = await makeController(crypto)
    const player = await keysFromInvite(ctl, 'players')
    await ctl.keys.addEpoch(2, 'staff', crypto.random(32))
    const { ref, sealed } = await sealBlob(crypto, ctl.keys, meta, crypto.random(10), {
      limits: LIMITS.lan,
      uploader: 'controller',
    })
    expect(ref.k).toBe('s2')
    await expect(openBlob(crypto, player, ref, sealed)).rejects.toMatchObject({
      code: 'UNKNOWN_EPOCH',
    })
  })

  it('chunks an empty sealed buffer into one chunk and refuses a zero chunk size', () => {
    expect(chunkBlob('AAAAAAAAAAAAAAAAAAAAAA', new Uint8Array(0), 10)).toEqual([
      { blobId: 'AAAAAAAAAAAAAAAAAAAAAA', index: 0, count: 1, bytes: '' },
    ])
    expect(() => chunkBlob('AAAAAAAAAAAAAAAAAAAAAA', new Uint8Array(1), 0)).toThrow()
    expect(toBase64Url(new Uint8Array([1, 2, 3]))).toBe('AQID')
  })
})
