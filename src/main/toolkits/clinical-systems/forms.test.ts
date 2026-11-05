// The clinical systems toolkit's decision forms reach live play and Facilitate (spec 0451 FR-10):
// every form converts to a live form the live schema accepts, and the metrics read decisions
// by the form id.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DecisionForm as LiveForm } from '@shared/schemas/decisions'
import { ToolkitSchema } from '@shared/toolkits'
import { liveFormsOf } from '../decision-forms'

const toolkit = ToolkitSchema.parse(
  JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', '..', 'packs', 'toolkits', 'clinical_systems.json'),
      'utf8',
    ),
  ),
)

describe('clinical systems decision forms in live play', () => {
  const live = liveFormsOf([toolkit])

  it('converts every form to a valid live form with the same id', () => {
    expect(live).toHaveLength(toolkit.decisionForms.length)
    live.forEach((f, i) => {
      const parsed = LiveForm.safeParse(f)
      expect(parsed.success, toolkit.decisionForms[i]!.id).toBe(true)
      expect(parsed.data?.id).toBe(toolkit.decisionForms[i]!.id)
    })
  })

  it('names the forms the metrics read', () => {
    const ids = toolkit.decisionForms.map((f) => f.id)
    expect(ids).toEqual(
      expect.arrayContaining(['declare_downtime', 'set_restore_order', 'return_to_normal']),
    )
  })
})
