import { describe, expect, it } from 'vitest'
import { SCENARIO_DOCS, type Scenario } from '@shared/schemas/scenario'
import { DOC_LABELS, DOC_ORDER, DOC_STAGE, lastGenerated } from './owners'

describe('document list (#224)', () => {
  it('lists every document kind, the handouts last', () => {
    expect([...DOC_ORDER].sort()).toEqual([...SCENARIO_DOCS].sort())
    expect(DOC_ORDER.slice(-2)).toEqual(['handouts', 'controller_handouts'])
    expect(DOC_LABELS.handouts).toBe('Player handouts')
    expect(DOC_LABELS.controller_handouts).toBe('Controller materials')
  })

  it('has no generation stage for handouts, so nothing offers to regenerate them', () => {
    expect(DOC_STAGE.handouts).toBeUndefined()
    expect(DOC_STAGE.controller_handouts).toBeUndefined()
    expect(lastGenerated({ provenance: [] } as unknown as Scenario, undefined)).toBeUndefined()
  })
})
