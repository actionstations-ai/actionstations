// The editable part of an inject, kept per inject while the user works. Drafts live in a small
// store (not component state) so moving between injects, or a refetch triggered by
// project:changed, never throws unsaved edits away. Saving merges the draft onto the latest
// stored inject, so assets and versions written meanwhile by jobs are never overwritten.
import { create } from 'zustand'
import type { Inject } from '@shared/schemas/inject'

export interface InjectDraft {
  title: string
  type: string
  fields: Record<string, unknown>
  deliveryMode: Inject['deliveryMode']
  instructorNote: string
  citations: Inject['citations']
  includeInDeck: boolean
  mediaBrief: Inject['mediaBrief']
}

export function draftOf(inject: Inject): InjectDraft {
  return {
    title: inject.title,
    type: inject.type,
    fields: inject.fields,
    deliveryMode: inject.deliveryMode,
    instructorNote: inject.instructorNote ?? '',
    citations: inject.citations,
    includeInDeck: inject.includeInDeck,
    mediaBrief: inject.mediaBrief,
  }
}

/** Stable JSON (sorted keys) so key order never makes a draft look dirty. */
export function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : val,
  )
}

export const sameDraft = (a: InjectDraft, b: InjectDraft): boolean =>
  stableJson(a) === stableJson(b)

/** The inject to save: the latest stored copy with the draft's editable fields on top. */
export function applyDraft(latest: Inject, draft: InjectDraft): Inject {
  const next: Inject = {
    ...latest,
    title: draft.title,
    type: draft.type,
    fields: draft.fields,
    deliveryMode: draft.deliveryMode,
    citations: draft.citations,
    includeInDeck: draft.includeInDeck,
  }
  if (draft.instructorNote.trim()) next.instructorNote = draft.instructorNote
  else delete next.instructorNote
  if (draft.mediaBrief) next.mediaBrief = draft.mediaBrief
  else delete next.mediaBrief
  return next
}

export const draftKey = (scenarioId: string, injectId: string): string =>
  `${scenarioId}/${injectId}`

interface DraftStore {
  drafts: Record<string, InjectDraft>
  put: (key: string, draft: InjectDraft) => void
  drop: (key: string) => void
}

export const useDrafts = create<DraftStore>((set) => ({
  drafts: {},
  put: (key, draft) => set((s) => ({ drafts: { ...s.drafts, [key]: draft } })),
  drop: (key) =>
    set((s) => {
      const { [key]: _gone, ...rest } = s.drafts
      return { drafts: rest }
    }),
}))
