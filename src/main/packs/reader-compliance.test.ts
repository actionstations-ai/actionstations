// Pack format 2 (#426): regulations/ and frameworks/ in a pack, read by this app; refused in a
// version-1 manifest and by an app that knows only format 1.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildPack, validPackTree, type Manifest } from '../../../tests/fixtures/packs/build'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.1.0',
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => tmpdir(),
  },
}))
process.env.TTX_RESOURCES = resolve('.')

const { readPack } = await import('./reader')
const { loadBuiltins } = await import('./builtins')

const APP = '0.3.0'
let builtins: Awaited<ReturnType<typeof loadBuiltins>>
beforeAll(async () => {
  builtins = await loadBuiltins()
})

const repoJson = (p: string) => JSON.parse(readFileSync(resolve(p), 'utf8'))

/** A national NIS2 transposition with a shorter early warning, as a pack author would write it. */
function nationalNis2() {
  const base = repoJson('packs/regulations/nis2_art23.json')
  return {
    ...base,
    id: 'nis2_example_state',
    label: 'NIS2 (example member state)',
    jurisdiction: 'EU-XX',
    clocks: base.clocks.map((c: { id: string }) =>
      c.id === 'early_warning'
        ? { ...c, dueAt: [{ from: 'aware', amount: 12, unit: 'hours' }] }
        : c,
    ),
  }
}

async function read(
  files: Record<string, unknown>,
  manifest: (m: Manifest) => void,
  opts: { maxFormatVersion?: number } = {},
) {
  const tree = validPackTree()
  for (const [path, data] of Object.entries(files)) tree[path] = JSON.stringify(data, null, 2)
  const buffer = await buildPack(tree, {
    manifest: (m) => {
      const c = m.contents as Record<string, string[]>
      for (const path of Object.keys(files)) {
        const [kind, file] = path.split('/') as [string, string]
        c[kind] = [...(c[kind] ?? []), file.replace(/\.json$/, '')]
      }
      manifest(m)
    },
  })
  return readPack({ buffer }, { appVersion: APP, builtins, ...opts })
}

const problems = (r: Awaited<ReturnType<typeof read>>): string =>
  r.ok ? '' : r.problems.map((p) => `${p.path ?? ''}: ${p.message}`).join('\n')

describe('pack format 2: regulations and frameworks', () => {
  it('reads a version-2 pack with a regulation and a framework and lists them for review', async () => {
    const r = await read(
      {
        'regulations/nis2_example_state.json': nationalNis2(),
        'frameworks/dora.json': repoJson('packs/frameworks/dora.json'),
      },
      (m) => (m.formatVersion = 2),
    )
    expect(problems(r)).toBe('')
    if (!r.ok) return
    expect(r.pack.items.filter((i) => i.kind === 'regulations' || i.kind === 'frameworks')).toEqual(
      [
        expect.objectContaining({ kind: 'regulations', id: 'nis2_example_state' }),
        expect.objectContaining({
          kind: 'frameworks',
          id: 'dora',
          title: expect.stringMatching(/DORA/),
        }),
      ],
    )
  })

  it('still reads a version-1 pack without them', async () => {
    const r = await read({}, () => undefined)
    expect(problems(r)).toBe('')
  })

  it('refuses a version-1 manifest that lists regulations', async () => {
    const r = await read({ 'regulations/nis2_example_state.json': nationalNis2() }, () => undefined)
    expect(problems(r)).toMatch(/contents\.regulations needs formatVersion 2/)
  })

  it('an app that knows only format 1 refuses a version-2 pack with "update the app"', async () => {
    const r = await read(
      { 'regulations/nis2_example_state.json': nationalNis2() },
      (m) => (m.formatVersion = 2),
      { maxFormatVersion: 1 },
    )
    expect(problems(r)).toMatch(/needs a newer version of the app \(pack format 2\)/)
  })

  it('refuses a regulation whose clock counts from an unknown trigger or a later clock', async () => {
    const reg = nationalNis2()
    reg.clocks[0].dueAt = [{ from: 'clock:final_report', amount: 1, unit: 'hours' }]
    reg.clocks[1].dueAt = [{ from: 'became_famous', amount: 1, unit: 'hours' }]
    const out = problems(
      await read({ 'regulations/nis2_example_state.json': reg }, (m) => (m.formatVersion = 2)),
    )
    expect(out).toMatch(/must name a clock listed before "early_warning" \(no cycles\)/)
    expect(out).toMatch(/"became_famous" is not a trigger/)
  })

  it('refuses a control reference that does not resolve', async () => {
    const reg = { ...nationalNis2(), controls: ['nist_csf_2:RS.CO-99', 'iso27001:A.5.24'] }
    const out = problems(
      await read({ 'regulations/nis2_example_state.json': reg }, (m) => (m.formatVersion = 2)),
    )
    expect(out).toMatch(/nist_csf_2 has no control "RS.CO-99"/)
    expect(out).toMatch(/"iso27001:A.5.24" names a framework that is neither in this pack/)
  })

  it('resolves a control reference to a framework in the same pack', async () => {
    const framework = {
      ...repoJson('packs/frameworks/dora.json'),
      id: 'my_controls',
      controls: [{ id: 'IR-1', title: 'Incident reporting' }],
      rules: [{ controls: ['IR-1'], keywords: ['regulator'] }],
    }
    const reg = { ...nationalNis2(), controls: ['my_controls:IR-1'] }
    const r = await read(
      { 'regulations/nis2_example_state.json': reg, 'frameworks/my_controls.json': framework },
      (m) => (m.formatVersion = 2),
    )
    expect(problems(r)).toBe('')
  })

  it('refuses a mapping rule keyword that is not a plain word, and a dangling rule control', async () => {
    const framework = {
      ...repoJson('packs/frameworks/dora.json'),
      rules: [
        { controls: ['Art.19'], keywords: ['(a+)+$'] },
        { controls: ['Art.99'], keywords: ['report'] },
      ],
    }
    const out = problems(
      await read({ 'frameworks/dora.json': framework }, (m) => (m.formatVersion = 2)),
    )
    expect(out).toMatch(/Keywords are plain lowercase words/)
    expect(out).toMatch(/"Art.99" is not a control of this framework/)
  })
})
