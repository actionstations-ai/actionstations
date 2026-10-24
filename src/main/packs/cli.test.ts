import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PackCatalogEntry } from '@shared/schemas/pack'
import { PACK_FIXTURES, buildPack, writePackFixtures } from '../../../tests/fixtures/packs/build'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => tmpdir() },
}))
process.env.TTX_RESOURCES = resolve('.')

const { runCli, parseArgs } = await import('./cli')
const { loadBuiltins } = await import('./builtins')

const CATALOG_FIXTURE = resolve('tests/fixtures/packs/catalog.json')
let fixtures: Record<string, string>

function capture() {
  const out: string[] = []
  const err: string[] = []
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err }
}

beforeAll(async () => {
  fixtures = await writePackFixtures(mkdtempSync(join(tmpdir(), 'pack-cli-')))
})

describe('parseArgs', () => {
  it.each([
    [[], /No pack file/],
    [['a.aspack', '--catalog-entry'], /needs --url/],
    [['a.aspack', '--url', 'https://x.test'], /go with --catalog-entry/],
    [['--catalog', 'i.json', 'a.aspack'], /takes no pack files/],
    [['a.aspack', '--bogus'], /Unknown option --bogus/],
    [['a.aspack', '--url'], /--url needs a value/],
  ])('%j → %s', (argv, re) => {
    expect(parseArgs(argv)).toMatch(re)
  })
})

describe('runCli (in process)', () => {
  const opts = async () => ({ appVersion: '0.3.0', builtins: await loadBuiltins() })

  it('prints ok for a valid pack and exits 0', async () => {
    const c = capture()
    expect(await runCli([fixtures.valid!], await opts(), c.io)).toBe(0)
    expect(c.out[0]).toMatch(
      /^valid.aspack: ok \(ai.actionstations.heritage-rail 1.0.0, \d+ files, sha256 [0-9a-f]{64}\)$/,
    )
    expect(c.err).toEqual([])
  })

  it('prints each problem with the file and the path inside the pack, exit 1', async () => {
    const c = capture()
    expect(await runCli([fixtures['wrong-sha']!], await opts(), c.io)).toBe(1)
    expect(c.err).toEqual(['wrong-sha.aspack: README.md: sha256 does not match pack.json'])
  })

  it('applies the minAppVersion gate with --app-version', async () => {
    const c = capture()
    expect(await runCli([fixtures.valid!, '--app-version', '0.2.0'], await opts(), c.io)).toBe(1)
    expect(c.err[0]).toMatch(
      /pack.json: This pack needs Action Stations 0.3.0 or later \(this is 0.2.0\)/,
    )
  })

  it('prints a catalog entry that PackCatalogEntry accepts', async () => {
    const c = capture()
    const code = await runCli(
      [fixtures.valid!, '--catalog-entry', '--url', 'https://actionstations.ai/packs/files/'],
      { ...(await opts()), now: () => new Date('2026-10-24T10:00:00.123Z') },
      c.io,
    )
    expect(code).toBe(0)
    const entry = PackCatalogEntry.parse(JSON.parse(c.out.join('\n')))
    const bytes = readFileSync(fixtures.valid!)
    expect(entry).toMatchObject({
      id: 'ai.actionstations.heritage-rail',
      version: '1.0.0',
      kinds: ['templates', 'prompts', 'domains', 'workflows', 'documents', 'examples'],
      size: bytes.length,
      url: 'https://actionstations.ai/packs/files/ai.actionstations.heritage-rail-1.0.0.aspack',
      updated: '2026-10-24T10:00:00Z',
    })
  })

  it('prints an array of entries for several files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pack-cli-'))
    const second = join(dir, 'second.aspack')
    writeFileSync(second, await buildPack())
    const c = capture()
    await runCli(
      [
        fixtures.valid!,
        second,
        '--catalog-entry',
        '--url',
        'https://x.test',
        '--updated',
        '2026-10-24T00:00:00Z',
      ],
      await opts(),
      c.io,
    )
    expect(JSON.parse(c.out.join('\n'))).toHaveLength(2)
  })

  it('validates a catalog strictly', async () => {
    const ok = capture()
    expect(await runCli(['--catalog', CATALOG_FIXTURE], await opts(), ok.io)).toBe(0)
    const bad = JSON.parse(readFileSync(CATALOG_FIXTURE, 'utf8'))
    bad.packs[0].url = 'http://example.com/a.aspack'
    const file = join(mkdtempSync(join(tmpdir(), 'pack-cli-')), 'index.json')
    writeFileSync(file, JSON.stringify(bad))
    const c = capture()
    expect(await runCli(['--catalog', file], await opts(), c.io)).toBe(1)
    expect(c.err.join('\n')).toMatch(
      /index.json: packs.0.url: Pack and catalog URLs must use https/,
    )
  })
})

describe('node scripts/pack-validate.mjs (plain Node, no Electron)', () => {
  const run = (...args: string[]) => {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.TTX_RESOURCES
    return spawnSync('node', [resolve('scripts/pack-validate.mjs'), ...args], {
      encoding: 'utf8',
      env,
      timeout: 120_000,
    })
  }

  it('accepts the valid fixture and prints its catalog entry', () => {
    const r = run(
      fixtures.valid!,
      '--app-version',
      '0.3.0',
      '--catalog-entry',
      '--url',
      'https://x.test/files',
    )
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    expect(PackCatalogEntry.parse(JSON.parse(r.stdout)).url).toBe(
      'https://x.test/files/ai.actionstations.heritage-rail-1.0.0.aspack',
    )
  })

  it('refuses every broken fixture with its specific message', () => {
    const cases = Object.entries(PACK_FIXTURES).filter(([, f]) => !f.limits)
    const r = run(...cases.map(([n]) => fixtures[n]!), '--app-version', '0.3.0')
    expect(r.status).toBe(1)
    const lines = r.stderr.trim().split('\n')
    for (const [name, fx] of cases) {
      const mine = lines.filter((l) => l.startsWith(`${basename(fixtures[name]!)}: `))
      expect([name, mine.join('\n')]).toEqual([name, expect.stringMatching(fx.expect)])
    }
  })

  it('validates a catalog and reports usage errors with exit 1', () => {
    expect(run('--catalog', CATALOG_FIXTURE).status).toBe(0)
    const usage = run('--catalog-entry')
    expect(usage.status).toBe(1)
    expect(usage.stderr).toMatch(/Usage:/)
  })
})
