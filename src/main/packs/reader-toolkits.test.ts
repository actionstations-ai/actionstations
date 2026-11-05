// Pack format 3 (#649): toolkits/ in a pack, read by this app; refused in an older manifest and
// by an app that knows only format 2.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { INJECT_TYPE_IDS } from '@shared/taxonomy'
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

const toolkit = () => repoJson('tests/fixtures/toolkits/test_field.json')

describe('pack format 3: toolkits', () => {
  it('reads a version-3 pack with a toolkit and a template for its inject type', async () => {
    const r = await read(
      { 'toolkits/test_field.json': { ...toolkit(), injectTypes: [] } },
      (m) => (m.formatVersion = 3),
    )
    expect(problems(r)).toBe('')
    if (!r.ok) return
    expect(r.pack.items.filter((i) => i.kind === 'toolkits')).toEqual([
      expect.objectContaining({ kind: 'toolkits', id: 'test_field', title: 'Test field' }),
    ])
  })

  it('refuses a manifest older than 3 that lists toolkits', async () => {
    const r = await read(
      { 'toolkits/test_field.json': { ...toolkit(), injectTypes: [] } },
      (m) => (m.formatVersion = 2),
    )
    expect(problems(r)).toMatch(/contents\.toolkits needs formatVersion 3/)
  })

  it('an app that knows only format 2 refuses it with "update the app"', async () => {
    const r = await read(
      { 'toolkits/test_field.json': { ...toolkit(), injectTypes: [] } },
      (m) => (m.formatVersion = 3),
      { maxFormatVersion: 2 },
    )
    expect(problems(r)).toMatch(/needs a newer version of the app \(pack format 3\)/)
  })

  it('refuses a file whose id differs from its name', async () => {
    const r = await read(
      { 'toolkits/test_field.json': { ...toolkit(), id: 'other', injectTypes: [] } },
      (m) => (m.formatVersion = 3),
    )
    expect(problems(r)).toMatch(/id "other" must equal the file name "test_field"/)
  })

  it('refuses a toolkit that does not match the schema', async () => {
    const r = await read(
      { 'toolkits/test_field.json': { ...toolkit(), injectTypes: [], connectors: ['Not An Id'] } },
      (m) => (m.formatVersion = 3),
    )
    expect(problems(r)).toMatch(/connectors\.0/)
  })

  it('refuses an inject type that is neither built in nor a template of the pack', async () => {
    const r = await read({ 'toolkits/test_field.json': toolkit() }, (m) => (m.formatVersion = 3))
    expect(problems(r)).toMatch(/"test_bulletin" is neither a built-in inject type nor a template/)
  })

  it('refuses a toolkit file over 512 KB', async () => {
    const big = { ...toolkit(), injectTypes: [], description: 'x'.repeat(100) }
    big.knowledge = {
      glossary: [],
      productConventions: Array.from({ length: 100 }, () => 'y'.repeat(600)),
      realismRules: Array.from({ length: 100 }, () => 'z'.repeat(600)),
    }
    const r = await read(
      { 'toolkits/test_field.json': { ...big, pad: 'p'.repeat(600_000) } },
      (m) => (m.formatVersion = 3),
    )
    expect(problems(r)).toMatch(/at most 512 KB/)
  })
})

describe('pack warnings for ids the app has no code for', () => {
  const warningsOf = (r: Awaited<ReturnType<typeof read>>, kind: string): string[] =>
    r.ok ? r.pack.items.filter((i) => i.kind === kind).flatMap((i) => i.warnings ?? []) : []

  it('warns, without refusing, about toolkit connector and lint rule ids the app lacks', async () => {
    const r = await read(
      { 'toolkits/test_field.json': { ...toolkit(), injectTypes: [] } },
      (m) => (m.formatVersion = 3),
    )
    expect(problems(r)).toBe('')
    expect(warningsOf(r, 'toolkits')).toEqual([
      'The app has no data connector "test_archive"; it is ignored.',
      'The app has no lint rule "bulletin_syntax"; it is ignored.',
    ])
  })

  it('gives no warning when the ids are known', async () => {
    const known = {
      ...toolkit(),
      injectTypes: [],
      connectors: [],
      lintRules: [],
      metrics: [{ id: 'threshold_timing', config: {} }],
    }
    const r = await read({ 'toolkits/test_field.json': known }, (m) => (m.formatVersion = 3))
    expect(problems(r)).toBe('')
    expect(warningsOf(r, 'toolkits')).toEqual([])
  })

  it('warns about a domain inject type that nothing provides, and not about a built-in one', async () => {
    const tree = validPackTree()
    const domain = JSON.parse(tree['domains/heritage_rail.json'] as string) as {
      injectTypes: string[]
    }
    domain.injectTypes = [INJECT_TYPE_IDS[0]!, 'no_such_type']
    tree['domains/heritage_rail.json'] = JSON.stringify(domain)
    const buffer = await buildPack(tree)
    const r = await readPack({ buffer }, { appVersion: APP, builtins })
    expect(problems(r)).toBe('')
    expect(warningsOf(r, 'domains')).toEqual([
      'The inject type "no_such_type" is not provided by the app, this pack or an installed toolkit.',
    ])
  })
})
