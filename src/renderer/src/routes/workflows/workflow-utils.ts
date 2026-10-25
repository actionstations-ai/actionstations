// Pure helpers for the Workflows page: binding sources, editor rows ↔ bindings, previews.
import type { WorkflowBinding, WorkflowEntry } from '@shared/ipc'

export type BindingSource = WorkflowBinding['source']
export type MediaTypeT = WorkflowEntry['mediaType']

export const MEDIA_TYPES: { id: MediaTypeT; label: string }[] = [
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio (TTS)' },
]

/** Sources a row can bind to, with the label shown in the select. '' = keep workflow value. */
export const SOURCE_OPTIONS: { id: BindingSource | ''; label: string }[] = [
  { id: '', label: 'Keep workflow value' },
  { id: 'imagePrompt', label: 'Image prompt (+ style)' },
  { id: 'videoPrompt', label: 'Video prompt' },
  { id: 'negativePrompt', label: 'Negative prompt' },
  { id: 'seed', label: 'Seed' },
  { id: 'width', label: 'Width' },
  { id: 'height', label: 'Height' },
  { id: 'durationSec', label: 'Duration (s → frames)' },
  { id: 'inputImage', label: 'Input image' },
  { id: 'text', label: 'Voice text' },
  { id: 'voiceStyle', label: 'Voice style' },
  { id: 'speaker', label: 'Speaker' },
  { id: 'referenceAudio', label: 'Reference audio' },
  { id: 'literal', label: 'Fixed value…' },
  { id: 'lighting', label: 'By lighting…' },
]

/** Sources whose binding carries a value the user types (JSON). */
export const hasTypedValue = (source: BindingSource | ''): boolean =>
  source === 'literal' || source === 'lighting'

export interface InputRow {
  nodeId: string
  classType: string
  title?: string
  inputName: string
  value: unknown
}

export interface RowBinding {
  source: BindingSource | ''
  /** Text of a fixed value (literal) or of the per-lighting map ({"dark": 0.92}); parsed as
   *  JSON when possible. */
  literal: string
}

export const rowKey = (r: { nodeId: string; inputName: string }): string =>
  `${r.nodeId}\u0000${r.inputName}`

export function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

/** Value text when a row switches source: the workflow value, as `{"dark": …}` for lighting. */
export function initialValueText(
  source: BindingSource | '',
  previous: RowBinding,
  workflowValue: unknown,
): string {
  if (source === 'lighting')
    return previous.source === 'lighting' && previous.literal
      ? previous.literal
      : JSON.stringify({ dark: workflowValue })
  if (previous.source === 'lighting') return formatValue(workflowValue)
  return previous.literal || formatValue(workflowValue)
}

/** Binding state per row, from the saved bindings. */
export function rowsFromBindings(bindings: WorkflowBinding[]): Record<string, RowBinding> {
  const out: Record<string, RowBinding> = {}
  for (const b of bindings) {
    const key = rowKey({ nodeId: b.target[0], inputName: b.target[2] })
    out[key] = {
      source: b.source,
      literal: hasTypedValue(b.source) ? formatValue(b.value) : '',
    }
  }
  return out
}

/** Literal text → value: numbers / booleans / JSON when it parses, else the string itself. */
export function parseLiteral(text: string): unknown {
  const t = text.trim()
  if (t === '') return ''
  try {
    return JSON.parse(t)
  } catch {
    return text
  }
}

export function bindingsFromRows(rows: Record<string, RowBinding>): WorkflowBinding[] {
  const out: WorkflowBinding[] = []
  for (const [key, row] of Object.entries(rows)) {
    if (!row.source) continue
    const [nodeId, inputName] = key.split('\u0000') as [string, string]
    out.push({
      target: [nodeId, 'inputs', inputName],
      source: row.source,
      ...(hasTypedValue(row.source) ? { value: parseLiteral(row.literal) } : {}),
    })
  }
  return out.sort(
    (a, b) => Number(a.target[0]) - Number(b.target[0]) || a.target[2].localeCompare(b.target[2]),
  )
}

/** data: URL → object URL (the renderer CSP allows blob: for <video>, not data:). */
export function dataUrlToObjectUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'application/octet-stream'
  const bin = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}

export function groupByMedia(list: WorkflowEntry[]): Record<MediaTypeT, WorkflowEntry[]> {
  const out: Record<MediaTypeT, WorkflowEntry[]> = { image: [], video: [], audio: [] }
  for (const w of list) out[w.mediaType].push(w)
  return out
}

/** One line naming the node classes ComfyUI lacks for this workflow. */
export function missingSummary(w: WorkflowEntry): string | undefined {
  if (!w.missingNodes?.length) return undefined
  const shown = w.missingNodes.slice(0, 4).join(', ')
  const more = w.missingNodes.length > 4 ? ` and ${w.missingNodes.length - 4} more` : ''
  return `Missing nodes: ${shown}${more}`
}
