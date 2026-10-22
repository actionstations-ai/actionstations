// Deterministic field normalisers for inject_text output (#106): the formatting cues small
// models drop (carrier code + number and capitals on a departure board, a 24h clock), optional
// fields filled with placeholders ("N/A", "0:00") and a video badge on a photo post. Each
// function returns a note per change so the job log shows what was normalised.
import type { MselRow } from '@shared/schemas'
import { inferCarrier, type CarrierContext } from './carrier'

type Fields = Record<string, unknown>

const PLACEHOLDER = /^(?:|n\/?a|none|null|undefined|tbd|-+|—|0:00|00:00|0)$/i
const VIDEO_WORDS = /\b(?:video|footage|clip|livestream|reel|recording)\b/i

/** Optional top-level string fields the model filled with a placeholder are removed. */
export function dropPlaceholders(fields: Fields, required: Iterable<string>): string[] {
  const keep = new Set(required)
  const dropped: string[] = []
  for (const [k, v] of Object.entries(fields)) {
    if (keep.has(k) || typeof v !== 'string' || !PLACEHOLDER.test(v.trim())) continue
    delete fields[k]
    dropped.push(`${k} ("${v}")`)
  }
  return dropped
}

/** A post's video badge only when the row or the attachment brief speaks of video. */
export function dropVideoBadge(fields: Fields, row: MselRow): boolean {
  if (fields.videoDuration === undefined) return false
  const about = [row.event, fields.attachedImageBrief, fields.attachedImageAlt, fields.text]
    .map((v) => (typeof v === 'string' ? v : ''))
    .join('\n')
  if (VIDEO_WORDS.test(about)) return false
  delete fields.videoDuration
  return true
}

export { carrierCode } from './carrier'

/**
 * "dl1245" / "Flight 1245" + "Delta" → "DL 1245". A bare number takes the carrier
 * inferCarrier finds (airline column, story, brand alias, board majority); with none it stays.
 */
export function normalizeFlight(flight: string, airline?: string, ctx?: CarrierContext): string {
  const raw = flight.trim().replace(/^flight\s+#?/i, '')
  const m = /^([A-Z0-9]{2})\s*(\d{1,4}[A-Z]?)$/i.exec(raw)
  if (m && /[A-Z]/i.test(m[1]!)) return `${m[1]!.toUpperCase()} ${m[2]!.toUpperCase()}`
  const digits = /^#?(\d{1,4})$/.exec(raw)
  if (digits) {
    const code = inferCarrier(digits[1]!, airline, ctx)
    return code ? `${code} ${digits[1]}` : digits[1]!
  }
  return raw.toUpperCase()
}

/** "9:40" → "09:40", "2:15 PM" → "14:15"; words like NOW pass through. */
export function to24h(time: string): string {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*([ap]\.?m\.?)?\s*$/i.exec(time)
  if (!m) return time.trim().toUpperCase()
  let h = Number(m[1])
  const ampm = m[3]?.toLowerCase().replace(/\./g, '')
  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

const upper = (v: unknown): unknown => (typeof v === 'string' ? v.toUpperCase().trim() : v)

/** Departure board rows: capitals, carrier code + number, 24h clock. */
export function normalizeFidsRows(
  fields: Fields,
  ctx: Omit<CarrierContext, 'boardFlights'> = {},
): string[] {
  if (!Array.isArray(fields.rows)) return []
  const notes: string[] = []
  const rows = fields.rows as Fields[]
  const boardFlights = () =>
    rows.flatMap((r) => (r && typeof r.flight === 'string' ? [r.flight] : []))
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    for (const key of ['dest', 'status', 'gate', 'airline', 'remarks'] as const) {
      const v = upper(r[key])
      if (v !== r[key]) {
        notes.push(`${key} "${String(r[key])}" → "${String(v)}"`)
        r[key] = v
      }
    }
    if (typeof r.flight === 'string') {
      const airline = typeof r.airline === 'string' ? r.airline : undefined
      const f = normalizeFlight(r.flight, airline, { ...ctx, boardFlights: boardFlights() })
      if (f !== r.flight) {
        notes.push(`flight "${r.flight}" → "${f}"`)
        r.flight = f
      }
    }
    if (typeof r.time === 'string') {
      const t = to24h(r.time)
      if (t !== r.time) {
        notes.push(`time "${r.time}" → "${t}"`)
        r.time = t
      }
    }
  }
  if (typeof fields.clock === 'string') fields.clock = to24h(fields.clock)
  return notes
}

const SOCIAL = new Set(['tweet', 'facebook_post', 'instagram_post', 'tiktok_video_card'])

export interface NormalizeInput {
  type: string
  fields: Fields
  row: MselRow
  /** Required top-level fields of the template schema (never dropped). */
  required: string[]
  /** Story text and brand aliases a bare FIDS flight number can take its carrier from. */
  carrier?: Omit<CarrierContext, 'boardFlights'>
}

/** Apply every normaliser that applies to the type; returns the notes for the log. */
export function normalizeFields(input: NormalizeInput): string[] {
  const { type, fields, row, required } = input
  const notes: string[] = []
  const dropped = dropPlaceholders(fields, required)
  if (dropped.length) notes.push(`dropped placeholder field(s) ${dropped.join(', ')}`)
  if (SOCIAL.has(type) && dropVideoBadge(fields, row))
    notes.push('dropped videoDuration: no video in this post')
  if (type === 'fids_board') notes.push(...normalizeFidsRows(fields, input.carrier))
  return notes
}
