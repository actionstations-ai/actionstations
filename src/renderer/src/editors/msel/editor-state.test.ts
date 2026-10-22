import { describe, expect, it } from 'vitest'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import { editorReducer, idsOf, initEditor, isDirty, scenarioToSave } from './editor-state'
import { commitCell } from './cell-commit'
import type { Draft } from './model'

const scenario = Scenario.parse(fixture)
const keyOf = (d: Draft, id: string) => d.rows.find((r) => r.row.id === id)!.key
const later = (s: Scenario, at: string): Scenario => ({ ...s, updatedAt: at })

function edited() {
  const s0 = initEditor(scenario)
  const draft = commitCell(s0.draft, { line: keyOf(s0.draft, 'I-01'), col: 'from' }, 'Delta')
  return editorReducer(s0, { type: 'edit', draft })
}

describe('editor state', () => {
  it('tracks dirty edits, undo and redo', () => {
    const s1 = edited()
    expect(isDirty(s1)).toBe(true)
    expect(s1.status).toBe('pending')
    const undone = editorReducer(s1, { type: 'undo' })
    expect(undone.draft.rows[1]!.row.from).toBe('Airline Rep')
    const redone = editorReducer(undone, { type: 'redo' })
    expect(redone.draft.rows[1]!.row.from).toBe('Delta')
    expect(editorReducer(redone, { type: 'redo' })).toBe(redone)
  })

  it('adopts newer server copies when clean, keeps the draft when dirty', () => {
    const clean = initEditor(scenario)
    const newer = later({ ...scenario, title: 'Renamed' }, '2027-01-01T00:00:00.000Z')
    const msel = newer.msel.slice(1)
    const adopted = editorReducer(clean, { type: 'server', scenario: { ...newer, msel } })
    expect(adopted.draft.rows).toHaveLength(23)
    // Rows that keep their id keep their key (focus survives refreshes).
    expect(keyOf(adopted.draft, 'I-01')).toBe(keyOf(clean.draft, 'I-01'))

    const dirty = edited()
    const kept = editorReducer(dirty, { type: 'server', scenario: { ...newer, msel } })
    expect(kept.draft).toBe(dirty.draft)
    expect(kept.base.title).toBe('Renamed')
    expect(scenarioToSave(kept).title).toBe('Renamed')
  })

  it('ignores stale server copies that predate the base', () => {
    const s = initEditor(later(scenario, '2027-01-02T00:00:00.000Z'))
    expect(
      editorReducer(s, { type: 'server', scenario: later(scenario, '2027-01-01T00:00:00.000Z') }),
    ).toBe(s)
  })

  it('stays dirty when edits happened while saving', () => {
    const s1 = edited()
    const ids = idsOf(s1.draft)
    const draft2 = commitCell(s1.draft, { line: keyOf(s1.draft, 'I-02'), col: 'from' }, 'SOC')
    const s2 = editorReducer(editorReducer(s1, { type: 'saving' }), { type: 'edit', draft: draft2 })
    const saved = editorReducer(s2, { type: 'saved', scenario, revision: s1.revision, ids })
    expect(isDirty(saved)).toBe(true)
    expect(saved.status).toBe('pending')
  })

  it('holds edits on CONFLICT and resumes on retry', () => {
    const conflict = editorReducer(edited(), { type: 'conflict', message: 'Generation is running' })
    const more = editorReducer(conflict, { type: 'edit', draft: { ...conflict.draft } })
    expect(more.status).toBe('conflict')
    expect(editorReducer(more, { type: 'retry' }).status).toBe('pending')
  })

  it('carries row id renames into rubric links on save', () => {
    const s0 = initEditor(scenario)
    const draft = commitCell(s0.draft, { line: keyOf(s0.draft, 'I-09'), col: 'id' }, 'I-09x')
    const s1 = editorReducer(s0, { type: 'edit', draft })
    const metric = scenarioToSave(s1).rubric!.metrics[0]!
    expect(metric.linkedInjectIds).toEqual(['I-09x', 'I-10'])
  })
})
