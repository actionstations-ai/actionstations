import { describe, expect, it } from 'vitest'
import { SCENARIO_DOCS, type Scenario } from '@shared/schemas/scenario'
import { DOC_LABELS, DOC_ORDER, DOC_STAGE, lastGenerated } from './owners'

describe('document list (#224)', () => {
  it('lists every document kind: the handouts after the generated ones, the AAR/IP last', () => {
    expect([...DOC_ORDER].sort()).toEqual([...SCENARIO_DOCS].sort())
    expect(DOC_ORDER.slice(-3)).toEqual(['handouts', 'controller_handouts', 'aar'])
    expect(DOC_LABELS.handouts).toBe('Player handouts')
    expect(DOC_LABELS.controller_handouts).toBe('Controller materials')
    expect(DOC_LABELS.aar).toBe('After-Action Report / Improvement Plan')
  })

  it('has no generation stage for handouts, so nothing offers to regenerate them', () => {
    expect(DOC_STAGE.handouts).toBeUndefined()
    expect(DOC_STAGE.controller_handouts).toBeUndefined()
    // The AAR/IP is drafted on demand by its own stage (#419), outside the pipeline.
    expect(DOC_STAGE.aar).toBe('aar')
    expect(lastGenerated({ provenance: [] } as unknown as Scenario, undefined)).toBeUndefined()
  })
})
