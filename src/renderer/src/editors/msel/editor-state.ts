// Editor state machine: the draft, session undo/redo, and save bookkeeping. Pure reducer.
import type { Rubric, Scenario } from '@shared/schemas/scenario'
import { draftFromScenario, draftMsel, type Draft } from './model'

export const UNDO_LIMIT = 200

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'conflict' | 'error'

export interface EditorState {
  /** Latest scenario known from main (query or save response). */
  base: Scenario
  draft: Draft
  past: Draft[]
  future: Draft[]
  /** Bumped on every local change; a save only clears `dirty` if nothing changed meanwhile. */
  revision: number
  savedRevision: number
  status: SaveStatus
  error?: string
  /** Row key → id as last saved, to carry id renames into rubric links. */
  savedIds: Record<string, string>
}

export type EditorAction =
  | { type: 'edit'; draft: Draft }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'server'; scenario: Scenario }
  | { type: 'reset'; scenario: Scenario }
  | { type: 'saving' }
  | { type: 'saved'; scenario: Scenario; revision: number; ids: Record<string, string> }
  | { type: 'conflict'; message: string }
  | { type: 'failed'; message: string }
  | { type: 'retry' }

export const idsOf = (d: Draft): Record<string, string> =>
  Object.fromEntries(d.rows.map((r) => [r.key, r.row.id]))

export function initEditor(scenario: Scenario): EditorState {
  const draft = draftFromScenario(scenario)
  return {
    base: scenario,
    draft,
    past: [],
    future: [],
    revision: 0,
    savedRevision: 0,
    status: 'idle',
    savedIds: idsOf(draft),
  }
}

export const isDirty = (s: EditorState): boolean => s.revision !== s.savedRevision

function changed(s: EditorState, draft: Draft, past: Draft[], future: Draft[]): EditorState {
  const blocked = s.status === 'conflict'
  return {
    ...s,
    draft,
    past,
    future,
    revision: s.revision + 1,
    status: blocked ? 'conflict' : 'pending',
  }
}

function adopt(s: EditorState, scenario: Scenario): EditorState {
  const draft = draftFromScenario(scenario, s.draft)
  return {
    ...s,
    base: scenario,
    draft,
    savedRevision: s.revision,
    status: 'idle',
    savedIds: idsOf(draft),
  }
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'edit':
      if (a.draft === s.draft) return s
      return changed(s, a.draft, [...s.past, s.draft].slice(-UNDO_LIMIT), [])
    case 'undo': {
      const prev = s.past.at(-1)
      return prev ? changed(s, prev, s.past.slice(0, -1), [s.draft, ...s.future]) : s
    }
    case 'redo': {
      const next = s.future[0]
      return next ? changed(s, next, [...s.past, s.draft], s.future.slice(1)) : s
    }
    case 'server':
      // Unsaved edits win: keep the draft, but remember the newer base for the next save.
      // Ignore stale copies (a refetch that predates our own save).
      if (a.scenario.updatedAt <= s.base.updatedAt) return s
      return isDirty(s) ? { ...s, base: a.scenario } : adopt(s, a.scenario)
    case 'reset':
      return { ...adopt(s, a.scenario), past: [], future: [] }
    case 'saving':
      return { ...s, status: 'saving' }
    case 'saved': {
      const clean = a.revision === s.revision
      return {
        ...s,
        base: a.scenario,
        savedRevision: a.revision,
        status: clean ? 'saved' : 'pending',
        savedIds: a.ids,
      }
    }
    case 'conflict':
      return { ...s, status: 'conflict', error: a.message }
    case 'failed':
      return { ...s, status: 'error', error: a.message }
    case 'retry':
      return { ...s, status: isDirty(s) ? 'pending' : 'idle' }
  }
}

/** Rubric with links to renamed rows rewritten (old id → new id since the last save). */
export function remapRubric(
  rubric: Rubric | undefined,
  savedIds: Record<string, string>,
  draft: Draft,
): Rubric | undefined {
  if (!rubric) return rubric
  const renames = new Map<string, string>()
  for (const r of draft.rows) {
    const old = savedIds[r.key]
    if (old && old !== r.row.id) renames.set(old, r.row.id)
  }
  if (!renames.size) return rubric
  return {
    metrics: rubric.metrics.map((m) => ({
      ...m,
      linkedInjectIds: m.linkedInjectIds.map((id) => renames.get(id) ?? id),
    })),
  }
}

/** The scenario to save: newest base + the edited phases/MSEL (+ rubric link renames). */
export function scenarioToSave(s: EditorState): Scenario {
  const rubric = remapRubric(s.base.rubric, s.savedIds, s.draft)
  return {
    ...s.base,
    phases: s.draft.phases,
    msel: draftMsel(s.draft),
    ...(rubric ? { rubric } : {}),
  }
}
