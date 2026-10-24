// Archives two zip readers could read differently (#303). Each case is built byte by byte
// and records three views: a naive central-directory reader (the pack reader's scan before
// #303), jszip, and readPack now. readPack must refuse every case where the first two can
// disagree or where the archive has more than one reading.
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { manifestFor, validPackTree, type PackTree } from '../../../tests/fixtures/packs/build'
import {
  localEntryBytes,
  naiveCentralNames,
  rawZip,
  unicodePathExtra,
  type RawEntrySpec,
  type RawZipSpec,
} from '../../../tests/fixtures/packs/raw-zip'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.1.0',
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => tmpdir(),
  },
}))
process.env.TTX_RESOURCES = resolve('.')

const { readPack } = await import('./reader')
const { loadBuiltins } = await import('./builtins')
const { scanCentralDirectory } = await import('./zip')

const APP = '0.3.0'
let builtins: Awaited<ReturnType<typeof loadBuiltins>>
beforeAll(async () => {
  builtins = await loadBuiltins()
})

/** jszip's view: the file names it would hand out, or its error. */
async function jszipNames(buf: Buffer): Promise<string[] | string> {
  try {
    const zip = await JSZip.loadAsync(buf)
    return Object.values(zip.files)
      .filter((o) => !o.dir)
      .map((o) => o.unsafeOriginalName ?? o.name)
  } catch (e) {
    return (e as Error).message
  }
}

async function readerView(buf: Buffer): Promise<string> {
  const r = await readPack({ buffer: buf }, { appVersion: APP, builtins })
  return r.ok
    ? 'ok'
    : r.problems.map((p) => `${p.path ? `${p.path}: ` : ''}${p.message}`).join('\n')
}

/** Every entry of a pack tree (pack.json first), for rawZip. */
function packEntries(tree: PackTree = validPackTree()): RawEntrySpec[] {
  return [
    { name: 'pack.json', data: JSON.stringify(manifestFor(tree), null, 2) },
    ...Object.entries(tree).map(([name, data]) => ({ name, data })),
  ]
}

const A: RawEntrySpec = { name: 'a.md', data: 'alpha '.repeat(50) }
const B: RawEntrySpec = { name: 'b.md', data: 'bravo '.repeat(50) }
const two = (extra: Partial<RawZipSpec> = {}): Buffer => rawZip({ entries: [A, B], ...extra })

interface Case {
  build(): Buffer
  /** What the pre-#303 scan saw (names, or its error). */
  naive: string[] | RegExp
  /** What jszip sees (file names, or its error). */
  jszip: string[] | RegExp
  /** readPack's refusal. */
  reader: RegExp
}

const viewMatches = (got: string[] | string, want: string[] | RegExp) =>
  want instanceof RegExp
    ? expect(typeof got === 'string' ? got : JSON.stringify(got)).toMatch(want)
    : expect(got).toEqual(want)

const CASES: Record<string, Case> = {
  'two entries with the same name': {
    build: () => rawZip({ entries: [A, { ...B, name: 'a.md' }] }),
    naive: ['a.md', 'a.md'],
    jszip: ['a.md'],
    reader: /a\.md: duplicate entry in the archive/,
  },
  'central name differs from the local name': {
    build: () => rawZip({ entries: [A, { ...B, centralName: 'c.md' }] }),
    naive: ['a.md', 'c.md'],
    jszip: ['a.md', 'b.md'],
    reader: /Entry "c\.md": the local header name differs from the central directory name/,
  },
  'central names swapped between two entries': {
    build: () =>
      rawZip({
        entries: [
          { ...A, centralName: 'b.md' },
          { ...B, centralName: 'a.md' },
        ],
      }),
    naive: ['b.md', 'a.md'],
    jszip: ['a.md', 'b.md'],
    reader: /local header name differs from the central directory name/,
  },
  'unicode path extra field renames the entry': {
    build: () =>
      rawZip({
        entries: [A, { ...B, centralExtra: unicodePathExtra('b.md', '../x.md') }],
      }),
    naive: ['a.md', 'b.md'],
    // jszip only honours 0x7075 when the UTF-8 flag is clear; rawZip sets it.
    jszip: ['a.md', 'b.md'],
    reader: /Entry "b\.md" has a unicode path extra field/,
  },
  'data descriptor that lies about the sizes': {
    build: () =>
      two({
        entries: [A, { ...B, descriptor: 'signed', descriptorOverride: { uncompressedSize: 1 } }],
      }),
    naive: ['a.md', 'b.md'],
    jszip: ['a.md', 'b.md'],
    reader: /Entry "b\.md": the data descriptor is missing or differs/,
  },
  'prepended data, offsets not adjusted (cat stub zip)': {
    build: () => two({ prefix: Buffer.from('#!/bin/sh\nexit 0\n') }),
    naive: /central directory is damaged/,
    jszip: ['a.md', 'b.md'],
    reader: /does not end where the end record starts/,
  },
  'prepended data, offsets adjusted': {
    build: () => two({ prefix: Buffer.from('#!/bin/sh\nexit 0\n'), offsetsIncludePrefix: true }),
    naive: ['a.md', 'b.md'],
    jszip: ['a.md', 'b.md'],
    reader: /unaccounted bytes before entry "a\.md"/,
  },
  'appended data (short)': {
    build: () => two({ suffix: Buffer.from('trailing bytes') }),
    naive: ['a.md', 'b.md'],
    jszip: ['a.md', 'b.md'],
    reader: /data after its end record/,
  },
  'appended data (over 64 KB)': {
    build: () => two({ suffix: Buffer.alloc(70_000, 0x20) }),
    naive: /Not a zip archive/,
    jszip: ['a.md', 'b.md'],
    reader: /Not a zip archive/,
  },
  'two archives concatenated (two end records)': {
    build: () =>
      Buffer.concat([two(), rawZip({ entries: [{ name: 'evil.md', data: 'x'.repeat(300) }] })]),
    naive: /central directory is damaged/,
    jszip: ['evil.md'],
    reader: /does not end where the end record starts/,
  },
  'a second end record hidden in the archive comment': {
    build: () => {
      const fake = Buffer.alloc(22)
      fake.writeUInt32LE(0x06054b50, 0)
      return two({ comment: fake })
    },
    naive: [],
    jszip: [],
    reader: /does not end where the end record starts/,
  },
  'two central records share one local header': {
    build: () =>
      two({ extraCentral: [{ name: 'c.md', offset: (l) => l.localOffset[0]!, like: 0 }] }),
    naive: ['a.md', 'b.md', 'c.md'],
    jszip: ['a.md', 'b.md'],
    reader: /Entry "c\.md" overlaps entry "a\.md"/,
  },
  'an entry nested inside another stored entry': {
    build: () => {
      const inner: RawEntrySpec = { name: 'n.md', data: 'nested '.repeat(40) }
      const outer: RawEntrySpec = { name: 'o.md', data: localEntryBytes(inner), method: 0 }
      // n.md has no region of its own: its record points into o.md's stored data.
      return rawZip({
        entries: [outer],
        extraCentral: [{ name: 'n.md', offset: (l) => l.dataOffset[0]!, like: inner }],
      })
    },
    naive: ['o.md', 'n.md'],
    jszip: ['o.md', 'n.md'],
    reader: /Entry "o\.md" overlaps entry "n\.md"/,
  },
  'end record counts fewer entries than the central directory': {
    build: () => two({ countDelta: -1 }),
    naive: ['a.md'],
    jszip: ['a.md', 'b.md'],
    reader: /end record says 1 entries; the central directory has 2/,
  },
  'end record counts more entries than the central directory': {
    build: () => two({ countDelta: 1 }),
    naive: /central directory is damaged/,
    jszip: ['a.md', 'b.md'],
    reader: /end record says 3 entries; the central directory has 2/,
  },
  'hidden bytes between two entries': {
    build: () => rawZip({ entries: [{ ...A, gapAfter: Buffer.from('hidden payload') }, B] }),
    naive: ['a.md', 'b.md'],
    jszip: ['a.md', 'b.md'],
    reader: /unaccounted bytes after entry "a\.md"/,
  },
  'a unix directory mode on a name without a slash': {
    build: () => rawZip({ entries: [A, { ...B, name: 'dir', unixMode: 0o040755 }] }),
    naive: ['a.md', 'dir'],
    // jszip turns it into the folder "dir/", then fails to label the file it expected.
    jszip: /Cannot set properties of null/,
    reader: /The archive cannot be opened/,
  },
}

describe('malformed archives: naive scan vs jszip vs readPack', () => {
  it.each(Object.entries(CASES))('%s', async (_name, c) => {
    const buf = c.build()
    viewMatches(naiveCentralNames(buf), c.naive)
    viewMatches(await jszipNames(buf), c.jszip)
    expect(await readerView(buf)).toMatch(c.reader)
  })
})

describe('well-formed layouts other zip writers produce', () => {
  it('reads a pack written field by field (the builder agrees with jszip)', async () => {
    expect(await readerView(rawZip({ entries: packEntries() }))).toBe('ok')
  })

  it.each(['signed', 'unsigned'] as const)('reads data descriptors (%s)', async (descriptor) => {
    const buf = rawZip({ entries: packEntries().map((e) => ({ ...e, descriptor })) })
    expect(await readerView(buf)).toBe('ok')
  })

  it('reads stored entries', async () => {
    const buf = rawZip({ entries: packEntries().map((e) => ({ ...e, method: 0 as const })) })
    expect(await readerView(buf)).toBe('ok')
  })

  it('records where each entry and its data start in a jszip archive', async () => {
    const zip = new JSZip()
    zip.file('a.md', 'alpha')
    zip.file('b.md', 'bravo')
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    const [a, b] = scanCentralDirectory(buf)
    expect(a).toMatchObject({ name: 'a.md', localHeaderOffset: 0, dataOffset: 34 })
    expect(b!.localHeaderOffset).toBe(a!.dataOffset + a!.compressedSize)
  })
})

describe('the compression-ratio limit is measured on the bytes really inflated', () => {
  const BOMB = 'examples/harbor-junction/project/notes.txt'
  const NOISE = 'examples/harbor-junction/project/noise.mp3'
  const MB20 = 20 * 1024 * 1024
  const tree = (): PackTree => ({
    ...validPackTree(),
    [BOMB]: Buffer.alloc(MB20),
    [NOISE]: randomBytes(300 * 1024),
  })
  const swap = (e: RawEntrySpec): RawEntrySpec =>
    e.name === BOMB
      ? { ...e, centralName: NOISE }
      : e.name === NOISE
        ? { ...e, centralName: BOMB }
        : e

  it('a bomb cannot borrow another entry’s compressed size by swapping central names', async () => {
    const buf = rawZip({ entries: packEntries(tree()).map(swap) })
    // The pre-#303 check compared the two name lists as sets, and they agree...
    const naive = naiveCentralNames(buf) as string[]
    expect(new Set(naive)).toEqual(new Set(await jszipNames(buf)))
    // ...but the central record named BOMB carries NOISE's compressed size: 20 MB / 300 KB < 100.
    expect(MB20 / centralCompressedSizes(buf).get(BOMB)!).toBeLessThan(100)
    expect(await readerView(buf)).toMatch(
      /the local header name differs from the central directory name/,
    )
  })

  it('padding after a small deflate stream does not buy a larger allowance', async () => {
    const pad = (e: RawEntrySpec): RawEntrySpec =>
      e.name === BOMB ? { ...e, innerPad: randomBytes(300 * 1024) } : e
    const buf = rawZip({ entries: packEntries(tree()).map(pad) })
    // jszip inflates the stream and ignores the padding.
    const zip = await JSZip.loadAsync(buf)
    expect((await zip.file(BOMB)!.async('nodebuffer')).length).toBe(MB20)
    expect(await readerView(buf)).toMatch(
      /notes\.txt: has bytes after the end of its compressed data/,
    )
  })

  it('still refuses a plain bomb', async () => {
    expect(await readerView(rawZip({ entries: packEntries(tree()) }))).toMatch(
      /notes\.txt: compression ratio exceeds 100:1/,
    )
  })
})

/** Compressed size per central name, read without checking the layout (the old view). */
function centralCompressedSizes(buf: Buffer): Map<string, number> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const out = new Map<string, number>()
  let at = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < buf.readUInt16LE(eocd + 10); i++) {
    const n = buf.readUInt16LE(at + 28)
    out.set(buf.toString('utf8', at + 46, at + 46 + n), buf.readUInt32LE(at + 20))
    at += 46 + n + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32)
  }
  return out
}
