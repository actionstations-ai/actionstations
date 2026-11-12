// Every connector says what the fetch form must ask for (#1139): its options, with an example of
// each, and what it reads of the area. A query built only from those declarations must pass the
// connector's own estimate(), so the form can never be missing a field the connector needs.
import { tmpdir } from 'node:os'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  shell: { openExternal: vi.fn() },
}))

const { listConnectors, getConnector } = await import('./registry')
const { registerAllToolkitCode } = await import('../register-all')

const DEFAULT_RANGE = { start: '2024-01-01T00:00:00Z', end: '2024-01-31T00:00:00Z' }

beforeAll(() => registerAllToolkitCode())

describe('declared connector options', () => {
  it('registers the connectors the bundled toolkits name', () => {
    expect(listConnectors().length).toBeGreaterThan(40)
  })

  it.each(listConnectorIds())('%s: a query from its declarations passes estimate()', (id) => {
    const c = getConnector(id)
    const options = Object.fromEntries((c.options ?? []).map((o) => [o.key, o.example]))
    const area = { label: '', ...c.area?.example }
    const query = { range: c.exampleRange ?? DEFAULT_RANGE, area, options }
    expect(() => c.estimate(query)).not.toThrow()
  })

  it.each(listConnectorIds())('%s: its options are well formed', (id) => {
    const c = getConnector(id)
    const keys = (c.options ?? []).map((o) => o.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const o of c.options ?? []) {
      expect(o.label.length).toBeGreaterThan(0)
      expect(typeof o.example).toBe(
        o.type === 'number' ? 'number' : o.type === 'boolean' ? 'boolean' : 'string',
      )
      if (o.type === 'choice') {
        expect(o.choices?.length).toBeGreaterThan(0)
        expect(o.choices!.map((x) => x.value)).toContain(o.example)
      }
    }
    if (c.area?.bbox === 'required') expect(c.area.example?.bbox).toBeDefined()
    if (c.area?.label === 'required') expect(c.area.example?.label).toBeTruthy()
  })
})

function listConnectorIds(): string[] {
  registerAllToolkitCode()
  return listConnectors().map((c) => c.id)
}
