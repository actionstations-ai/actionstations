// NEXRAD Level II (Archive II) decoder (ADR-0095, #659). Reads the volume header, walks the
// LDM records (a 4-byte size and one bzip2 stream each), and decodes message type 31
// (digital radar data) into sweeps of radials with the moments the radar display uses:
// reflectivity (REF), velocity (VEL), spectrum width (SW), differential reflectivity (ZDR),
// differential phase (PHI) and correlation coefficient (RHO). Moment data stays as the
// radar's own integer codes with scale and offset, so a display maps codes straight to a
// color table. A partial file (the first records of a volume, fetched with an HTTP range)
// decodes the sweeps it holds. Format: NOAA ROC "Interface Control Document for the
// RDA/RPG" (2620002), tables XVII and XVIII; the Archive II header is 24 bytes.
import { Bzip2Error, bunzip2 } from './bzip2'

export const MOMENTS = ['REF', 'VEL', 'SW', 'ZDR', 'PHI', 'RHO'] as const
export type MomentName = (typeof MOMENTS)[number]

export interface Moment {
  gates: number
  /** Range to the middle of the first gate, meters. */
  firstGateM: number
  gateSpacingM: number
  scale: number
  offset: number
  /** Codes, radial-major (`radialIndex * gates + gate`); 0 is "below threshold", 1 "range folded". */
  codes: Uint8Array | Uint16Array
}

export interface Sweep {
  /** The radar's elevation cut number (1-based). */
  elevationNumber: number
  /** Mean elevation angle in degrees. */
  elevationDeg: number
  /** Beam azimuth of each radial, degrees clockwise from north. */
  azimuthsDeg: Float32Array
  /** Time of the first radial, ms since the Unix epoch. */
  startMs: number
  /** Whether the sweep ended normally (a partial file ends mid-sweep). */
  complete: boolean
  moments: Partial<Record<MomentName, Moment>>
}

export interface Volume {
  icao: string
  /** Volume header time, ms since the Unix epoch. */
  startMs: number
  latitude: number
  longitude: number
  /** Antenna height above sea level, meters. */
  siteHeightM: number
  sweeps: Sweep[]
}

export class Level2Error extends Error {}

const HEADER_BYTES = 24
const CTM_BYTES = 12
const MSG_HEADER_BYTES = 16
const LEGACY_FRAME_BYTES = 2432
const DAY_MS = 86_400_000

/** The LDM records of the file as [offset, size] of each bzip2 stream; stops at a cut-off record. */
function recordSpans(file: Uint8Array): [number, number][] {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  const out: [number, number][] = []
  for (let at = HEADER_BYTES; at + 4 <= file.length;) {
    const size = Math.abs(view.getInt32(at))
    if (size === 0 || at + 4 + size > file.length) break
    out.push([at + 4, size])
    at += 4 + size
  }
  return out
}

interface Radial {
  elevationNumber: number
  elevationDeg: number
  azimuthDeg: number
  status: number
  timeMs: number
  moments: Partial<Record<MomentName, Moment>>
  vol?: { lat: number; lon: number; heightM: number }
}

function parseMoment(view: DataView, body: Uint8Array, at: number): Moment {
  const gates = view.getUint16(at + 8)
  const wide = view.getUint8(at + 19) === 16
  const start = at + 28
  if (start + gates * (wide ? 2 : 1) > body.length)
    throw new Level2Error('moment data runs past the message')
  let codes: Uint8Array | Uint16Array
  if (wide) {
    codes = new Uint16Array(gates)
    for (let g = 0; g < gates; g++) codes[g] = view.getUint16(start + g * 2)
  } else codes = body.subarray(start, start + gates)
  return {
    gates,
    firstGateM: view.getUint16(at + 10),
    gateSpacingM: view.getUint16(at + 12),
    scale: view.getFloat32(at + 20),
    offset: view.getFloat32(at + 24),
    codes,
  }
}

/** Decode one message 31 body (after the 16-byte message header). */
function parseRadial(body: Uint8Array, headerMs: number): Radial {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength)
  const dateDays = view.getUint16(8)
  const ms = view.getUint32(4)
  const radial: Radial = {
    azimuthDeg: view.getFloat32(12),
    status: view.getUint8(21),
    elevationNumber: view.getUint8(22),
    elevationDeg: view.getFloat32(24),
    timeMs: dateDays > 0 ? (dateDays - 1) * DAY_MS + ms : headerMs,
    moments: {},
  }
  const blocks = view.getUint16(30)
  for (let i = 0; i < Math.min(blocks, 9); i++) {
    const at = view.getUint32(32 + i * 4)
    if (!at || at + 4 > body.length) continue
    const name = String.fromCharCode(body[at + 1]!, body[at + 2]!, body[at + 3]!)
    if (name === 'VOL')
      radial.vol = {
        lat: view.getFloat32(at + 8),
        lon: view.getFloat32(at + 12),
        heightM: view.getInt16(at + 16),
      }
    else if ((MOMENTS as readonly string[]).includes(name))
      radial.moments[name as MomentName] = parseMoment(view, body, at)
  }
  return radial
}

/** The message 31 radials of one decompressed record. */
function* radialsOf(record: Uint8Array): Generator<Radial> {
  const view = new DataView(record.buffer, record.byteOffset, record.byteLength)
  for (let at = 0; at + CTM_BYTES + MSG_HEADER_BYTES <= record.length;) {
    const size = view.getUint16(at + CTM_BYTES) * 2
    const type = view.getUint8(at + CTM_BYTES + 3)
    if (type !== 31) {
      at += LEGACY_FRAME_BYTES
      continue
    }
    const start = at + CTM_BYTES + MSG_HEADER_BYTES
    const end = at + CTM_BYTES + size
    if (size < MSG_HEADER_BYTES + 32 || end > record.length) return
    yield parseRadial(record.subarray(start, end), 0)
    at = end
  }
}

/** Stack the radials of a sweep into per-moment arrays; radials with fewer gates are padded with 0. */
function buildSweep(radials: Radial[]): Sweep {
  const first = radials[0]!
  const azimuthsDeg = Float32Array.from(radials.map((r) => r.azimuthDeg))
  const moments: Sweep['moments'] = {}
  for (const name of MOMENTS) {
    const have = radials.filter((r) => r.moments[name])
    if (!have.length) continue
    const proto = have[0]!.moments[name]!
    const gates = Math.max(...have.map((r) => r.moments[name]!.gates))
    const codes =
      proto.codes instanceof Uint16Array
        ? new Uint16Array(radials.length * gates)
        : new Uint8Array(radials.length * gates)
    radials.forEach((r, i) => {
      const m = r.moments[name]
      if (m) codes.set(m.codes, i * gates)
    })
    moments[name] = { ...proto, gates, codes }
  }
  const elevationDeg = radials.reduce((s, r) => s + r.elevationDeg, 0) / radials.length
  return {
    elevationNumber: first.elevationNumber,
    elevationDeg: Math.round(elevationDeg * 100) / 100,
    azimuthsDeg,
    startMs: first.timeMs,
    complete: [2, 4, 5].includes(radials[radials.length - 1]!.status),
    moments,
  }
}

export interface DecodeOptions {
  /** Keep only these elevation cut numbers (default: all in the file). */
  elevations?: readonly number[]
  /** Stop after this many sweeps (default: no limit). */
  maxSweeps?: number
}

/** Decode a whole or partial Archive II volume. Throws Level2Error on an unreadable file. */
export function decodeVolume(file: Uint8Array, opts: DecodeOptions = {}): Volume {
  const text = String.fromCharCode(...file.subarray(0, 4))
  if (text !== 'AR2V') throw new Level2Error('not an Archive II volume (missing AR2V header)')
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  const volume: Volume = {
    icao: String.fromCharCode(...file.subarray(20, 24)).trim(),
    startMs: (view.getUint32(12) > 0 ? view.getUint32(12) - 1 : 0) * DAY_MS + view.getUint32(16),
    latitude: 0,
    longitude: 0,
    siteHeightM: 0,
    sweeps: [],
  }
  let current: Radial[] = []
  const flush = () => {
    if (current.length) volume.sweeps.push(buildSweep(current))
    current = []
  }
  const keep = (n: number) => !opts.elevations || opts.elevations.includes(n)
  for (const [offset, size] of recordSpans(file)) {
    let record: Uint8Array
    try {
      record = bunzip2(file.subarray(offset, offset + size))
    } catch (e) {
      if (e instanceof Bzip2Error) throw new Level2Error(`corrupt record: ${e.message}`)
      throw e
    }
    for (const radial of radialsOf(record)) {
      if (radial.vol && !volume.latitude)
        Object.assign(volume, {
          latitude: radial.vol.lat,
          longitude: radial.vol.lon,
          siteHeightM: radial.vol.heightM,
        })
      if (current.length && current[0]!.elevationNumber !== radial.elevationNumber) flush()
      if (opts.maxSweeps && volume.sweeps.length >= opts.maxSweeps) return volume
      if (keep(radial.elevationNumber)) current.push(radial)
    }
  }
  flush()
  return volume
}

/** Physical value of a code, or undefined for "below threshold" / "range folded". */
export function momentValue(m: Moment, code: number): number | undefined {
  return code <= 1 ? undefined : (code - m.offset) / m.scale
}
