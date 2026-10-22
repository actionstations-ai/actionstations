// The Facility facts editor's working copy (#155): pure helpers so the page component only
// wires events. Entries carry a stable key for React; everything else mirrors the file.
import type { FacilityFactCategory, FacilityFactsFile } from '@shared/ipc/project'
import { FACILITY_LIMITS } from '@shared/ipc/project'

export interface DraftEntry {
  key: number
  value: string
}

export interface DraftCategory {
  id: string
  label: string
  entries: DraftEntry[]
}

export type EntryOrigin = 'extracted' | 'added'

let nextKey = 1
const entry = (value: string): DraftEntry => ({ key: nextKey++, value })

export function draftFrom(view: FacilityFactsFile): DraftCategory[] {
  return view.categories.map((c) => ({
    id: c.id,
    label: c.label,
    entries: c.entries.map(entry),
  }))
}

const normalized = (value: string): string => value.trim().toLowerCase()

/** One line per entry; bullets and blank lines dropped (bulk paste). */
export function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*+]\s+/, '').trim())
    .filter(Boolean)
}

/** Lines not already in the category (case-insensitive), in order, without repeats. */
export function newEntries(category: DraftCategory, lines: string[]): string[] {
  const seen = new Set(category.entries.map((e) => normalized(e.value)))
  const out: string[] = []
  for (const line of lines) {
    const key = normalized(line)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(line)
  }
  return out
}

export function addEntries(
  draft: DraftCategory[],
  id: string,
  lines: string[],
): { draft: DraftCategory[]; added: string[]; skipped: number } {
  const category = draft.find((c) => c.id === id)
  if (!category) return { draft, added: [], skipped: lines.length }
  const added = newEntries(category, lines)
  return {
    draft: draft.map((c) =>
      c.id === id ? { ...c, entries: [...c.entries, ...added.map(entry)] } : c,
    ),
    added,
    skipped: lines.length - added.length,
  }
}

export function setEntry(draft: DraftCategory[], id: string, key: number, value: string) {
  return draft.map((c) =>
    c.id === id
      ? { ...c, entries: c.entries.map((e) => (e.key === key ? { ...e, value } : e)) }
      : c,
  )
}

export function removeEntry(draft: DraftCategory[], id: string, key: number) {
  return draft.map((c) =>
    c.id === id ? { ...c, entries: c.entries.filter((e) => e.key !== key) } : c,
  )
}

/** A category id for a new section name ("Pump stations" → "pump-stations"). */
export function categoryIdFor(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 56) || 'facts'
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}

export function addCategory(draft: DraftCategory[], label: string): DraftCategory[] {
  const id = categoryIdFor(
    label,
    draft.map((c) => c.id),
  )
  return [...draft, { id, label: label.trim(), entries: [] }]
}

/** What the save channel takes. */
export function toSaveCategories(draft: DraftCategory[]) {
  return draft.map((c) => ({
    id: c.id,
    label: c.label,
    entries: c.entries.map((e) => e.value.trim()).filter(Boolean),
  }))
}

/** True when the draft would write something different from the loaded file. */
export function isDirty(view: FacilityFactsFile, draft: DraftCategory[]): boolean {
  const saved = view.categories.map((c) => ({ id: c.id, label: c.label, entries: c.entries }))
  return JSON.stringify(saved) !== JSON.stringify(toSaveCategories(draft))
}

/** "extracted" when the documents give this entry today, else "added" (by the designer). */
export function originOf(category: FacilityFactCategory | undefined, value: string): EntryOrigin {
  const key = normalized(value)
  return category?.extracted.some((e) => normalized(e) === key) ? 'extracted' : 'added'
}

/** Extracted entries the draft no longer has (deleted or edited away). */
export function missingExtracted(
  category: FacilityFactCategory | undefined,
  draft: DraftCategory,
): string[] {
  const have = new Set(draft.entries.map((e) => normalized(e.value)))
  return (category?.extracted ?? []).filter((e) => !have.has(normalized(e)))
}

/** Problems that would make the save fail, per entry key (shown inline). */
export function entryErrors(draft: DraftCategory[]): Map<number, string> {
  const errors = new Map<number, string>()
  for (const c of draft) {
    const seen = new Set<string>()
    for (const e of c.entries) {
      const key = normalized(e.value)
      if (e.value.length > FACILITY_LIMITS.entryLength)
        errors.set(e.key, `Keep entries under ${FACILITY_LIMITS.entryLength} characters.`)
      else if (key && seen.has(key)) errors.set(e.key, 'Already listed; it is saved once.')
      seen.add(key)
    }
  }
  return errors
}

export function entryCount(draft: DraftCategory[]): number {
  return draft.reduce((n, c) => n + c.entries.filter((e) => e.value.trim()).length, 0)
}
