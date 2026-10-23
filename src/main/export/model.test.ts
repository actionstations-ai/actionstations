// #207: an orphan inject (its MSEL row was removed) is left out of the export, as from the deck.
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))
const { fixtureModel } = await import('../../../tests/fixtures/export/model')
const { liveInjects } = await import('./model')

describe('liveInjects', () => {
  it('keeps injects whose row exists and drops orphans', () => {
    const model = fixtureModel()
    expect(liveInjects(model.scenario, model.injects)).toEqual(model.injects)
    const orphan = { ...model.injects[0]!, id: 'ORPHAN', mselRowId: 'I-99' }
    const kept = liveInjects(model.scenario, [...model.injects, orphan])
    expect(kept.map((i) => i.id)).not.toContain('ORPHAN')
    expect(kept).toHaveLength(model.injects.length)
  })
})
