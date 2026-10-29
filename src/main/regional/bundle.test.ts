import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { fingerprintOf, generateBundleKeys, generateLiveKeys, sameFingerprint } from './keys'
import { canonicalJson } from './canonical'
import { assertShareable, ShareError } from './allowlist'
import { readBundle } from './read'
import { writeBundle } from './write'
import { EXERCISE_ID, ORGS, frame, inject, slice } from './fixtures/exercise'

const APP = '0.5.1'

function signer() {
  const keys = generateBundleKeys()
  return { keys, from: { ...ORGS.air, fingerprint: fingerprintOf(keys.publicKey) } }
}

async function sliceBundle(
  over: { media?: Map<string, Buffer>; sl?: ReturnType<typeof slice> } = {},
) {
  const s = signer()
  const written = await writeBundle(
    {
      kind: 'slice',
      exerciseId: EXERCISE_ID,
      title: 'Lakefront Regional Tabletop',
      frameVersion: 1,
      appVersion: APP,
      from: s.from,
      slices: new Map([['AIR', over.sl ?? slice('air')]]),
      media: over.media,
    },
    s.keys,
  )
  return { ...s, written }
}

async function rezip(buffer: Buffer, edit: (zip: JSZip) => void | Promise<void>): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer)
  await edit(zip)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

describe('keys and canonical json', () => {
  it('formats a fingerprint as 8 groups of 4 hex characters', () => {
    expect(fingerprintOf(generateBundleKeys().publicKey)).toMatch(/^([0-9a-f]{4} ){7}[0-9a-f]{4}$/)
  })
  it('compares typed fingerprints ignoring spaces and case', () => {
    const fp = fingerprintOf(generateBundleKeys().publicKey)
    expect(sameFingerprint(fp.toUpperCase().replaceAll(' ', ''), fp)).toBe(true)
    expect(sameFingerprint('abcd', fp)).toBe(false)
  })
  it('makes a roster-format live key: 65 bytes, uncompressed point', () => {
    expect(Buffer.from(generateLiveKeys().publicKey, 'base64url')).toHaveLength(65)
  })
  it('canonical json sorts keys and drops whitespace and undefined', () => {
    expect(canonicalJson({ b: [1, { z: 1, a: undefined, c: 'x' }], a: null })).toBe(
      '{"a":null,"b":[1,{"c":"x","z":1}]}',
    )
  })
})

describe('writeBundle and readBundle', () => {
  it('round-trips a slice bundle and names the signer', async () => {
    const { written, keys } = await sliceBundle()
    const read = await readBundle({ buffer: written.buffer }, { appVersion: APP })
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.bundle.signerFingerprint).toBe(fingerprintOf(keys.publicKey))
    expect(read.bundle.slices.get('AIR')?.rows[0]?.id).toBe('AIR-I-01')
    expect(read.bundle.manifest.sliceRevisions).toEqual({ air: 1 })
  })

  it('writes the same bytes for the same content (deterministic zip)', async () => {
    const s = signer()
    const input = {
      kind: 'slice' as const,
      exerciseId: EXERCISE_ID,
      title: 't',
      frameVersion: 1,
      appVersion: APP,
      from: s.from,
      createdAt: '2026-01-01T00:00:00.000Z',
      slices: new Map([['AIR', slice('air')]]),
    }
    const a = await writeBundle(input, s.keys)
    const b = await writeBundle(input, s.keys)
    expect(a.sha256).toBe(b.sha256)
  })

  it('carries media listed by an inject and refuses media nothing uses', async () => {
    const asset = {
      id: 'a1',
      kind: 'image',
      path: 'media/AIR/inj-air-1/a1.png',
      role: 'rendered' as const,
    }
    const sl = slice('air')
    sl.injects[0] = inject('air', 1, { assets: [asset] })
    const media = new Map([[asset.path, Buffer.from('png-bytes')]])
    const ok = await sliceBundle({ sl, media })
    const read = await readBundle({ buffer: ok.written.buffer }, { appVersion: APP })
    expect(read.ok && read.bundle.media.get(asset.path)?.toString()).toBe('png-bytes')
    await expect(
      sliceBundle({ media: new Map([['media/AIR/x/y.png', Buffer.from('z')]]) }),
    ).rejects.toThrow(/not used/)
  })

  it('refuses to write a path outside the allow-list', () => {
    expect(() => assertShareable(['documents/plan.pdf'])).toThrow(ShareError)
    expect(() => assertShareable(['index.sqlite'])).toThrow(ShareError)
    expect(() => assertShareable(['facility-facts.md'])).toThrow(ShareError)
    expect(() => assertShareable(['slices/AIR.json', 'media/AIR/i1/a1.png'])).not.toThrow()
  })

  it('refuses a field the schema does not list (no smuggling through a row)', async () => {
    const sl = slice('air')
    ;(sl.rows[0] as Record<string, unknown>).facilityFacts = 'secret'
    await expect(sliceBundle({ sl })).rejects.toThrow()
  })

  it('refuses a tampered file (sha256 differs)', async () => {
    const { written } = await sliceBundle()
    const bad = await rezip(written.buffer, async (zip) => {
      const text = await zip.file('slices/AIR.json')!.async('string')
      zip.file('slices/AIR.json', text.replace('AIR event 1', 'AIR event X'))
    })
    const read = await readBundle({ buffer: bad }, { appVersion: APP })
    expect(read.ok).toBe(false)
    expect(!read.ok && read.problems[0]?.message).toMatch(/size|sha256/)
  })

  it('refuses a tampered manifest (signature fails)', async () => {
    const { written } = await sliceBundle()
    const bad = await rezip(written.buffer, async (zip) => {
      const text = await zip.file('bundle.json')!.async('string')
      zip.file('bundle.json', text.replace('Lakefront', 'Lakefrost'))
    })
    const read = await readBundle({ buffer: bad }, { appVersion: APP })
    expect(!read.ok && read.problems[0]?.message).toMatch(/signature is not valid/)
  })

  it('refuses a bundle re-signed with another key claiming the first fingerprint', async () => {
    const { written } = await sliceBundle()
    const other = generateBundleKeys()
    const bad = await rezip(written.buffer, async (zip) => {
      const sig = JSON.parse(await zip.file('signature.json')!.async('string')) as Record<
        string,
        string
      >
      sig.publicKey = other.publicKey
      zip.file('signature.json', JSON.stringify(sig))
    })
    const read = await readBundle({ buffer: bad }, { appVersion: APP })
    expect(read.ok).toBe(false)
  })

  it('refuses an unsigned bundle', async () => {
    const { written } = await sliceBundle()
    const bad = await rezip(written.buffer, (zip) => void zip.remove('signature.json'))
    const read = await readBundle({ buffer: bad }, { appVersion: APP })
    expect(!read.ok && read.problems[0]?.path).toBe('signature.json')
  })

  it('refuses extra files, unsafe paths and plan documents', async () => {
    const { written } = await sliceBundle()
    for (const name of ['documents/plan.pdf', 'index.sqlite', '../escape.json']) {
      const bad = await rezip(written.buffer, (zip) => void zip.file(name, 'x'))
      const read = await readBundle({ buffer: bad }, { appVersion: APP })
      expect(read.ok, name).toBe(false)
    }
  })

  it('refuses a bundle that needs a newer app', async () => {
    const { written } = await sliceBundle()
    const read = await readBundle({ buffer: written.buffer }, { appVersion: '0.1.0' })
    expect(!read.ok && read.problems[0]?.message).toMatch(/Update the app/)
  })

  it('refuses a slice bundle that carries a frame, and a merged bundle without one', async () => {
    const s = signer()
    await expect(
      writeBundle(
        {
          kind: 'slice',
          exerciseId: EXERCISE_ID,
          title: 't',
          frameVersion: 1,
          appVersion: APP,
          from: s.from,
          frame: frame(),
          slices: new Map([['AIR', slice('air')]]),
        },
        s.keys,
      ),
    ).rejects.toThrow(/exactly one slice/)
    await expect(
      writeBundle(
        {
          kind: 'merged',
          exerciseId: EXERCISE_ID,
          title: 't',
          frameVersion: 1,
          appVersion: APP,
          from: s.from,
          slices: new Map([['AIR', slice('air')]]),
        },
        s.keys,
      ),
    ).rejects.toThrow(/frame and every slice/)
  })

  it('round-trips a merged bundle with the frame and every slice', async () => {
    const s = signer()
    const written = await writeBundle(
      {
        kind: 'merged',
        exerciseId: EXERCISE_ID,
        title: 't',
        frameVersion: 1,
        appVersion: APP,
        from: s.from,
        frame: frame(),
        slices: new Map([
          ['AIR', slice('air')],
          ['HOSP', slice('hosp')],
        ]),
      },
      s.keys,
    )
    const read = await readBundle({ buffer: written.buffer }, { appVersion: APP })
    expect(read.ok && [...read.bundle.slices.keys()].sort()).toEqual(['AIR', 'HOSP'])
  })
})
