// The EMS, fire and hazmat decision forms reach live play and Facilitate (spec 0456 FR-10): each
// toolkit form converts to a live form the live schema accepts, within its field limits.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { DecisionForm } from '@shared/schemas/decisions'
import { ToolkitSchema } from '@shared/toolkits'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { liveFormsOf } = await import('../decision-forms')

describe.each(['mci_triage', 'hazmat', 'dispatch'])('%s decision forms', (id) => {
  const toolkit = ToolkitSchema.parse(
    JSON.parse(readFileSync(resolve('packs/toolkits', `${id}.json`), 'utf8')),
  )
  const forms = liveFormsOf([toolkit], 'Harlan Spur')

  it('become live forms the schema accepts', () => {
    expect(forms.length).toBe(toolkit.decisionForms.length)
    for (const f of forms) expect(() => DecisionForm.parse(f)).not.toThrow()
  })
})

describe('protective actions form', () => {
  it('offers the incident area on the map field', () => {
    const toolkit = ToolkitSchema.parse(
      JSON.parse(readFileSync(resolve('packs/toolkits/hazmat.json'), 'utf8')),
    )
    const [form] = liveFormsOf([toolkit], 'Harlan Spur') as {
      fields: { type: string; areas?: { label: string }[] }[]
    }[]
    const area = form!.fields.find((f) => f.type === 'area')
    expect(area?.areas?.[0]?.label).toBe('Harlan Spur')
  })
})
