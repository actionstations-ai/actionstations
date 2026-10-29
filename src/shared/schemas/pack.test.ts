import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Framework, Regulation } from './compliance'
import {
  PACK_LIMITS,
  PackCatalog,
  PackCatalogEntry,
  PackFetchUrl,
  PackId,
  PackManifest,
  PackManifestHeader,
  SemVer,
  catalogEntryUrlProblem,
  classifyPackPath,
  manifestContents,
  packFormatVersionFor,
  compareSemver,
  isAppCompatible,
  isLocalNetworkUrl,
  packArchiveName,
  packPathProblem,
  parseCatalog,
  type PackManifest as PackManifestT,
} from './pack'

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(resolve('tests/fixtures/packs', name), 'utf8'))

/** A fresh, valid manifest object to mutate per test. */
const manifest = (): PackManifestT =>
  structuredClone(fixture('freight-rail.pack.json')) as PackManifestT
const catalog = () =>
  structuredClone(fixture('catalog.json')) as Record<string, unknown> & {
    packs: Record<string, unknown>[]
  }
const SHA = 'a'.repeat(64)

/** Every issue message of a failed parse, joined, for substring assertions. */
function issues(result: { success: boolean; error?: { issues: { message: string }[] } }): string {
  expect(result.success).toBe(false)
  return result.error!.issues.map((i) => i.message).join('\n')
}

function withFile(m: PackManifestT, path: string): PackManifestT {
  m.files.push({ path, sha256: SHA, size: 10 })
  return m
}

describe('PackManifest: valid packs', () => {
  it('accepts the freight-rail fixture with every kind', () => {
    const m = PackManifest.parse(fixture('freight-rail.pack.json'))
    expect(m.contents.domains).toEqual(['heritage_rail'])
    expect(m.files.length).toBe(19)
  })

  it('fills defaults for optional lists and description', () => {
    const m = PackManifest.parse({
      formatVersion: 1,
      id: 'org.example.one-template',
      name: 'One template',
      version: '0.1.0',
      summary: 'A single template.',
      author: { name: 'Example Exercise Group' },
      license: 'MIT',
      minAppVersion: '0.3.0',
      contents: { templates: ['shift_log'] },
      files: [
        { path: 'templates/shift_log/template.html', sha256: SHA, size: 100 },
        { path: 'templates/shift_log/meta.json', sha256: SHA, size: 50 },
      ],
    })
    expect(m.contents.prompts).toEqual([])
    expect(m.domains).toEqual([])
    expect(m.documents).toEqual([])
    expect(m.description).toBe('')
  })

  it('allows an example project .gitignore and template fonts and goldens', () => {
    const m = manifest()
    withFile(m, 'examples/harbor-junction/project/.gitignore')
    withFile(m, 'templates/rail_dispatch_board/fonts/board.woff2')
    expect(PackManifest.safeParse(m).success).toBe(true)
  })
})

describe('PackManifest: identity and versions', () => {
  it.each([
    'freight-rail',
    'Ai.Example.Pack',
    'ai..example',
    '.ai.example',
    'ai.example.',
    'ai.-x',
    'ai/example',
  ])('rejects pack id %s', (id) => {
    expect(PackId.safeParse(id).success).toBe(false)
    expect(PackManifest.safeParse({ ...manifest(), id }).success).toBe(false)
  })

  it.each(['1', '1.0', 'v1.0.0', '01.0.0', '1.0.0+build.5', '1.0.0-'])(
    'rejects version %s',
    (v) => {
      expect(SemVer.safeParse(v).success).toBe(false)
    },
  )

  it('rejects a newer formatVersion (the header still reads it)', () => {
    const raw = { ...manifest(), formatVersion: 3 }
    expect(PackManifest.safeParse(raw).success).toBe(false)
    expect(PackManifestHeader.parse(raw).formatVersion).toBe(3)
  })

  it('reads format 1 and format 2 manifests', () => {
    expect(PackManifest.safeParse({ ...manifest(), formatVersion: 1 }).success).toBe(true)
    expect(PackManifest.safeParse({ ...manifest(), formatVersion: 2 }).success).toBe(true)
  })

  it('refuses a version-1 manifest that lists regulations or frameworks', () => {
    const m = manifest()
    m.contents.regulations = ['circia']
    m.files.push({ path: 'regulations/circia.json', sha256: SHA, size: 10 })
    expect(issues(PackManifest.safeParse(m))).toMatch(/contents\.regulations needs formatVersion 2/)
    expect(PackManifest.safeParse({ ...m, formatVersion: 2 }).success).toBe(true)
  })

  it('writers pick the oldest format that holds the contents and leave empty new kinds out', () => {
    expect(packFormatVersionFor({ templates: ['x'] })).toBe(1)
    expect(packFormatVersionFor({ templates: ['x'], frameworks: ['nist_csf_2'] })).toBe(2)
    expect(Object.keys(manifestContents({ templates: ['x'] }))).not.toContain('regulations')
    expect(manifestContents({ regulations: ['circia'] }).regulations).toEqual(['circia'])
  })

  it('classifies regulation and framework files as flat items', () => {
    expect(classifyPackPath('regulations/circia.json')).toMatchObject({
      kind: 'regulations',
      item: 'circia',
    })
    expect(classifyPackPath('frameworks/nist_csf_2.json')).toMatchObject({ kind: 'frameworks' })
    expect(classifyPackPath('frameworks/a/b.json')).toHaveProperty('error')
    expect(classifyPackPath('regulations/Bad-Id.json')).toHaveProperty('error')
  })

  it('rejects a license that is not an SPDX expression', () => {
    expect(issues(PackManifest.safeParse({ ...manifest(), license: 'Free to use!' }))).toMatch(
      /SPDX/,
    )
    expect(PackManifest.safeParse({ ...manifest(), license: 'MIT OR Apache-2.0' }).success).toBe(
      true,
    )
    expect(
      PackManifest.safeParse({ ...manifest(), license: 'LicenseRef-Exercise-Use' }).success,
    ).toBe(true)
  })
})

describe('PackManifest: hashes and sizes', () => {
  it.each([
    ['uppercase', 'A'.repeat(64)],
    ['too short', 'a'.repeat(63)],
    ['not hex', 'g'.repeat(64)],
    ['sha1 length', 'a'.repeat(40)],
  ])('rejects a %s sha256', (_label, sha256) => {
    const m = manifest()
    m.files[0]!.sha256 = sha256
    expect(issues(PackManifest.safeParse(m))).toMatch(/sha256/)
  })

  it('rejects a file over the per-file limit and a pack over the total limit', () => {
    const big = manifest()
    big.files[0]!.size = PACK_LIMITS.maxFileBytes + 1
    expect(PackManifest.safeParse(big).success).toBe(false)
    const total = manifest()
    for (let i = 0; i < 6; i++) withFile(total, `documents/rail-emergency-plan/part-${i}.pdf`)
    total.files.forEach((f) => (f.size = PACK_LIMITS.maxFileBytes))
    for (let i = 0; i < 6; i++)
      total.documents.push({
        path: `documents/rail-emergency-plan/part-${i}.pdf`,
        title: 'Part',
        license: 'CC0-1.0',
      })
    expect(issues(PackManifest.safeParse(total))).toMatch(/size limit/)
  })

  it('rejects duplicate paths, also when they differ only in case', () => {
    expect(issues(PackManifest.safeParse(withFile(manifest(), 'README.md')))).toMatch(
      /Duplicate path/,
    )
    expect(issues(PackManifest.safeParse(withFile(manifest(), 'readme.md')))).toMatch(
      /Duplicate path|root/,
    )
    const m = manifest()
    withFile(m, 'templates/rail_dispatch_board/Style.css')
    expect(issues(PackManifest.safeParse(m))).toMatch(/Duplicate path/)
  })

  it('does not let pack.json list itself', () => {
    expect(issues(PackManifest.safeParse(withFile(manifest(), 'pack.json')))).toMatch(/pack.json/)
  })
})

describe('PackManifest: path traversal and unsafe names', () => {
  it.each([
    '../evil.json',
    'templates/../../evil/template.html',
    'templates/rail_dispatch_board/../../../x.css',
    '/etc/passwd',
    'C:/Windows/evil.json',
    'templates\\rail_dispatch_board\\style.css',
    'templates//rail_dispatch_board/style.css',
    'templates/./rail_dispatch_board/style.css',
    'templates/rail_dispatch_board/.hidden.css',
    'templates/rail_dispatch_board/con.css',
    'templates/rail_dispatch_board/style.css.',
    'templates/rail_dispatch_board/sty\u0000le.css',
    'templates/rail_dispatch_board/caf\u0065\u0301.css',
    `templates/rail_dispatch_board/${'a/'.repeat(12)}x.css`,
  ])('rejects %j', (path) => {
    expect(packPathProblem(path)).toBeDefined()
    expect(PackManifest.safeParse(withFile(manifest(), path)).success).toBe(false)
  })

  it('also rejects unsafe paths in documents[]', () => {
    const m = manifest()
    m.documents[0]!.path = 'documents/../../secret.pdf'
    expect(issues(PackManifest.safeParse(m))).toMatch(/Unsafe path/)
  })
})

describe('PackManifest: kinds, folders and extensions', () => {
  it('rejects an unknown kind in contents', () => {
    const m = manifest() as unknown as { contents: Record<string, unknown> }
    m.contents.plugins = ['autorun']
    expect(PackManifest.safeParse(m).success).toBe(false)
  })

  it('rejects files outside the content folders and at the root', () => {
    expect(issues(PackManifest.safeParse(withFile(manifest(), 'plugins/autorun.json')))).toMatch(
      /not a pack content folder/,
    )
    expect(issues(PackManifest.safeParse(withFile(manifest(), 'install.sh')))).toMatch(/pack root/)
  })

  it.each([
    'templates/rail_dispatch_board/app.js',
    'templates/rail_dispatch_board/logo.svg',
    'templates/rail_dispatch_board/extra.html',
    'documents/rail-emergency-plan/macro.docm',
    'documents/rail-emergency-plan/page.html',
    'examples/harbor-junction/project/tool.exe',
    'examples/harbor-junction/project/index.sqlite',
    'examples/harbor-junction/project/run',
  ])('rejects forbidden file %s', (path) => {
    const m = withFile(manifest(), path)
    if (path.startsWith('documents/')) m.documents.push({ path, title: 'x', license: 'CC0-1.0' })
    expect(issues(PackManifest.safeParse(m))).toMatch(/not allowed|only HTML/)
  })

  it('rejects nested folders in flat kinds and bad file names', () => {
    expect(
      PackManifest.safeParse(withFile(manifest(), 'prompts/extra/inject_text.md')).success,
    ).toBe(false)
    expect(PackManifest.safeParse(withFile(manifest(), 'prompts/inject_text.json')).success).toBe(
      false,
    )
    expect(PackManifest.safeParse(withFile(manifest(), 'domains/Freight.json')).success).toBe(false)
  })

  it('rejects files of items that contents does not list', () => {
    expect(issues(PackManifest.safeParse(withFile(manifest(), 'prompts/hotwash.md')))).toMatch(
      /does not list/,
    )
  })

  it('rejects listed items that miss their required files', () => {
    const m = manifest()
    m.contents.templates.push('ghost_template')
    expect(issues(PackManifest.safeParse(m))).toMatch(/ghost_template.*template.html/)
    const w = manifest()
    w.files = w.files.filter((f) => !f.path.endsWith('.bindings.json'))
    expect(issues(PackManifest.safeParse(w))).toMatch(/bindings.json/)
    const e = manifest()
    e.files = e.files.filter((f) => f.path !== 'examples/harbor-junction/project/project.json')
    expect(issues(PackManifest.safeParse(e))).toMatch(/project\/project.json/)
  })

  it('rejects an invalid item id and duplicate ids', () => {
    const m = manifest()
    m.contents.templates = ['Rail-Board']
    expect(PackManifest.safeParse(m).success).toBe(false)
    const d = manifest()
    d.contents.prompts = ['inject_text', 'inject_text']
    expect(issues(PackManifest.safeParse(d))).toMatch(/Duplicate ids/)
  })

  it('rejects an empty pack', () => {
    const m = manifest()
    m.contents = {
      templates: [],
      prompts: [],
      domains: [],
      workflows: [],
      documents: [],
      examples: [],
      regulations: [],
      frameworks: [],
    }
    m.files = [{ path: 'README.md', sha256: SHA, size: 1 }]
    m.documents = []
    expect(issues(PackManifest.safeParse(m))).toMatch(/at least one item/)
  })
})

describe('PackManifest: documents need a title and a license', () => {
  it('rejects a document file without a documents[] entry', () => {
    const m = withFile(manifest(), 'documents/rail-emergency-plan/annex-b.pdf')
    expect(issues(PackManifest.safeParse(m))).toMatch(/needs a documents\[\] entry/)
  })

  it('rejects a documents[] entry without a license or for a missing file', () => {
    const m = manifest() as unknown as { documents: Record<string, unknown>[] }
    delete m.documents[0]!.license
    expect(PackManifest.safeParse(m).success).toBe(false)
    const n = manifest()
    n.documents.push({
      path: 'documents/rail-emergency-plan/missing.pdf',
      title: 'Gone',
      license: 'CC0-1.0',
    })
    expect(issues(PackManifest.safeParse(n))).toMatch(/not in files/)
  })
})

describe('classifyPackPath', () => {
  it('maps paths to kind and item', () => {
    expect(classifyPackPath('workflows/yard-cctv-still.bindings.json')).toEqual({
      root: false,
      kind: 'workflows',
      item: 'yard-cctv-still',
      rest: 'yard-cctv-still.bindings.json',
    })
    expect(classifyPackPath('templates/rail_dispatch_board/__golden__/default.png')).toMatchObject({
      kind: 'templates',
      item: 'rail_dispatch_board',
      rest: '__golden__/default.png',
    })
    expect(classifyPackPath('LICENSE')).toEqual({ root: true })
  })
})

describe('PackCatalog', () => {
  it('accepts the catalog fixture', () => {
    const c = PackCatalog.parse(fixture('catalog.json'))
    expect(c.packs.map((p) => p.id)).toContain('ai.actionstations.heritage-rail')
  })

  it.each([
    ['unknown kind', { kinds: ['plugins'] }],
    ['no kinds', { kinds: [] }],
    ['bad sha', { sha256: 'xyz' }],
    ['bad id', { id: 'Freight Rail' }],
    ['plain http url', { url: 'http://packs.example.org/a.aspack' }],
    ['file url', { url: 'file:///etc/passwd' }],
    ['javascript homepage', { homepage: 'javascript:alert(1)' }],
    ['oversized archive', { size: PACK_LIMITS.maxArchiveBytes + 1 }],
  ])('rejects an entry with %s', (_label, patch) => {
    const entry = { ...catalog().packs[0], ...patch }
    expect(PackCatalogEntry.safeParse(entry).success).toBe(false)
  })

  it('rejects duplicate id@version but allows several versions of one pack', () => {
    const c = catalog()
    c.packs.push({ ...c.packs[0] })
    expect(issues(PackCatalog.safeParse(c))).toMatch(/Duplicate entry/)
    const v = catalog()
    v.packs.push({ ...v.packs[0], version: '1.1.0' })
    expect(PackCatalog.safeParse(v).success).toBe(true)
  })

  it('allows http only on loopback (local catalogs for testing)', () => {
    expect(PackFetchUrl.safeParse('http://127.0.0.1:8080/index.json').success).toBe(true)
    expect(PackFetchUrl.safeParse('http://localhost/x.aspack').success).toBe(true)
    expect(PackFetchUrl.safeParse('http://192.168.1.5/x.aspack').success).toBe(false)
  })
})

describe('parseCatalog (what the app does with a fetched index)', () => {
  it('skips invalid and duplicate entries and keeps the rest', () => {
    const c = catalog()
    c.packs.push({ ...c.packs[0], sha256: 'bad' })
    c.packs.push({ ...c.packs[1] })
    const r = parseCatalog(c)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.catalog.packs).toHaveLength(2)
    expect(r.skipped.map((s) => s.index)).toEqual([2, 3])
    expect(r.skipped[0]!.id).toBe('ai.actionstations.heritage-rail')
  })

  it('refuses a newer catalog format with an update message', () => {
    expect(parseCatalog({ ...catalog(), catalogVersion: 2 })).toEqual({
      ok: false,
      reason: 'This catalog needs a newer version of the app',
    })
  })

  it('refuses something that is not a catalog', () => {
    expect(parseCatalog({ hello: 'world' }).ok).toBe(false)
    expect(parseCatalog(null).ok).toBe(false)
    expect(parseCatalog({ ...catalog(), packs: 'nope' }).ok).toBe(false)
  })
})

describe('local archive URLs in catalogs (#303)', () => {
  it('recognizes this computer and the local network by literal host', () => {
    for (const u of [
      'http://127.0.0.1:8188/x',
      'http://127.9.9.9/x',
      'https://localhost/x',
      'https://LOCALHOST./x',
      'https://comfy.localhost/x',
      'http://[::1]:11434/x',
      'https://[::ffff:127.0.0.1]/x',
      'https://0.0.0.0/x',
      'https://10.1.2.3/x',
      'https://172.20.0.1/x',
      'https://192.168.1.5/x',
      'https://169.254.169.254/x',
      'https://[fd00::1]/x',
      'https://[fe80::1]/x',
      'https://2130706433/x', // 127.0.0.1 written as one number
      'https://0x7f.1/x',
    ])
      expect(isLocalNetworkUrl(u), u).toBe(true)
    for (const u of [
      'https://actionstations.ai/packs/index.json',
      'https://172.32.0.1/x',
      'https://8.8.8.8/x',
      'https://[2001:db8::1]/x',
      'https://localhost.example.org/x',
      'not a url',
    ])
      expect(isLocalNetworkUrl(u), u).toBe(false)
  })

  it('allows a local archive URL only from a local catalog', () => {
    const remote = 'https://packs.example.org/index.json'
    const local = 'http://127.0.0.1:9000/index.json'
    expect(catalogEntryUrlProblem('http://127.0.0.1:8188/prompt', remote)).toMatch(
      /this computer or the local network, but the catalog does not/,
    )
    expect(catalogEntryUrlProblem('https://192.168.1.5/x.aspack', remote)).toBeDefined()
    expect(catalogEntryUrlProblem('http://localhost:8188/x.aspack', local)).toBeUndefined()
    expect(catalogEntryUrlProblem('https://packs.example.org/x.aspack', local)).toBeUndefined()
    expect(catalogEntryUrlProblem('https://packs.example.org/x.aspack', remote)).toBeUndefined()
  })

  it('parseCatalog skips local entries of a remote catalog and keeps them for a local one', () => {
    const c = catalog()
    c.packs.push({ ...c.packs[0], version: '9.0.0', url: 'http://127.0.0.1:8188/view' })
    const remote = parseCatalog(c, { catalogUrl: 'https://packs.example.org/index.json' })
    expect(remote.ok && remote.skipped).toEqual([
      expect.objectContaining({
        index: c.packs.length - 1,
        reason: expect.stringMatching(/local network/),
      }),
    ])
    const local = parseCatalog(c, { catalogUrl: 'http://localhost:9000/index.json' })
    expect(local.ok && local.skipped).toEqual([])
  })
})

describe('versions', () => {
  it('orders by semver precedence', () => {
    const sorted = [
      '1.0.0',
      '0.9.9',
      '1.0.0-beta.2',
      '1.0.0-alpha',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.10.0',
      '1.2.0',
    ].sort(compareSemver)
    expect(sorted).toEqual([
      '0.9.9',
      '1.0.0-alpha',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '1.2.0',
      '1.10.0',
    ])
  })

  it('checks minAppVersion', () => {
    expect(isAppCompatible('0.3.0', '0.3.0')).toBe(true)
    expect(isAppCompatible('0.3.0', '0.10.1')).toBe(true)
    expect(isAppCompatible('0.4.0', '0.3.9')).toBe(false)
    expect(isAppCompatible('0.3.0', '0.3.0-beta.1')).toBe(false)
    expect(() => compareSemver('1.0', '1.0.0')).toThrow(/semantic version/)
  })

  it('names archives <id>-<version>.aspack', () => {
    expect(packArchiveName('ai.actionstations.heritage-rail', '1.0.0')).toBe(
      'ai.actionstations.heritage-rail-1.0.0.aspack',
    )
  })
})

describe('docs/packs-format.md examples', () => {
  const doc = readFileSync(resolve('docs/packs-format.md'), 'utf8')
  const blocks = (marker: string): unknown[] =>
    [
      ...doc.matchAll(
        new RegExp(`<!-- example:${marker} -->\\s*\`\`\`json\\n([\\s\\S]*?)\`\`\``, 'g'),
      ),
    ].map((m) => JSON.parse(m[1]!))

  it('has a valid pack.json example', () => {
    const found = blocks('pack')
    expect(found.length).toBeGreaterThan(0)
    for (const b of found) expect(PackManifest.safeParse(b).error?.issues ?? []).toEqual([])
  })

  it('has a valid catalog example', () => {
    const found = blocks('catalog')
    expect(found.length).toBeGreaterThan(0)
    for (const b of found) expect(PackCatalog.safeParse(b).error?.issues ?? []).toEqual([])
  })

  it('has valid regulation and framework examples (format 2, #426)', () => {
    const regs = blocks('regulation')
    const frameworks = blocks('framework')
    expect(regs.length).toBeGreaterThan(0)
    expect(frameworks.length).toBeGreaterThan(0)
    for (const b of regs) expect(Regulation.safeParse(b).error?.issues ?? []).toEqual([])
    for (const b of frameworks) expect(Framework.safeParse(b).error?.issues ?? []).toEqual([])
    expect(blocks('pack').some((b) => (b as { formatVersion: number }).formatVersion === 2)).toBe(
      true,
    )
  })
})
