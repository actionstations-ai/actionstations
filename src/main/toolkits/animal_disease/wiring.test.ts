// The animal disease toolkit on the shared wiring (spec 0448, spec 0460): every capability it
// names has code, its generators write datasets the framework accepts and its lint rules run on
// injects. Metrics, decisions and the connector extend this file as they land.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

const { ToolkitSchema } = await import('@shared/toolkits')
const { fieldLintRuleIds } = await import('../lint-rules')
const { unknownCapabilityWarnings } = await import('../capabilities')
const { listFigureKinds } = await import('../../render/figures')
const { generatorIds } = await import('../../case-data/generators')
await import('../generator-modules')

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/animal_disease.json'), 'utf8')),
)

describe('code the toolkit names exists', () => {
  it('has no unknown capabilities', () => {
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })

  it('registers its figure kinds beside the shared epidemiology kinds it reuses', () => {
    const have = listFigureKinds()
    for (const id of toolkit.figureKinds) expect(have, id).toContain(id)
    expect(toolkit.figureKinds).toEqual(
      expect.arrayContaining(['epi_curve', 'epi_contact_network']),
    )
  })

  it('registers the lint rules and the generators', () => {
    for (const id of toolkit.lintRules) expect(fieldLintRuleIds()).toContain(id)
    expect(generatorIds()).toEqual(
      expect.arrayContaining(['animal-premises-spread', 'animal-depop-capacity']),
    )
  })
})
