// A small bzip2 decompressor (ADR-0095): NEXRAD Level II volumes are sequences of bzip2
// streams and Node has no bzip2 in its standard library. Decodes one complete stream
// (blocks of up to 900 kB, Huffman + MTF + zero-run coding, inverse Burrows-Wheeler, the
// initial run-length layer) and checks every block's CRC. The long-obsolete "randomised"
// block mode is refused. Pure and synchronous.

const BLOCK_MAGIC = 0x314159265359n
const END_MAGIC = 0x177245385090n
const MAX_CODE_LEN = 20

export class Bzip2Error extends Error {}

/** MSB-first bit reader over a byte array. */
class Bits {
  private pos = 0
  private bit = 0
  constructor(private readonly buf: Uint8Array) {}

  read(n: number): number {
    let v = 0
    for (let left = n; left > 0;) {
      if (this.pos >= this.buf.length) throw new Bzip2Error('bzip2: unexpected end of data')
      const take = Math.min(left, 8 - this.bit)
      const byte = this.buf[this.pos]!
      v = v * (1 << take) + ((byte >> (8 - this.bit - take)) & ((1 << take) - 1))
      this.bit += take
      if (this.bit === 8) {
        this.bit = 0
        this.pos++
      }
      left -= take
    }
    return v
  }

  readBig(n: number): bigint {
    return (BigInt(this.read(n - 24)) << 24n) | BigInt(this.read(24))
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i << 24
    for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array, from: number, to: number): number {
  let c = 0xffffffff
  for (let i = from; i < to; i++) c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ data[i]!) & 0xff]!) >>> 0
  return ~c >>> 0
}

/** Canonical Huffman decoding table for one coding group. */
interface Huffman {
  limit: Int32Array
  base: Int32Array
  perm: Int32Array
  minLen: number
}

function buildHuffman(lengths: Uint8Array, alphaSize: number): Huffman {
  let minLen = MAX_CODE_LEN
  let maxLen = 0
  for (let i = 0; i < alphaSize; i++) {
    minLen = Math.min(minLen, lengths[i]!)
    maxLen = Math.max(maxLen, lengths[i]!)
  }
  const perm = new Int32Array(alphaSize)
  let pp = 0
  for (let len = minLen; len <= maxLen; len++)
    for (let i = 0; i < alphaSize; i++) if (lengths[i] === len) perm[pp++] = i
  const count = new Int32Array(MAX_CODE_LEN + 2)
  for (let i = 0; i < alphaSize; i++) count[lengths[i]! + 1]!++
  for (let i = 1; i < count.length; i++) count[i]! += count[i - 1]!
  const limit = new Int32Array(MAX_CODE_LEN + 2)
  const base = new Int32Array(MAX_CODE_LEN + 2)
  let code = 0
  for (let len = minLen; len <= maxLen; len++) {
    code += count[len + 1]! - count[len]!
    limit[len] = code - 1
    code <<= 1
  }
  for (let len = minLen + 1; len <= maxLen; len++)
    base[len] = ((limit[len - 1]! + 1) << 1) - count[len]!
  base[minLen] = 0 - count[minLen]!
  for (let len = maxLen + 1; len < limit.length; len++) limit[len] = 0x7fffffff
  return { limit, base, perm, minLen }
}

function decodeSymbol(bits: Bits, h: Huffman): number {
  let len = h.minLen
  let code = bits.read(len)
  while (len <= MAX_CODE_LEN && code > h.limit[len]!) {
    code = (code << 1) | bits.read(1)
    len++
  }
  const idx = code - h.base[len]!
  if (len > MAX_CODE_LEN || idx < 0 || idx >= h.perm.length)
    throw new Bzip2Error('bzip2: bad Huffman code')
  return h.perm[idx]!
}

function readCodingTables(bits: Bits, nGroups: number, alphaSize: number): Huffman[] {
  const tables: Huffman[] = []
  for (let g = 0; g < nGroups; g++) {
    const lengths = new Uint8Array(alphaSize)
    let len = bits.read(5)
    for (let s = 0; s < alphaSize; s++) {
      for (;;) {
        if (len < 1 || len > MAX_CODE_LEN) throw new Bzip2Error('bzip2: bad code length')
        if (!bits.read(1)) break
        len += bits.read(1) ? -1 : 1
      }
      lengths[s] = len
    }
    tables.push(buildHuffman(lengths, alphaSize))
  }
  return tables
}

function readSelectors(bits: Bits, nGroups: number): Uint8Array {
  const count = bits.read(15)
  if (count < 1) throw new Bzip2Error('bzip2: no selectors')
  const order = Array.from({ length: nGroups }, (_, i) => i)
  const out = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    let j = 0
    while (bits.read(1)) if (++j >= nGroups) throw new Bzip2Error('bzip2: bad selector')
    const v = order[j]!
    order.splice(j, 1)
    order.unshift(v)
    out[i] = v
  }
  return out
}

/** The bytes in use, from the two-level bitmap. */
function readSymbolMap(bits: Bits): number[] {
  const groups = bits.read(16)
  const used: number[] = []
  for (let g = 0; g < 16; g++)
    if (groups & (0x8000 >> g)) {
      const m = bits.read(16)
      for (let k = 0; k < 16; k++) if (m & (0x8000 >> k)) used.push(g * 16 + k)
    }
  if (!used.length) throw new Bzip2Error('bzip2: empty symbol map')
  return used
}

/** Huffman + MTF + zero-run decoding of one block into the BWT-transformed bytes. */
function decodeBlockSymbols(bits: Bits, used: number[], maxBlock: number): Uint8Array {
  const alphaSize = used.length + 2
  const nGroups = bits.read(3)
  if (nGroups < 2 || nGroups > 6) throw new Bzip2Error('bzip2: bad group count')
  const selectors = readSelectors(bits, nGroups)
  const tables = readCodingTables(bits, nGroups, alphaSize)
  const eob = used.length + 1
  const mtf = Uint8Array.from(used.map((_, i) => i))
  const out = new Uint8Array(maxBlock)
  let n = 0
  let run = 0
  let runWeight = 1
  let sel = 0
  let left = 0
  let table = tables[0]!
  const flush = () => {
    if (!run) return
    if (n + run > maxBlock) throw new Bzip2Error('bzip2: block overflow')
    out.fill(used[mtf[0]!]!, n, n + run)
    n += run
    run = 0
    runWeight = 1
  }
  for (;;) {
    if (left === 0) {
      if (sel >= selectors.length) throw new Bzip2Error('bzip2: out of selectors')
      table = tables[selectors[sel++]!]!
      left = 50
    }
    left--
    const sym = decodeSymbol(bits, table)
    if (sym <= 1) {
      run += runWeight << sym
      runWeight <<= 1
      continue
    }
    flush()
    if (sym === eob) break
    const idx = sym - 1
    const v = mtf[idx]!
    mtf.copyWithin(1, 0, idx)
    mtf[0] = v
    if (n >= maxBlock) throw new Bzip2Error('bzip2: block overflow')
    out[n++] = used[v]!
  }
  return out.subarray(0, n)
}

/** Inverse Burrows-Wheeler transform followed by the initial run-length decoding. */
function unBwt(last: Uint8Array, origPtr: number): Uint8Array {
  const n = last.length
  if (origPtr >= n) throw new Bzip2Error('bzip2: bad origin pointer')
  const cf = new Int32Array(257)
  for (let i = 0; i < n; i++) cf[last[i]! + 1]!++
  for (let i = 1; i < 257; i++) cf[i]! += cf[i - 1]!
  const tt = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    const k = cf[last[i]!]!++
    tt[k] = tt[k]! | (i << 8)
  }
  for (let i = 0; i < n; i++) tt[i] = (tt[i]! & 0xffffff00) | last[i]!
  // tt[i] >> 8 is the next index; the low byte is the symbol read there.
  const out: number[] = []
  let pos = tt[origPtr]! >>> 8
  let prev = -1
  let same = 0
  for (let i = 0; i < n; i++) {
    const entry = tt[pos]!
    const byte = entry & 0xff
    pos = entry >>> 8
    if (same === 4) {
      for (let r = 0; r < byte; r++) out.push(prev)
      same = 0
      prev = -1
      continue
    }
    same = byte === prev ? same + 1 : 1
    prev = byte
    out.push(byte)
  }
  return Uint8Array.from(out)
}

/** Decompress one complete bzip2 stream. Throws Bzip2Error on any corruption. */
export function bunzip2(input: Uint8Array): Uint8Array {
  if (input.length < 4 || input[0] !== 0x42 || input[1] !== 0x5a || input[2] !== 0x68)
    throw new Bzip2Error('bzip2: missing BZh header')
  const level = input[3]! - 0x30
  if (level < 1 || level > 9) throw new Bzip2Error('bzip2: bad block size')
  const maxBlock = level * 100_000
  const bits = new Bits(input.subarray(4))
  const chunks: Uint8Array[] = []
  for (;;) {
    const magic = bits.readBig(48)
    const expected = bits.read(32)
    if (magic === END_MAGIC) break
    if (magic !== BLOCK_MAGIC) throw new Bzip2Error('bzip2: bad block magic')
    if (bits.read(1)) throw new Bzip2Error('bzip2: randomised blocks are not supported')
    const origPtr = bits.read(24)
    const block = unBwt(decodeBlockSymbols(bits, readSymbolMap(bits), maxBlock), origPtr)
    if (crc32(block, 0, block.length) !== expected)
      throw new Bzip2Error('bzip2: block CRC mismatch')
    chunks.push(block)
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}
