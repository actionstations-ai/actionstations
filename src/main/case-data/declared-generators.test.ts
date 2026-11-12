// Every simulation says what the form needs (#1141): the toolkits whose scenarios offer it, a
// complete example of its inputs and a label for each top-level input. The example must pass the
// generator's own schema and produce data, and the schema must convert to the JSON schema the
// form is built from.
import { readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  shell: { openExternal: vi.fn() },
}))

const { registerAllToolkitCode } = await import('../toolkits/register-all')
await import('../toolkits/generator-modules')
const { allGenerators } = await import('./generators')
const { generatorForm } = await import('./generator-form')
registerAllToolkitCode()

const TOOLKIT_IDS = new Set(
  readdirSync(resolve('packs/toolkits'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => (JSON.parse(readFileSync(join('packs/toolkits', f), 'utf8')) as { id: string }).id),
)
const ids = allGenerators().map((g) => g.id)

describe('declared simulations', () => {
  it('registers every bundled simulation', () => {
    expect(ids.length).toBeGreaterThanOrEqual(69)
  })

  it.each(ids)('%s: names the toolkits that offer it', (id) => {
    const g = allGenerators().find((x) => x.id === id)!
    expect(g.toolkits?.length, 'toolkits').toBeGreaterThan(0)
    for (const t of g.toolkits ?? []) expect(TOOLKIT_IDS, t).toContain(t)
  })

  it.each(ids)('%s: its example runs', (id) => {
    const g = allGenerators().find((x) => x.id === id)!
    expect(g.example, 'example').toBeDefined()
    const parsed = g.params.safeParse(g.example)
    expect(parsed.success ? '' : JSON.stringify(parsed.error.issues[0])).toBe('')
    expect(g.generate(parsed.data).length).toBeGreaterThan(0)
  })

  it.each(ids)('%s: every top-level input has a label', (id) => {
    const g = allGenerators().find((x) => x.id === id)!
    const form = generatorForm(g)
    expect(form.inputs.length).toBeGreaterThan(0)
    for (const i of form.inputs) expect(g.fields?.[i.key]?.label, i.key).toBeTruthy()
    z.toJSONSchema(g.params, { io: 'input', unrepresentable: 'any' })
  })
})
