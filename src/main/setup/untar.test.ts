// Safe tarball extraction (#338): an Ollama-shaped archive unpacks with its folders, symlinks
// and long names; anything that would write outside the folder, through a link, or create a
// special file is refused. Archives are built in memory by tar-fixture; nothing is downloaded.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import {
  allowedPath,
  cleanPath,
  extractTar,
  extractTarZst,
  linkTarget,
  parsePax,
  zstdAvailable,
} from './untar'
import { buildTar, ollamaTarball, paxBody, rocmTarball, type FixtureEntry } from './tar-fixture'

const ALLOW = ['bin/ollama', 'lib/ollama/']
const LIMITS = { allow: ALLOW, maxBytes: 10 * 1024 * 1024, maxEntries: 1000 }

let work: string
let root: string
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'ttx-untar-'))
  root = join(work, 'root')
  mkdirSync(root)
})
afterEach(() => rmSync(work, { recursive: true, force: true }))

/** Feed an archive in small, uneven chunks, the way a decompressor delivers it. */
const chunked = (b: Buffer, size = 700): AsyncIterable<Buffer> =>
  Readable.from(
    (function* () {
      for (let i = 0; i < b.length; i += size) yield b.subarray(i, i + size)
    })(),
  )

const extract = (entries: FixtureEntry[], limits = LIMITS) =>
  extractTar(chunked(buildTar(entries)), root, limits)

describe('extractTarZst', () => {
  it('is available in this runtime', () => {
    expect(zstdAvailable()).toBe(true)
  })

  it('unpacks an Ollama-shaped tarball and its ROCm add-on into one folder', async () => {
    const main = join(work, 'main.tar.zst')
    const rocm = join(work, 'rocm.tar.zst')
    writeFileSync(main, ollamaTarball())
    writeFileSync(rocm, rocmTarball())
    const a = await extractTarZst(main, root, LIMITS)
    const b = await extractTarZst(rocm, root, LIMITS)
    expect(a).toMatchObject({ files: 3, symlinks: 1, dirs: 1 })
    expect(b).toMatchObject({ files: 2, symlinks: 1 })
    expect(statSync(join(root, 'bin', 'ollama')).mode & 0o777).toBe(0o755)
    expect(readlinkSync(join(root, 'lib/ollama/cuda_v13/libcublas.so.13'))).toBe(
      './libcublas.so.13.1.1.3',
    )
    expect(readFileSync(join(root, 'lib/ollama/cuda_v13/libcublas.so.13'), 'utf8')).toBe(
      'not really a library',
    )
    const long = readFileSync(
      join(
        root,
        'lib/ollama/rocm_v7_2/rocblas/library/TensileLibrary_Type_HH_HPA_Fp16AltRnz_Fp16Alt_Contraction_l_Ailk_Bljk_Cijk_Dijk_gfx90a-xnack+.hsaco',
      ),
      'utf8',
    )
    expect(long).toBe('kernel')
  })

  it('refuses a file that is not zstd', async () => {
    const f = join(work, 'x.tar.zst')
    writeFileSync(f, 'definitely not zstd')
    await expect(extractTarZst(f, root, LIMITS)).rejects.toThrow(/Could not unpack the archive/)
  })
})

describe('extractTar refusals', () => {
  it.each([
    ['a ../ path', [{ name: 'lib/ollama/../../evil', data: 'x' }], /outside the install folder/],
    ['an absolute path', [{ name: '/etc/passwd', data: 'x' }], /absolute path/],
    [
      'a path outside the allowed folders',
      [{ name: 'etc/profile', data: 'x' }],
      /outside the folders/,
    ],
    ['a sibling of bin/ollama', [{ name: 'bin/sh', data: 'x' }], /outside the folders/],
    [
      'a symlink pointing up and out',
      [{ name: 'lib/ollama/x', type: '2', linkname: '../../../etc/passwd' }],
      /outside the install folder/,
    ],
    [
      'a symlink to an absolute path',
      [{ name: 'lib/ollama/x', type: '2', linkname: '/etc/passwd' }],
      /absolute or empty/,
    ],
    [
      'a symlink to a folder outside the allowed ones',
      [{ name: 'lib/ollama/x', type: '2', linkname: '../../etc' }],
      /outside the expected folders/,
    ],
    [
      'a file written through a symlink',
      [
        { name: 'lib/ollama/real/', type: '5' },
        { name: 'lib/ollama/link', type: '2', linkname: 'real' },
        { name: 'lib/ollama/link/payload', data: 'x' },
      ],
      /through a link/,
    ],
    [
      'a symlink replacing a file',
      [
        { name: 'lib/ollama/a', data: 'x' },
        { name: 'lib/ollama/a', type: '2', linkname: 'b' },
      ],
      /appears twice/,
    ],
    ['a character device', [{ name: 'lib/ollama/tty', type: '3' }], /special file/],
    ['a FIFO', [{ name: 'lib/ollama/fifo', type: '6' }], /special file/],
    [
      'a hard link to a file that is not in the archive',
      [{ name: 'lib/ollama/h', type: '1', linkname: 'lib/ollama/missing' }],
      /no earlier file/,
    ],
    ['a bad header checksum', [{ name: 'bin/ollama', data: 'x', badChecksum: true }], /checksum/],
  ] as [string, FixtureEntry[], RegExp][])('refuses %s', async (_label, entries, why) => {
    await expect(extract(entries)).rejects.toThrow(why)
    expect(() => lstatSync(join(work, 'evil'))).toThrow()
    expect(() => lstatSync(join(root, 'lib/ollama/real/payload'))).toThrow()
  })

  it('refuses a pax path that escapes', async () => {
    await expect(
      extract([
        { name: 'PaxHeader/x', type: 'x', data: paxBody({ path: '../outside' }) },
        { name: 'lib/ollama/innocent', data: 'x' },
      ]),
    ).rejects.toThrow(/outside the install folder/)
  })

  it('refuses an archive that unpacks past the size cap', async () => {
    await expect(
      extract([{ name: 'lib/ollama/big', data: Buffer.alloc(4096) }], {
        ...LIMITS,
        maxBytes: 1000,
      }),
    ).rejects.toThrow(/more than the size limit/)
  })

  it('refuses too many entries', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ name: `lib/ollama/f${i}`, data: 'x' }))
    await expect(extract(many, { ...LIMITS, maxEntries: 3 })).rejects.toThrow(/too many entries/)
  })

  it('refuses a truncated archive', async () => {
    const tar = buildTar([{ name: 'lib/ollama/f', data: Buffer.alloc(2000) }])
    await expect(extractTar(chunked(tar.subarray(0, 1024)), root, LIMITS)).rejects.toThrow(
      /ends in the middle of a file|truncated/,
    )
    const noEnd = buildTar([{ name: 'lib/ollama/g', data: 'x' }], { endMarker: false })
    await expect(extractTar(chunked(noEnd), root, LIMITS)).rejects.toThrow(/without an end marker/)
  })

  it('stops when cancelled', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(
      extractTar(chunked(buildTar([{ name: 'bin/ollama', data: 'x' }])), root, LIMITS, ac.signal),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
  })
})

describe('extractTar details', () => {
  it('drops set-id and write-for-others bits', async () => {
    await extract([{ name: 'bin/ollama', data: 'x', mode: 0o6777 }])
    expect(statSync(join(root, 'bin/ollama')).mode & 0o7777).toBe(0o755)
  })

  it('copies a hard link to an earlier file instead of linking', async () => {
    await extract([
      { name: 'lib/ollama/a', data: 'same' },
      { name: 'lib/ollama/b', type: '1', linkname: 'lib/ollama/a' },
    ])
    expect(readFileSync(join(root, 'lib/ollama/b'), 'utf8')).toBe('same')
    expect(statSync(join(root, 'lib/ollama/b')).nlink).toBe(1)
  })

  it('takes the name from a pax header', async () => {
    await extract([
      { name: 'PaxHeader/x', type: 'x', data: paxBody({ path: 'lib/ollama/from-pax' }) },
      { name: 'lib/ollama/short', data: 'pax' },
    ])
    expect(readFileSync(join(root, 'lib/ollama/from-pax'), 'utf8')).toBe('pax')
  })
})

describe('path rules', () => {
  it('cleans names and refuses escapes', () => {
    expect(cleanPath('./bin/ollama')).toBe('bin/ollama')
    expect(cleanPath('lib//ollama/./x')).toBe('lib/ollama/x')
    expect(() => cleanPath('a/../../b')).toThrow()
    expect(() => cleanPath('a\\b')).toThrow()
  })

  it('allows only the listed folders and the folders above them', () => {
    expect(allowedPath('lib', ALLOW, true)).toBe(true)
    expect(allowedPath('lib', ALLOW, false)).toBe(false)
    expect(allowedPath('bin', ALLOW, true)).toBe(true)
    expect(allowedPath('bin/ollama', ALLOW)).toBe(true)
    expect(allowedPath('lib/ollama/x/y', ALLOW)).toBe(true)
    expect(allowedPath('lib/other', ALLOW)).toBe(false)
  })

  it('resolves link targets relative to the link', () => {
    expect(linkTarget('lib/ollama/cuda/a', 'b', ALLOW)).toBe('lib/ollama/cuda/b')
    expect(linkTarget('lib/ollama/cuda/a', '../c', ALLOW)).toBe('lib/ollama/c')
    expect(() => linkTarget('lib/ollama/a', '../../../x', ALLOW)).toThrow()
  })

  it('parses pax records', () => {
    expect(parsePax(Buffer.from(paxBody({ path: 'a/b', linkpath: 'c' })))).toEqual({
      path: 'a/b',
      linkpath: 'c',
    })
  })
})
