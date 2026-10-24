// Pure helpers for MSEL cells: citation labels, the To column, list options, validation.
import type { Role } from '@shared/schemas/project'
import { exerciseMinutes, type Citation } from '@shared/schemas/common'
import type { LintWarning, MselRow } from '@shared/schemas/scenario'
import {
  injectTypeInfo,
  injectTypes,
  isInjectTypeHidden,
  type InjectTypeInfo,
} from '@shared/taxonomy'
import { injectTypeSourceLabel } from '../../lib/template-source'
import type { CitationItem, ListOption } from './CellEditors'
import { parseExerciseTime } from './model'

export const ALL = '__all__'

/** "TIRP › Section 13 › 13.6 Scenario C…" → "TIRP 13.6" (document short name + section). */
export function citationShort(c: Citation): string {
  const parts = c.headingPath.split('›').map((p) => p.trim())
  const doc = parts[0] || c.documentTitle
  const last = parts.at(-1) ?? ''
  const num = /^(?:§\s*)?(\d+(?:\.\d+)*)/.exec(last)?.[1] ?? /(\d+(?:\.\d+)*)/.exec(last)?.[1]
  return num ? `${doc} ${num}` : parts.length > 1 ? `${doc} ${last.slice(0, 12)}` : doc
}

export function citationTitle(c: Citation): string {
  return [c.headingPath, c.page ? `p. ${c.page}` : '', c.quote ? `“${c.quote}”` : '']
    .filter(Boolean)
    .join('\n')
}

export const citationItems = (cs: Citation[]): CitationItem[] =>
  cs.map((c) => ({ label: citationShort(c), title: citationTitle(c) }))

export function toDisplay(row: MselRow, roles: Role[]): string {
  if (row.toLabel) return row.toLabel
  const names = row.toRoleIds.map((id) => {
    const r = roles.find((x) => x.id === id)
    return r?.abbreviation || r?.name || id
  })
  return names.join(', ') || '—'
}

export const toValues = (row: MselRow): string[] =>
  row.toLabel === 'All' && !row.toRoleIds.length ? [ALL] : row.toRoleIds

/** Apply the To editor's selection: "All" or a set of roles (label derived from roles). */
export function applyTo(row: MselRow, values: string[]): MselRow {
  const { toLabel: _old, ...rest } = row
  if (values.includes(ALL)) return { ...rest, toRoleIds: [], toLabel: 'All' }
  return { ...rest, toRoleIds: values }
}

export const roleOptions = (roles: Role[]): ListOption[] => [
  { value: ALL, label: 'All', hint: 'every player' },
  ...roles.map((r) => ({
    value: r.id,
    label: r.abbreviation || r.name,
    ...(r.abbreviation ? { hint: r.name } : {}),
  })),
]

/**
 * Format choices: built-in types, then those user and pack templates add (#261); types of a
 * disabled bundled pack are left out (ADR-0020).
 */
export function formatOptions(
  types: readonly InjectTypeInfo[] = injectTypes().filter((t) => !isInjectTypeHidden(t.id)),
): ListOption[] {
  return [
    { value: '', label: 'None' },
    ...types.map((t) => {
      const source = injectTypeSourceLabel(t)
      const render = t.render.includes('template') ? 'template' : t.render.join(', ')
      return {
        value: t.id,
        label: t.label,
        hint: `${t.category} · ${render}${source ? ` · ${source}` : ''}`,
      }
    }),
  ]
}

export const formatLabel = (format?: string): string =>
  format ? (injectTypeInfo(format)?.label ?? format) : '—'

/** Wall clock at an exercise time, inferred from the nearest row that has one. */
export function wallClockAt(rows: MselRow[], minutes: number): string {
  const ref = rows.find((r) => r.wallClock)
  if (!ref?.wallClock) return ''
  const [h = 0, m = 0] = ref.wallClock.split(':').map(Number)
  const t = (((h * 60 + m + minutes - exerciseMinutes(ref.time)) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** Row id → messages, for per-row warning icons. */
export function warningsByRow(warnings: LintWarning[] | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const w of warnings ?? []) {
    if (!w.rowId) continue
    out.set(w.rowId, [...(out.get(w.rowId) ?? []), w.message])
  }
  return out
}

export const validateTime = (v: string): string | null =>
  parseExerciseTime(v) === null ? 'Use H:MM, e.g. 1:15' : null

/** One-line summary of how a snapshot's MSEL differs from the current one. */
export function describeSnapshot(snapshot: MselRow[], current: MselRow[]): string {
  const now = new Map(current.map((r) => [r.id, JSON.stringify(r)]))
  const then = new Set(snapshot.map((r) => r.id))
  const restores = snapshot.filter((r) => !now.has(r.id)).map((r) => r.id)
  const drops = current.filter((r) => !then.has(r.id)).map((r) => r.id)
  const changed = snapshot.filter((r) => now.has(r.id) && now.get(r.id) !== JSON.stringify(r))
  const parts = [
    `${snapshot.length} rows`,
    restores.length ? `brings back ${restores.join(', ')}` : '',
    drops.length ? `drops ${drops.join(', ')}` : '',
    changed.length
      ? `${changed.length} row${changed.length > 1 ? 's' : ''} differ (${changed.map((r) => r.id).join(', ')})`
      : '',
  ].filter(Boolean)
  return parts.length > 1 ? `${parts.join('; ')}.` : `${parts[0]}; same as now.`
}
