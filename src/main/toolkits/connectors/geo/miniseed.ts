// miniSEED 2 decoder for the FDSN waveform connector (spec 0450 FR-9). Reads the records an FDSN
// dataselect service returns: the 48-byte fixed header, blockette 1000 (encoding, byte order,
// record length) and 1001 (microsecond offset), and the encodings seismic networks use: 16 and
// 32-bit integers, 32 and 64-bit floats, and Steim-1 and Steim-2 compression. Steim frames carry
// a forward and a reverse integration constant, so every record is checked: the last decoded
// sample must equal the reverse constant, or the trace carries a warning. Pure, no Node imports
// beyond typed arrays; records of one channel that follow each other are joined into one trace.

export interface MiniSeedTrace {
  network: string
  station: string
  location: string
  channel: string
  /** Time of the first sample, milliseconds since the Unix epoch (UTC). */
  startMs: number
  sampleRate: number
  samples: number[]
  /** Problems found while decoding (an integrity mismatch, a skipped record). */
  warnings: string[]
}

const ENCODINGS = new Set([1, 3, 4, 5, 10, 11])

function ascii(v: DataView, at: number, len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) s += String.fromCharCode(v.getUint8(at + i))
  return s.trim()
}

/** Sample rate in Hz from the header's factor and multiplier. */
export function sampleRateOf(factor: number, multiplier: number): number {
  if (factor === 0) return 0
  if (factor > 0 && multiplier > 0) return factor * multiplier
  if (factor > 0 && multiplier < 0) return -factor / multiplier
  if (factor < 0 && multiplier > 0) return -multiplier / factor
  return 1 / (factor * multiplier)
}

const signExtend = (value: number, bits: number): number => (value << (32 - bits)) >> (32 - bits)

function steimDiffs(v: DataView, start: number, end: number, steim2: boolean, little: boolean) {
  const diffs: number[] = []
  let x0 = 0
  let xn = 0
  for (let frame = start, f = 0; frame + 64 <= end; frame += 64, f++) {
    const nibbles = v.getUint32(frame, little)
    for (let w = 1; w < 16; w++) {
      const nib = (nibbles >>> (30 - 2 * w)) & 3
      const word = v.getUint32(frame + 4 * w, little)
      if (f === 0 && w === 1) {
        x0 = word | 0
        continue
      }
      if (f === 0 && w === 2) {
        xn = word | 0
        continue
      }
      if (nib === 0) continue
      if (!steim2) {
        if (nib === 1)
          for (let b = 3; b >= 0; b--) diffs.push(signExtend((word >>> (8 * b)) & 0xff, 8))
        else if (nib === 2)
          for (let h = 1; h >= 0; h--) diffs.push(signExtend((word >>> (16 * h)) & 0xffff, 16))
        else diffs.push(word | 0)
        continue
      }
      if (nib === 1) {
        for (let b = 3; b >= 0; b--) diffs.push(signExtend((word >>> (8 * b)) & 0xff, 8))
        continue
      }
      const dnib = word >>> 30
      const body = word & 0x3fffffff
      if (nib === 2) {
        if (dnib === 1) diffs.push(signExtend(body, 30))
        else if (dnib === 2)
          for (let k = 1; k >= 0; k--) diffs.push(signExtend((body >>> (15 * k)) & 0x7fff, 15))
        else if (dnib === 3)
          for (let k = 2; k >= 0; k--) diffs.push(signExtend((body >>> (10 * k)) & 0x3ff, 10))
      } else {
        if (dnib === 0)
          for (let k = 4; k >= 0; k--) diffs.push(signExtend((body >>> (6 * k)) & 0x3f, 6))
        else if (dnib === 1)
          for (let k = 5; k >= 0; k--) diffs.push(signExtend((body >>> (5 * k)) & 0x1f, 5))
        else if (dnib === 2)
          for (let k = 6; k >= 0; k--) diffs.push(signExtend((body >>> (4 * k)) & 0xf, 4))
      }
    }
  }
  return { diffs, x0, xn }
}

function decodeData(
  v: DataView,
  at: number,
  end: number,
  encoding: number,
  count: number,
  little: boolean,
  warnings: string[],
): number[] {
  const out: number[] = []
  if (encoding === 1)
    for (let i = 0; i < count && at + 2 * i + 2 <= end; i++)
      out.push(v.getInt16(at + 2 * i, little))
  else if (encoding === 3)
    for (let i = 0; i < count && at + 4 * i + 4 <= end; i++)
      out.push(v.getInt32(at + 4 * i, little))
  else if (encoding === 4)
    for (let i = 0; i < count && at + 4 * i + 4 <= end; i++)
      out.push(v.getFloat32(at + 4 * i, little))
  else if (encoding === 5)
    for (let i = 0; i < count && at + 8 * i + 8 <= end; i++)
      out.push(v.getFloat64(at + 8 * i, little))
  else {
    const { diffs, x0, xn } = steimDiffs(v, at, end, encoding === 11, little)
    let x = x0
    for (let i = 0; i < count && i < diffs.length; i++) {
      if (i > 0) x += diffs[i]!
      out.push(x)
    }
    if (out.length !== count)
      warnings.push(`A record held ${out.length} samples, its header says ${count}`)
    else if (out.length && out[out.length - 1] !== xn)
      warnings.push(
        'A Steim record failed its integrity check (last sample differs from the reverse constant)',
      )
  }
  return out
}

/** Decode every record in `bytes` into traces. Throws when the data is not miniSEED 2. */
export function decodeMiniSeed(bytes: Uint8Array): MiniSeedTrace[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const traces: MiniSeedTrace[] = []
  let pos = 0
  let guessLen = 512
  while (pos + 48 <= bytes.length) {
    const quality = String.fromCharCode(v.getUint8(pos + 6))
    if (!/^[DRQM]$/.test(quality) || !/^\d{6}$/.test(ascii(v, pos, 6)))
      throw new Error('The data is not miniSEED version 2')
    const yearBig = v.getUint16(pos + 20, false)
    const little = !(yearBig >= 1900 && yearBig <= 2200)
    const year = v.getUint16(pos + 20, little)
    const doy = v.getUint16(pos + 22, little)
    const count = v.getUint16(pos + 30, little)
    const factor = v.getInt16(pos + 32, little)
    const mult = v.getInt16(pos + 34, little)
    const activity = v.getUint8(pos + 36)
    const nBlock = v.getUint8(pos + 39)
    const timeCorr = v.getInt32(pos + 40, little)
    const dataOffset = v.getUint16(pos + 44, little)
    let blk = v.getUint16(pos + 46, little)
    let encoding = 0
    let recLen = 0
    let dataLittle = little
    let micro = 0
    for (let i = 0; i < nBlock && blk >= 48 && pos + blk + 8 <= bytes.length; i++) {
      const type = v.getUint16(pos + blk, little)
      const next = v.getUint16(pos + blk + 2, little)
      if (type === 1000) {
        encoding = v.getUint8(pos + blk + 4)
        dataLittle = v.getUint8(pos + blk + 5) === 0
        recLen = 2 ** v.getUint8(pos + blk + 6)
      } else if (type === 1001) micro = v.getInt8(pos + blk + 5)
      if (!next) break
      blk = next
    }
    if (!recLen) recLen = guessLen
    guessLen = recLen
    if (pos + recLen > bytes.length) break
    const warnings: string[] = []
    if (ENCODINGS.has(encoding) && count > 0 && dataOffset >= 48) {
      const rate = sampleRateOf(factor, mult)
      const corrected = activity & 2 ? 0 : timeCorr
      const hour = v.getUint8(pos + 24)
      const min = v.getUint8(pos + 25)
      const sec = v.getUint8(pos + 26)
      const fr = v.getUint16(pos + 28, little)
      const t0 =
        Date.UTC(year, 0, 1) +
        (doy - 1) * 86_400_000 +
        hour * 3_600_000 +
        min * 60_000 +
        sec * 1000 +
        (fr + corrected) * 0.1 +
        micro * 0.001
      const samples = decodeData(
        v,
        pos + dataOffset,
        pos + recLen,
        encoding,
        count,
        dataLittle,
        warnings,
      )
      const id = {
        network: ascii(v, pos + 18, 2),
        station: ascii(v, pos + 8, 5),
        location: ascii(v, pos + 13, 2),
        channel: ascii(v, pos + 15, 3),
      }
      const last = traces[traces.length - 1]
      const contiguous =
        last &&
        last.network === id.network &&
        last.station === id.station &&
        last.location === id.location &&
        last.channel === id.channel &&
        last.sampleRate === rate &&
        Math.abs(last.startMs + (last.samples.length / rate) * 1000 - t0) <= 1500 / rate
      if (contiguous) {
        for (const s of samples) last.samples.push(s)
        last.warnings.push(...warnings)
      } else
        traces.push({
          ...id,
          startMs: Math.round(t0 * 1000) / 1000,
          sampleRate: rate,
          samples,
          warnings,
        })
    } else if (count > 0) {
      traces.push({
        network: ascii(v, pos + 18, 2),
        station: ascii(v, pos + 8, 5),
        location: ascii(v, pos + 13, 2),
        channel: ascii(v, pos + 15, 3),
        startMs: 0,
        sampleRate: 0,
        samples: [],
        warnings: [`A record uses data encoding ${encoding}, which this reader does not decode`],
      })
    }
    pos += recLen
  }
  return traces
}
