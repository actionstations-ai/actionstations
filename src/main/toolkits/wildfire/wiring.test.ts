// The wildfire toolkit on the shared registries: every id it names has code behind it and its
// format rules run through the field lint registry.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.1',
    getPath: () => tmpdir(),
    isPackaged: false,
    getAppPath: () => resolve('.'),
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const { ToolkitSchema } = await import('@shared/toolkits')
const { unknownCapabilityWarnings } = await import('../capabilities')
const { fieldLintIssues } = await import('../lint-rules')

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/wildfire.json'), 'utf8')),
)

describe('capabilities', () => {
  it('has code behind every figure kind, connector, metric and lint rule the toolkit names', () => {
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })
})

describe('lint rules', () => {
  const notice = (headline: string, zones: { zone: string; status: string }[], action: string) => ({
    agency: 'Calloway County Sheriff',
    incidentName: 'Cinder Creek Fire',
    issuedAt: '4:55 PM',
    headline,
    zones,
    action,
  })
  it('flags a zone the message names that the zone table does not list', () => {
    const issues = fieldLintIssues(
      'wildfire_evacuation_notice',
      notice(
        'Evacuation order for Zone C-1',
        [{ zone: 'C-1', status: 'Evacuation order' }],
        'Leave now. Zone C-2 be ready.',
      ),
    )
    expect(issues.map((i) => i.message)).toEqual([expect.stringMatching(/Zone C-2/)])
  })
  it('accepts a consistent notice and a notice with no zone table', () => {
    expect(
      fieldLintIssues(
        'wildfire_evacuation_notice',
        notice(
          'Evacuation order for Zone C-1',
          [{ zone: 'C-1', status: 'Evacuation order' }],
          'Leave now.',
        ),
      ),
    ).toEqual([])
    expect(fieldLintIssues('wildfire_evacuation_notice', { headline: 'x' })).toEqual([])
  })
  it('flags a containment percent that disagrees with the structured value', () => {
    const issues = fieldLintIssues('wildfire_incident_summary', {
      containmentPct: 5,
      outlook: 'The fire is 30 percent contained and crews hold the west flank.',
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]?.path).toBe('fields.containmentPct')
  })
  it('leaves other inject types alone', () => {
    expect(fieldLintIssues('memo', { containmentPct: 5, outlook: '90 percent contained' })).toEqual(
      [],
    )
  })
})
