// The lab safety toolkit on the shared registries: every id it names has code behind it, and
// registering twice changes nothing.
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
const { registerLabSafetyToolkit } = await import('./register')
const { generatorIds } = await import('../../case-data/generators')

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/lab_safety.json'), 'utf8')),
)
registerLabSafetyToolkit()
registerLabSafetyToolkit()

describe('capabilities', () => {
  it('has code behind every figure kind, connector, metric and lint rule the toolkit names', () => {
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })

  it('registers its generators once', () => {
    for (const id of ['lab-alarm-event', 'lab-inventory-discrepancy', 'lab-access-log'])
      expect(generatorIds().filter((g) => g === id)).toHaveLength(1)
  })
})
