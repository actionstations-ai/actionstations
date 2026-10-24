// Test-only: build small GNU tar archives (and .tar.zst) in memory, shaped like Ollama's Linux
// release tarballs (#338): regular files, folders, relative symlinks and ././@LongLink names,
// plus the hostile shapes the extractor must refuse. Imported only from *.test.ts files.
import { zstdCompressSync } from 'node:zlib'

export interface FixtureEntry {
  name: string
  /** '0' file (default), '5' folder, '2' symlink, '1' hard link, 'x' pax header, '3' char device. */
  type?: string
  data?: Buffer | string
  linkname?: string
  mode?: number
  /** Write the header with a wrong checksum. */
  badChecksum?: boolean
}

const BLOCK = 512

function octal(value: number, len: number): string {
  return value.toString(8).padStart(len - 1, '0') + '\0'
}

function header(e: { name: string; type: string; size: number; linkname: string; mode: number }) {
  const h = Buffer.alloc(BLOCK)
  h.write(e.name, 0, 100, 'utf8')
  h.write(octal(e.mode, 8), 100, 'latin1')
  h.write(octal(0, 8), 108, 'latin1')
  h.write(octal(0, 8), 116, 'latin1')
  h.write(octal(e.size, 12), 124, 'latin1')
  h.write(octal(1_760_000_000, 12), 136, 'latin1')
  h.write(e.type, 156, 'latin1')
  h.write(e.linkname, 157, 100, 'utf8')
  // Old GNU magic, as in Ollama's tarballs.
  h.write('ustar  \0', 257, 'latin1')
  h.write('root', 265, 'latin1')
  h.write('root', 297, 'latin1')
  h.fill(0x20, 148, 156)
  let sum = 0
  for (const b of h) sum += b
  h.write(octal(sum, 7) + ' ', 148, 'latin1')
  return h
}

const pad = (n: number) => Buffer.alloc((BLOCK - (n % BLOCK)) % BLOCK)

function record(name: string, type: string, data: Buffer, linkname = '', mode = 0o644): Buffer[] {
  return [header({ name, type, size: data.length, linkname, mode }), data, pad(data.length)]
}

/** A GNU tar archive; names over 100 bytes get a ././@LongLink record like GNU tar writes. */
export function buildTar(entries: FixtureEntry[], opts: { endMarker?: boolean } = {}): Buffer {
  const parts: Buffer[] = []
  for (const e of entries) {
    const type = e.type ?? '0'
    const data = Buffer.from(e.data ?? '')
    if (Buffer.byteLength(e.name) > 99)
      parts.push(...record('././@LongLink', 'L', Buffer.from(`${e.name}\0`)))
    if (e.linkname && Buffer.byteLength(e.linkname) > 99)
      parts.push(...record('././@LongLink', 'K', Buffer.from(`${e.linkname}\0`)))
    const body = type === '0' || type === 'x' ? data : Buffer.alloc(0)
    const recs = record(
      e.name.slice(0, 99),
      type,
      body,
      (e.linkname ?? '').slice(0, 99),
      e.mode ?? (type === '5' ? 0o755 : 0o644),
    )
    if (e.badChecksum) recs[0]!.write('0000000\0', 148, 'latin1')
    parts.push(...recs)
  }
  if (opts.endMarker !== false) parts.push(Buffer.alloc(BLOCK * 2))
  return Buffer.concat(parts)
}

/** A pax extended header body: "len key=value\n" records. */
export function paxBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => {
      const rest = ` ${k}=${v}\n`
      let len = rest.length + 1
      while (`${len}${rest}`.length !== len) len = `${len}${rest}`.length
      return `${len}${rest}`
    })
    .join('')
}

export const zst = (b: Buffer): Buffer => zstdCompressSync(b)

/** Ollama-shaped main tarball: the program, a library folder and a same-folder symlink. */
export function ollamaTarball(extra: FixtureEntry[] = []): Buffer {
  return zst(
    buildTar([
      { name: 'bin/ollama', data: '#!/bin/sh\necho ollama fixture\n', mode: 0o755 },
      { name: 'lib/ollama/GO_LICENSE', data: 'license text' },
      { name: 'lib/ollama/cuda_v13/', type: '5' },
      {
        name: 'lib/ollama/cuda_v13/libcublas.so.13.1.1.3',
        data: 'not really a library',
        mode: 0o755,
      },
      {
        name: 'lib/ollama/cuda_v13/libcublas.so.13',
        type: '2',
        linkname: './libcublas.so.13.1.1.3',
      },
      ...extra,
    ]),
  )
}

/** Ollama-shaped ROCm add-on, with a long GNU name like the real Tensile files. */
export function rocmTarball(): Buffer {
  const long = `lib/ollama/rocm_v7_2/rocblas/library/TensileLibrary_Type_HH_HPA_Fp16AltRnz_Fp16Alt_Contraction_l_Ailk_Bljk_Cijk_Dijk_gfx90a-xnack+.hsaco`
  return zst(
    buildTar([
      { name: 'lib/ollama/rocm_v7_2/', type: '5' },
      { name: 'lib/ollama/rocm_v7_2/libamdhip64.so.7.2.70201', data: 'hip', mode: 0o755 },
      {
        name: 'lib/ollama/rocm_v7_2/libamdhip64.so.7',
        type: '2',
        linkname: 'libamdhip64.so.7.2.70201',
      },
      { name: long, data: 'kernel' },
    ]),
  )
}
