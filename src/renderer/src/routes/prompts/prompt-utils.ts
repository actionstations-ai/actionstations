import { diffLines } from 'diff'
import { STAGES, type Stage } from '@shared/schemas/scenario'
import type { PromptEntry } from '@shared/schemas/prompt'

export type EditScope = 'global' | 'project'
export type Layer = 'default' | 'global' | 'project'

export interface RawLayers {
  default: string
  global?: string
  project?: string
}

export const LAYER_LABEL: Record<Layer, string> = {
  default: 'Default',
  global: 'Global override',
  project: 'Project override',
}

/** The layer an edit in `scope` is compared against (and falls back to on reset). */
export function layerBelow(scope: EditScope, raw: RawLayers): { layer: Layer; text: string } {
  if (scope === 'project' && raw.global !== undefined) return { layer: 'global', text: raw.global }
  return { layer: 'default', text: raw.default }
}

/** Text the editor starts from: this scope's override, else what it would inherit. */
export function startingText(scope: EditScope, raw: RawLayers): string {
  const own = scope === 'project' ? raw.project : raw.global
  return own ?? layerBelow(scope, raw).text
}

export const hasOverride = (scope: EditScope, raw: RawLayers): boolean =>
  (scope === 'project' ? raw.project : raw.global) !== undefined

export interface StageGroup {
  stage: Stage
  entries: PromptEntry[]
}

/** Entries grouped by pipeline stage, in pipeline order. */
export function groupByStage(entries: PromptEntry[]): StageGroup[] {
  return STAGES.map((stage) => ({
    stage,
    entries: entries.filter((e) => e.stage === stage).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.entries.length > 0)
}

/** The prompt the list shows first (top of the first stage group), the default selection. */
export function firstPromptName(entries: PromptEntry[]): string | undefined {
  return groupByStage(entries)[0]?.entries[0]?.name ?? entries[0]?.name
}

export const stageLabel = (stage: string): string =>
  stage.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

export type DiffKind = 'add' | 'del' | 'same'
export interface DiffLine {
  kind: DiffKind
  text: string
}

/** Unified line diff of `before` → `after`. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const out: DiffLine[] = []
  // A missing final newline must not mark the last line as changed.
  const withEol = (s: string) => (s.endsWith('\n') ? s : s + '\n')
  for (const part of diffLines(withEol(before), withEol(after))) {
    const kind: DiffKind = part.added ? 'add' : part.removed ? 'del' : 'same'
    const lines = part.value.replace(/\n$/, '').split('\n')
    for (const text of lines) out.push({ kind, text })
  }
  return out
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.kind === 'add').length,
    removed: lines.filter((l) => l.kind === 'del').length,
  }
}

export interface LineIssue {
  line: number
  message: string
}

/** Pull line issues out of an IPC VALIDATION error's details. */
export function issuesFrom(details: unknown): LineIssue[] {
  if (!Array.isArray(details)) return []
  return details.filter(
    (d): d is LineIssue =>
      !!d && typeof d === 'object' && typeof d.line === 'number' && typeof d.message === 'string',
  )
}

/** Insert two spaces at the selection (Tab key in the editor). */
export function insertIndent(
  value: string,
  start: number,
  end: number,
): { value: string; caret: number } {
  return { value: value.slice(0, start) + '  ' + value.slice(end), caret: start + 2 }
}

/** Character offset of the start of a 1-based line. */
export function offsetOfLine(value: string, line: number): number {
  let offset = 0
  for (let i = 1; i < line; i++) {
    const next = value.indexOf('\n', offset)
    if (next === -1) return value.length
    offset = next + 1
  }
  return offset
}
