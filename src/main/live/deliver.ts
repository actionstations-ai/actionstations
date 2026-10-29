/**
 * Pure parts of delivering an inject to devices (spec 0412): who a row is for, and the exact
 * text a screen reader gets. No I/O here, so both are unit-tested against real template data.
 */
import type { MselRow } from '@shared/schemas/scenario'
import { injectTypeInfo } from '@shared/taxonomy'

export { resolveTargets } from '@shared/live/targets'

export interface ReleaseText {
  headline: string
  body: string
  altText: string
}

/** The sentence the Facilitate page uses as an image's alt text: the title, then the type. */
export function injectAltText(inject: {
  title?: string
  type?: string
  mselRowId?: string
}): string {
  const title = inject.title?.trim() || (inject.mselRowId ? `Inject ${inject.mselRowId}` : 'Inject')
  const type = inject.type ? (injectTypeInfo(inject.type)?.label ?? inject.type) : undefined
  return `${title}${type ? ` — ${type}` : ''}`
}

function humanize(name: string): string {
  const spaced = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function scalar(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

function describeValue(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.flatMap((item) => {
      if (item && typeof item === 'object') {
        const parts = Object.entries(item as Record<string, unknown>)
          .map(([k, x]) => (scalar(x) ? `${humanize(k)}: ${scalar(x)}` : ''))
          .filter(Boolean)
        return parts.length ? [`- ${parts.join(', ')}`] : []
      }
      return scalar(item) ? [`- ${scalar(item)}`] : []
    })
  }
  if (v && typeof v === 'object') return describeValue([v])
  return scalar(v) ? [scalar(v)] : []
}

interface SchemaLike {
  properties?: Record<string, { title?: unknown } | undefined>
}

/** FR-6: `Label: value` lines in the schema's property order; the row's event when no fields. */
export function injectText(
  inject: { title?: string; type?: string; mselRowId?: string; fields?: Record<string, unknown> },
  schema: SchemaLike,
  imageSlots: readonly string[],
  row: Pick<MselRow, 'event'>,
): ReleaseText {
  const fields = inject.fields ?? {}
  const known = Object.keys(schema.properties ?? {})
  const order = [...known, ...Object.keys(fields).filter((k) => !known.includes(k))]
  const lines: string[] = []
  for (const key of order) {
    if (imageSlots.includes(key)) continue
    const values = describeValue(fields[key])
    if (!values.length) continue
    const title = schema.properties?.[key]?.title
    const label = typeof title === 'string' && title.trim() ? title.trim() : humanize(key)
    if (values.length === 1 && !values[0]!.startsWith('- ')) lines.push(`${label}: ${values[0]}`)
    else lines.push(`${label}:`, ...values)
  }
  return {
    headline: inject.title?.trim() ?? '',
    body: (lines.length ? lines.join('\n') : row.event.trim()).slice(0, 20_000),
    altText: injectAltText(inject).slice(0, 2_000),
  }
}

/** WebVTT captions from an inject's voice lines; each cue lasts as long as its words take to say. */
export function captionsFromVoiceLines(lines: readonly { text?: string }[]): string | undefined {
  const cues: string[] = []
  let at = 0
  for (const line of lines) {
    const text = line.text?.trim()
    if (!text) continue
    const dur = Math.max(2, Math.ceil(text.split(/\s+/).length / 2.5))
    cues.push(`${stamp(at)} --> ${stamp(at + dur)}\n${text}`)
    at += dur
  }
  return cues.length ? `WEBVTT\n\n${cues.join('\n\n')}\n`.slice(0, 20_000) : undefined
}

function stamp(sec: number): string {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0')
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${h}:${m}:${s}.000`
}
