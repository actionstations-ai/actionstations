import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  PACK_FIXTURES,
  buildPack,
  manifestFor,
  patchEntry,
  validPackTree,
  writePackFixtures,
  zipEntries,
} from '../../../tests/fixtures/packs/build'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.1.0',
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => tmpdir(),
  },
}))
process.env.TTX_RESOURCES = resolve('.')

const { readPack, contentSha256 } = await import('./reader')
const { registerPackProfiles } = await import('@shared/domains')
const { extractPack } = await import('./extract')
const { loadBuiltins } = await import('./builtins')
const { scanCentralDirectory, S_IFLNK } = await import('./zip')

const APP = '0.3.0'
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
let builtins: Awaited<ReturnType<typeof loadBuiltins>>

beforeAll(async () => {
  builtins = await loadBuiltins()
})

async function readOk(buf: Buffer) {
  const r = await readPack({ buffer: buf }, { appVersion: APP, builtins })
  if (!r.ok) throw new Error(JSON.stringify(r.problems, null, 2))
  return r.pack
}

describe('loadBuiltins', () => {
  it('reads the shipped templates, prompts, workflows and examples', () => {
    expect(builtins.templates).toContain('tweet')
    expect(builtins.prompts).toContain('inject_text')
    expect(builtins.workflows).toContain('sdxl-photo')
    expect(builtins.examples).toContain('city-water')
  })
})

describe('readPack: valid pack with all six kinds', () => {
  it('verifies every file and summarizes every item', async () => {
    const buf = await buildPack()
    const pack = await readOk(buf)
    const tree = validPackTree()
    expect(pack.archiveSha256).toBe(sha(buf))
    expect(pack.contentSha256).toBe(contentSha256(manifestFor(tree).files))
    expect([...pack.files.keys()].sort()).toEqual(Object.keys(tree).sort())
    expect(pack.files.get('README.md')!.toString()).toBe(tree['README.md'])
    expect(pack.manifest.id).toBe('ai.actionstations.heritage-rail')
    const byKind = Object.fromEntries(pack.items.map((i) => [`${i.kind}:${i.id}`, i]))
    expect(Object.keys(byKind)).toEqual([
      'templates:rail_dispatch_board',
      'prompts:inject_text',
      'domains:heritage_rail',
      'workflows:yard-cctv-still',
      'documents:rail-emergency-plan',
      'examples:harbor-junction',
    ])
    expect(byKind['templates:rail_dispatch_board']).toMatchObject({
      title: 'Rail dispatch board',
      replacesBuiltin: false,
      license: 'CC-BY-4.0',
    })
    expect(byKind['prompts:inject_text']!.replacesBuiltin).toBe(true)
    expect(byKind['domains:heritage_rail']!.title).toBe('Heritage rail')
    expect(byKind['workflows:yard-cctv-still']).toMatchObject({
      title: 'Yard CCTV still',
      customNodes: ['UltimateSDUpscale'],
      // sdxl-photo's sign detector is optional (#356): listed apart from the required custom node.
      optionalNodes: ['Florence2ModelLoader', 'Florence2Run'],
    })
    expect(byKind['documents:rail-emergency-plan']!.license).toBe('CC-BY-4.0, CC0-1.0')
    expect(byKind['examples:harbor-junction']!.title).toBe('Harbor Junction Terminal Railroad')
    const wfSize =
      Buffer.byteLength(tree['workflows/yard-cctv-still.json'] as string) +
      Buffer.byteLength(tree['workflows/yard-cctv-still.bindings.json'] as string)
    expect(byKind['workflows:yard-cctv-still']!.size).toBe(wfSize)
  })

  it('reads from a file path and keeps pack.json bytes as stored', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pack-read-'))
    const file = join(dir, 'p.aspack')
    writeFileSync(file, await buildPack())
    const r = await readPack({ path: file }, { appVersion: APP, builtins })
    expect(r.ok).toBe(true)
    if (r.ok) expect(JSON.parse(r.pack.manifestBytes.toString()).id).toBe(r.pack.manifest.id)
  })

  it('accepts a pack whose minAppVersion equals the app', async () => {
    const r = await readPack({ buffer: await buildPack() }, { appVersion: '0.3.0', builtins })
    expect(r.ok).toBe(true)
  })

  it('refuses a missing file path and a non-zip', async () => {
    const missing = await readPack({ path: '/nonexistent/x.aspack' }, { appVersion: APP, builtins })
    expect(missing.ok).toBe(false)
    const junk = await readPack({ buffer: Buffer.from('not a zip') }, { appVersion: APP, builtins })
    expect(junk).toEqual({ ok: false, problems: [{ message: 'Not a zip archive.' }] })
  })

  it('refuses an archive over the size limit', async () => {
    const r = await readPack(
      { buffer: await buildPack() },
      { appVersion: APP, builtins, limits: { maxArchiveBytes: 100 } },
    )
    expect(r.ok || r.problems[0]!.message).toMatch(/larger than the 100 byte limit/)
  })

  it('refuses a file over the per-file limit while inflating', async () => {
    const r = await readPack(
      { buffer: await buildPack() },
      { appVersion: APP, builtins, limits: { maxFileBytes: 4096 } },
    )
    expect(r.ok || r.problems.map((p) => p.message).join('\n')).toMatch(/larger than 4096 bytes/)
  })
})

describe('readPack: acceptance fixtures', () => {
  it.each(Object.entries(PACK_FIXTURES))(
    '%s fails with its specific message',
    async (_name, fx) => {
      const dir = mkdtempSync(join(tmpdir(), 'pack-bad-'))
      const file = join(dir, 'sub', 'p.aspack')
      mkdirSync(join(dir, 'sub'))
      writeFileSync(file, await fx.build())
      const r = await readPack(
        { path: file },
        { appVersion: APP, builtins, ...(fx.limits ? { limits: fx.limits } : {}) },
      )
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.problems.map((p) => `${p.path ?? ''}: ${p.message}`).join('\n')).toMatch(fx.expect)
      // The reader writes nothing: no file appeared next to the archive or above it.
      expect(readdirSync(join(dir, 'sub'))).toEqual(['p.aspack'])
      expect(readdirSync(dir)).toEqual(['sub'])
    },
  )

  it('writes every fixture archive for the CLI validator', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pack-fx-'))
    const written = await writePackFixtures(dir)
    expect(Object.keys(written)).toContain('valid')
    expect(Object.keys(written).length).toBe(Object.keys(PACK_FIXTURES).length + 1)
    expect((await readPack({ path: written.valid! }, { appVersion: APP, builtins })).ok).toBe(true)
  })
})

describe('readPack: content checks', () => {
  async function problemsFor(
    edit: (t: Record<string, string | Buffer>) => void,
    manifest?: (m: ReturnType<typeof manifestFor>) => void,
  ) {
    const tree = validPackTree()
    edit(tree)
    const r = await readPack(
      { buffer: await buildPack(tree, manifest ? { manifest } : {}) },
      { appVersion: APP, builtins },
    )
    expect(r.ok).toBe(false)
    return r.ok ? '' : r.problems.map((p) => `${p.path}: ${p.message}`).join('\n')
  }
  const T = 'templates/rail_dispatch_board'

  it('needs a taxonomy block for a template type outside the taxonomy', async () => {
    const out = await problemsFor((t) => {
      const meta = JSON.parse(t[`${T}/meta.json`] as string)
      delete meta.taxonomy
      t[`${T}/meta.json`] = JSON.stringify(meta)
    })
    expect(out).toMatch(/needs a taxonomy block/)
  })

  it('checks meta.json type, schema.json and preview.json', async () => {
    const out = await problemsFor((t) => {
      t[`${T}/meta.json`] = JSON.stringify({
        ...JSON.parse(t[`${T}/meta.json`] as string),
        type: 'other',
      })
      t[`${T}/schema.json`] = JSON.stringify({ type: 'nonsense' })
      t[`${T}/preview.json`] = JSON.stringify({ variant: 3 })
    })
    expect(out).toMatch(/type "other" must equal the folder name/)
    expect(out).toMatch(/schema.json: not a valid JSON Schema/)
    expect(out).toMatch(/preview.json: fields:/)
  })

  it('refuses a backtracking pattern, patternProperties and format in schema.json (#302)', async () => {
    const out = await problemsFor((t) => {
      t[`${T}/schema.json`] = JSON.stringify({
        type: 'object',
        properties: {
          headline: { type: 'string', pattern: '^(\\w+\\s?)*$' },
          when: { type: 'string', format: 'date-time' },
        },
        patternProperties: { '^x': { type: 'string' } },
      })
    })
    expect(out).toMatch(/schema.json: \/properties\/headline\/pattern: pattern .* uses groups/)
    expect(out).toMatch(/schema.json: \/properties\/when\/format: format "date-time"/)
    expect(out).toMatch(/schema.json: \/patternProperties: patternProperties is not allowed/)
  })

  it('refuses a prompt name the app does not ship', async () => {
    const out = await problemsFor(
      (t) => {
        t['prompts/rail_text.md'] = (t['prompts/inject_text.md'] as string).replace(
          'name: inject_text',
          'name: rail_text',
        )
        delete t['prompts/inject_text.md']
      },
      (m) => ((m.contents as { prompts: string[] }).prompts = ['rail_text']),
    )
    expect(out).toMatch(/"rail_text" is not a prompt the app ships/)
  })

  it('refuses a pack domain whose id is a built-in id', async () => {
    const out = await problemsFor((t) => {
      t['domains/heritage_rail.json'] = JSON.stringify({
        ...JSON.parse(t['domains/heritage_rail.json'] as string),
        id: 'transit',
      })
    })
    expect(out).toMatch(/id "transit" must equal the file name/)
    expect(out).toMatch(/"transit" is a built-in domain id or alias/)
  })

  it('accepts its own domain while that pack domain is registered (reinstall, update)', async () => {
    const buf = await buildPack()
    const profile = JSON.parse(validPackTree()['domains/heritage_rail.json'] as string)
    registerPackProfiles([
      {
        profile,
        packId: 'ai.actionstations.heritage-rail',
        packVersion: '1.0.0',
        packName: 'Freight Rail',
      },
    ])
    try {
      await readOk(buf)
    } finally {
      registerPackProfiles([])
    }
  })

  it('refuses a ComfyUI UI-format workflow and a bad sidecar', async () => {
    const out = await problemsFor((t) => {
      t['workflows/yard-cctv-still.json'] = JSON.stringify({ nodes: [], links: [] })
      t['workflows/yard-cctv-still.bindings.json'] = JSON.stringify({
        name: 'x',
        mediaType: 'smell',
      })
    })
    expect(out).toMatch(/ComfyUI editor \(UI\) workflow/)
    expect(out).toMatch(/bindings.json: mediaType/)
  })

  it('refuses an example whose domain is neither built-in nor in the pack', async () => {
    const out = await problemsFor((t) => {
      const ex = JSON.parse(t['examples/harbor-junction/example.json'] as string)
      t['examples/harbor-junction/example.json'] = JSON.stringify({
        ...ex,
        domainProfile: 'space',
        fictional: false,
      })
      t['examples/harbor-junction/project/project.json'] = '{}'
    })
    expect(out).toMatch(
      /domainProfile "space" is neither a built-in domain nor a domain of this pack/,
    )
    expect(out).toMatch(/example.json: fictional/)
    expect(out).toMatch(/project.json: id/)
  })

  it('refuses an example whose id differs from its folder', async () => {
    const out = await problemsFor((t) => {
      const ex = JSON.parse(t['examples/harbor-junction/example.json'] as string)
      t['examples/harbor-junction/example.json'] = JSON.stringify({ ...ex, id: 'elsewhere' })
    })
    expect(out).toMatch(/example.json: id "elsewhere" must equal the folder name "harbor-junction"/)
  })

  it('reports pack.json schema problems with their field path', async () => {
    const out = await problemsFor(
      () => {},
      (m) => (m.id = 'single'),
    )
    expect(out).toMatch(/pack.json: id: Pack id must be reverse-DNS/)
  })
})

describe('zip metadata as jszip and the scanner see it', () => {
  it('jszip rewrites "../" names and keeps the original only in unsafeOriginalName', async () => {
    const buf = patchEntry(await zipEntries([{ name: 'xx/evil.md', data: 'x' }]), 'xx/evil.md', {
      name: '../evil.md',
    })
    const zip = await JSZip.loadAsync(buf)
    const obj = Object.values(zip.files).find((f) => !f.dir)!
    expect(obj.name).toBe('evil.md')
    expect(obj.unsafeOriginalName).toBe('../evil.md')
    expect(scanCentralDirectory(buf).map((e) => e.name)).toEqual(['../evil.md'])
  })

  it('jszip refuses an encrypted archive outright; the scanner names the entry', async () => {
    const buf = patchEntry(await zipEntries([{ name: 'a.md', data: 'x' }]), 'a.md', { setFlags: 1 })
    await expect(JSZip.loadAsync(buf)).rejects.toThrow(/Encrypted zip are not supported/)
    expect(scanCentralDirectory(buf)[0]).toMatchObject({ name: 'a.md', encrypted: true })
  })

  it('jszip keeps one of two same-name entries; the scanner sees both', async () => {
    const buf = patchEntry(
      await zipEntries([
        { name: 'a.md', data: '1' },
        { name: 'b.md', data: '2' },
      ]),
      'b.md',
      { name: 'a.md' },
    )
    const zip = await JSZip.loadAsync(buf)
    expect(Object.keys(zip.files)).toEqual(['a.md'])
    expect(scanCentralDirectory(buf).map((e) => e.name)).toEqual(['a.md', 'a.md'])
  })

  it('reads the symlink file type from the unix mode', async () => {
    const buf = await zipEntries([{ name: 'l', data: '/etc', unixPermissions: 0o120777 }])
    expect((await JSZip.loadAsync(buf)).files['l']!.unixPermissions).toBe(0o120777)
    expect(scanCentralDirectory(buf)[0]!.unixType).toBe(S_IFLNK)
  })
})

describe('extractPack', () => {
  it('writes pack.json and every file into the staging folder', async () => {
    const pack = await readOk(await buildPack())
    const staging = join(mkdtempSync(join(tmpdir(), 'pack-x-')), 'staging')
    await extractPack(pack, staging)
    expect(readFileSync(join(staging, 'pack.json'))).toEqual(pack.manifestBytes)
    for (const [p, b] of pack.files) expect(readFileSync(join(staging, ...p.split('/')))).toEqual(b)
  })

  it('removes the staging folder when a path is unsafe', async () => {
    const pack = await readOk(await buildPack())
    const files = new Map(pack.files)
    files.set('templates/../../escape.md', Buffer.from('x'))
    const parent = mkdtempSync(join(tmpdir(), 'pack-x-'))
    const staging = join(parent, 'staging')
    await expect(extractPack({ ...pack, files }, staging)).rejects.toThrow(/Unsafe pack path/)
    expect(existsSync(staging)).toBe(false)
    expect(readdirSync(parent)).toEqual([])
  })

  it('refuses a non-empty staging folder and leaves it alone', async () => {
    const pack = await readOk(await buildPack())
    const staging = mkdtempSync(join(tmpdir(), 'pack-x-'))
    writeFileSync(join(staging, 'keep.txt'), 'mine')
    await expect(extractPack(pack, staging)).rejects.toThrow(/not empty/)
    expect(readFileSync(join(staging, 'keep.txt'), 'utf8')).toBe('mine')
  })
})
