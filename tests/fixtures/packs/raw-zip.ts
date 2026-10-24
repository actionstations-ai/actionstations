// Byte-level zip writer for adversarial pack archives (#303). jszip only writes well-formed
// zips; these tests need archives two readers can read differently (a central name that is
// not the local name, data descriptors, prepended or appended bytes, a second end record,
// overlapping entries, a wrong entry count), so headers are written field by field here.
// Built at test time; nothing binary is committed.
import { crc32, deflateRawSync } from 'node:zlib'

export interface RawEntrySpec {
  name: string
  data: Buffer | string
  /** 0 = store, 8 = deflate (default). */
  method?: 0 | 8
  /** Name in the central record when it should differ from the local header's. */
  centralName?: string
  /** Write general purpose bit 3: zero sizes in the local header and a descriptor after the data. */
  descriptor?: 'signed' | 'unsigned'
  /** Descriptor fields to write instead of the real ones (a lying descriptor). */
  descriptorOverride?: { crc32?: number; compressedSize?: number; uncompressedSize?: number }
  /** Bytes appended to the compressed data and counted in compressedSize. */
  innerPad?: Buffer
  /** Bytes written after the entry (and its descriptor) that no header accounts for. */
  gapAfter?: Buffer
  /** Unix mode (high 16 bits of the external attributes); default 0o100644. */
  unixMode?: number
  /** Central-record extra field bytes. */
  centralExtra?: Buffer
}

/** Where each entry landed: offsets are absolute in the returned buffer minus `prefix`. */
export interface RawLayout {
  localOffset: number[]
  dataOffset: number[]
}

/** A central record that is not the record of its own entry (shared or nested headers). */
export interface ExtraCentral {
  name: string
  /** Local header offset this record points at (relative to the archive start). */
  offset: (l: RawLayout) => number
  /** Declare the sizes, CRC and method of this entry index, or of this spec. */
  like: number | RawEntrySpec
}

export interface RawZipSpec {
  entries: RawEntrySpec[]
  /** Bytes before the first local header. */
  prefix?: Buffer
  /** Whether offsets count the prefix (a fixed-up self-extractor) or not (plain `cat`). */
  offsetsIncludePrefix?: boolean
  extraCentral?: ExtraCentral[]
  /** End record entry count = real record count + this. */
  countDelta?: number
  /** Archive comment (inside the end record). */
  comment?: Buffer
  /** Bytes after the end record. */
  suffix?: Buffer
}

interface Built {
  spec: RawEntrySpec
  stored: Buffer
  crc: number
  size: number
}

const u16 = (n: number) => {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n)
  return b
}
const u32 = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n >>> 0)
  return b
}

function build(spec: RawEntrySpec): Built {
  const data = Buffer.from(spec.data)
  const body = spec.method === 0 ? data : deflateRawSync(data)
  return {
    spec,
    stored: Buffer.concat([body, spec.innerPad ?? Buffer.alloc(0)]),
    crc: crc32(data),
    size: data.length,
  }
}

const flagsOf = (s: RawEntrySpec) => 0x0800 | (s.descriptor ? 0x0008 : 0)

function localHeader(b: Built): Buffer {
  const name = Buffer.from(b.spec.name)
  const zero = b.spec.descriptor !== undefined
  return Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(flagsOf(b.spec)),
    u16(b.spec.method ?? 8),
    u16(0),
    u16(0x5c21), // fixed DOS date
    u32(zero ? 0 : b.crc),
    u32(zero ? 0 : b.stored.length),
    u32(zero ? 0 : b.size),
    u16(name.length),
    u16(0),
    name,
  ])
}

function descriptor(b: Built): Buffer {
  const o = b.spec.descriptorOverride ?? {}
  const fields = Buffer.concat([
    u32(o.crc32 ?? b.crc),
    u32(o.compressedSize ?? b.stored.length),
    u32(o.uncompressedSize ?? b.size),
  ])
  return b.spec.descriptor === 'signed' ? Buffer.concat([u32(0x08074b50), fields]) : fields
}

interface CentralFields {
  name: string
  built: Built
  offset: number
}

function centralRecord({ name, built: b, offset }: CentralFields): Buffer {
  const n = Buffer.from(name)
  const extra = b.spec.centralExtra ?? Buffer.alloc(0)
  return Buffer.concat([
    u32(0x02014b50),
    u16((3 << 8) | 20), // made by unix
    u16(20),
    u16(flagsOf(b.spec)),
    u16(b.spec.method ?? 8),
    u16(0),
    u16(0x5c21),
    u32(b.crc),
    u32(b.stored.length),
    u32(b.size),
    u16(n.length),
    u16(extra.length),
    u16(0),
    u16(0),
    u16(0),
    u32(((b.spec.unixMode ?? 0o100644) << 16) >>> 0),
    u32(offset),
    n,
    extra,
  ])
}

/** Write a zip from the spec, honouring every deliberate inconsistency in it. */
export function rawZip(spec: RawZipSpec): Buffer {
  const prefix = spec.prefix ?? Buffer.alloc(0)
  const shift = spec.offsetsIncludePrefix ? prefix.length : 0
  const built = spec.entries.map(build)
  const parts: Buffer[] = []
  const layout: RawLayout = { localOffset: [], dataOffset: [] }
  let at = 0
  for (const b of built) {
    const head = localHeader(b)
    layout.localOffset.push(at)
    layout.dataOffset.push(at + head.length)
    const tail = b.spec.descriptor ? descriptor(b) : Buffer.alloc(0)
    const gap = b.spec.gapAfter ?? Buffer.alloc(0)
    parts.push(head, b.stored, tail, gap)
    at += head.length + b.stored.length + tail.length + gap.length
  }
  const records = built.map((b, i) =>
    centralRecord({
      name: b.spec.centralName ?? b.spec.name,
      built: b,
      offset: layout.localOffset[i]! + shift,
    }),
  )
  for (const x of spec.extraCentral ?? [])
    records.push(
      centralRecord({
        name: x.name,
        built: typeof x.like === 'number' ? built[x.like]! : build(x.like),
        offset: x.offset(layout) + shift,
      }),
    )
  const cd = Buffer.concat(records)
  const comment = spec.comment ?? Buffer.alloc(0)
  const count = records.length + (spec.countDelta ?? 0)
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(count),
    u16(count),
    u32(cd.length),
    u32(at + shift),
    u16(comment.length),
    comment,
  ])
  return Buffer.concat([prefix, ...parts, cd, end, spec.suffix ?? Buffer.alloc(0)])
}

/** The local header + data of one entry, alone (to nest inside another entry's data). */
export function localEntryBytes(spec: RawEntrySpec): Buffer {
  const b = build(spec)
  return Buffer.concat([localHeader(b), b.stored])
}

/** Info-ZIP unicode path extra field (0x7075) naming `name` for an entry stored as `stored`. */
export function unicodePathExtra(stored: string, name: string): Buffer {
  const n = Buffer.from(name)
  return Buffer.concat([
    u16(0x7075),
    u16(5 + n.length),
    Buffer.from([1]),
    u32(crc32(Buffer.from(stored))),
    n,
  ])
}

/**
 * What a naive reader sees (the pack reader's scan before #303): the end record found from
 * the back within the last 64 KB, then `count` central records from the stated offset,
 * names only, no local headers. Returns the names or the error message.
 */
export function naiveCentralNames(buf: Buffer): string[] | string {
  const stop = Math.max(0, buf.length - 22 - 0xffff)
  let eocd = -1
  for (let i = buf.length - 22; i >= stop; i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  if (eocd < 0) return 'Not a zip archive'
  const count = buf.readUInt16LE(eocd + 10)
  let at = buf.readUInt32LE(eocd + 16)
  const names: string[] = []
  for (let i = 0; i < count; i++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50)
      return 'The zip central directory is damaged'
    const n = buf.readUInt16LE(at + 28)
    names.push(buf.toString('utf8', at + 46, at + 46 + n))
    at += 46 + n + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32)
  }
  return names
}
