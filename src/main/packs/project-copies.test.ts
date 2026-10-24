import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  copyPackItem,
  copyState,
  findCopy,
  forgetCopy,
  isCopyEdited,
  isCopyPathAllowed,
  readProjectPacks,
} from './project-copies'

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'as-copies-'))
  const project = join(root, 'P.asproj')
  const pack = join(root, 'pack/templates/rail_board')
  mkdirSync(project, { recursive: true })
  mkdirSync(pack, { recursive: true })
  writeFileSync(join(pack, 'template.html'), '<div>{{title}}</div>')
  writeFileSync(join(pack, 'meta.json'), '{"type":"rail_board"}')
  const source = (version: string, names = ['template.html', 'meta.json']) => ({
    pack: { id: 'org.example.rail', version, name: 'Rail' },
    kind: 'templates' as const,
    id: 'rail_board',
    files: names.map((n) => ({ from: join(pack, n), to: `templates/injects/rail_board/${n}` })),
  })
  return { project, pack, source }
}

describe('project copies of pack items', () => {
  it('copies the files and records them with their sha256', async () => {
    const { project, source } = setup()
    const copy = await copyPackItem(project, source('1.0.0'))
    expect(readFileSync(join(project, 'templates/injects/rail_board/template.html'), 'utf8')).toBe(
      '<div>{{title}}</div>',
    )
    expect(copy.files.map((f) => f.path)).toEqual([
      'templates/injects/rail_board/template.html',
      'templates/injects/rail_board/meta.json',
    ])
    expect(await findCopy(project, 'templates', 'rail_board')).toEqual(copy)
    expect(await isCopyEdited(project, copy)).toBe(false)
  })

  it('reads an absent packs.json as no copies', async () => {
    const { project } = setup()
    expect(await readProjectPacks(project)).toEqual({ copies: [] })
  })

  it('reports edited, not installed and update available', async () => {
    const { project, source } = setup()
    const copy = await copyPackItem(project, source('1.0.0'))
    expect(await copyState(project, copy, { version: '1.0.0' })).toEqual({
      edited: false,
      packMissing: false,
      updateAvailable: false,
      installedVersion: '1.0.0',
    })
    expect(await copyState(project, copy, { version: '1.1.0' })).toMatchObject({
      updateAvailable: true,
    })
    expect(await copyState(project, copy, undefined)).toMatchObject({
      packMissing: true,
      updateAvailable: false,
    })
    writeFileSync(join(project, 'templates/injects/rail_board/template.html'), '<div>mine</div>')
    expect(await copyState(project, copy, undefined)).toMatchObject({ edited: true })
  })

  it('replaces a clean copy, removing files the new version dropped', async () => {
    const { project, source } = setup()
    await copyPackItem(project, source('1.0.0'))
    const next = await copyPackItem(project, source('1.1.0', ['template.html']))
    expect(next.version).toBe('1.1.0')
    expect(existsSync(join(project, 'templates/injects/rail_board/meta.json'))).toBe(false)
    expect((await readProjectPacks(project)).copies).toHaveLength(1)
  })

  it('never replaces an edited copy unless asked', async () => {
    const { project, source } = setup()
    await copyPackItem(project, source('1.0.0'))
    writeFileSync(join(project, 'templates/injects/rail_board/template.html'), '<div>mine</div>')
    await expect(copyPackItem(project, source('1.1.0'))).rejects.toThrow(/edited/)
    expect(readFileSync(join(project, 'templates/injects/rail_board/template.html'), 'utf8')).toBe(
      '<div>mine</div>',
    )
    const replaced = await copyPackItem(project, source('1.1.0'), { replaceEdited: true })
    expect(replaced.version).toBe('1.1.0')
  })

  it('refuses a destination outside the project', async () => {
    const { project, pack } = setup()
    await expect(
      copyPackItem(project, {
        pack: { id: 'org.example.rail', version: '1.0.0' },
        kind: 'templates',
        id: 'x',
        files: [{ from: join(pack, 'meta.json'), to: '../escape.json' }],
      }),
    ).rejects.toThrow(/not a templates path/)
  })

  it('forgets a record and keeps the files', async () => {
    const { project, source } = setup()
    await copyPackItem(project, source('1.0.0'))
    await forgetCopy(project, 'templates', 'rail_board')
    expect(await findCopy(project, 'templates', 'rail_board')).toBeUndefined()
    expect(existsSync(join(project, 'templates/injects/rail_board/template.html'))).toBe(true)
  })
})

describe('packs.json record paths are not trusted (#302)', () => {
  /** Write a packs.json whose rail_board record lists `paths` (as a shared project could). */
  function forgedRecord(project: string, paths: string[]) {
    const copy = {
      kind: 'templates',
      id: 'rail_board',
      packId: 'org.example.rail',
      version: '1.0.0',
      copiedAt: '2026-01-01T00:00:00.000Z',
      files: paths.map((path) => ({ path, sha256: '0'.repeat(64) })),
    }
    writeFileSync(join(project, 'packs.json'), JSON.stringify({ copies: [copy] }))
    return copy as Parameters<typeof isCopyEdited>[1]
  }

  it('allows each kind only its own folder', () => {
    expect(isCopyPathAllowed('templates', 'rail_board', 'templates/injects/rail_board/a.css')).toBe(
      true,
    )
    expect(
      isCopyPathAllowed('templates', 'rail_board', 'templates/injects/rail_board/fonts/a.woff2'),
    ).toBe(true)
    expect(isCopyPathAllowed('templates', 'rail_board', 'templates/injects/other/a.css')).toBe(
      false,
    )
    expect(isCopyPathAllowed('templates', 'rail_board', 'templates/injects/rail_board')).toBe(false)
    expect(isCopyPathAllowed('templates', 'rail_board', 'templates/injects/rail_board/../x')).toBe(
      false,
    )
    expect(isCopyPathAllowed('templates', 'rail_board', 'project.json')).toBe(false)
    expect(isCopyPathAllowed('workflows', 'wf', 'comfy/workflows/wf.json')).toBe(true)
    expect(isCopyPathAllowed('workflows', 'wf', 'comfy/workflows/wf.bindings.json')).toBe(true)
    expect(isCopyPathAllowed('workflows', 'wf', 'comfy/workflows/other.json')).toBe(false)
    expect(isCopyPathAllowed('documents', 'p/s', 'documents/abc/original.md')).toBe(true)
    expect(isCopyPathAllowed('documents', 'p/s', 'documents/abc/sub/original.md')).toBe(false)
    expect(isCopyPathAllowed('documents', 'p/s', 'documents/./original.md')).toBe(false)
    expect(isCopyPathAllowed('documents', 'p/s', 'documents\\abc\\original.md')).toBe(false)
    expect(isCopyPathAllowed('domains', 'd', 'domains/d.json')).toBe(false)
  })

  it('never removes a recorded file outside the item folder', async () => {
    const { project, source } = setup()
    writeFileSync(join(project, 'project.json'), '{}')
    const outside = join(project, '..', 'outside.txt')
    writeFileSync(outside, 'keep')
    forgedRecord(project, ['project.json', '../outside.txt'])
    await copyPackItem(project, source('1.1.0'), { replaceEdited: true })
    expect(readFileSync(join(project, 'project.json'), 'utf8')).toBe('{}')
    expect(readFileSync(outside, 'utf8')).toBe('keep')
  })

  it('never removes through a symlinked folder in the project', async () => {
    const { project, source } = setup()
    const victim = mkdtempSync(join(tmpdir(), 'as-victim-'))
    writeFileSync(join(victim, 'secret.txt'), 'keep')
    mkdirSync(join(project, 'templates/injects'), { recursive: true })
    symlinkSync(victim, join(project, 'templates/injects/rail_board'))
    forgedRecord(project, ['templates/injects/rail_board/secret.txt'])
    await expect(copyPackItem(project, source('1.1.0'), { replaceEdited: true })).rejects.toThrow(
      /symlink/,
    )
    expect(readFileSync(join(victim, 'secret.txt'), 'utf8')).toBe('keep')
    expect(readdirSync(victim)).toEqual(['secret.txt'])
  })

  it('skips removing an old file whose folder is a symlink, and still copies', async () => {
    const { project, source } = setup()
    const victim = mkdtempSync(join(tmpdir(), 'as-victim-'))
    writeFileSync(join(victim, 'secret.txt'), 'keep')
    mkdirSync(join(project, 'templates/injects/rail_board'), { recursive: true })
    symlinkSync(victim, join(project, 'templates/injects/rail_board/fonts'))
    forgedRecord(project, ['templates/injects/rail_board/fonts/secret.txt'])
    const copy = await copyPackItem(project, source('1.1.0'), { replaceEdited: true })
    expect(copy.files).toHaveLength(2)
    expect(readFileSync(join(victim, 'secret.txt'), 'utf8')).toBe('keep')
  })

  it('refuses to write through a symlinked templates root', async () => {
    const { project, source } = setup()
    const elsewhere = mkdtempSync(join(tmpdir(), 'as-elsewhere-'))
    symlinkSync(elsewhere, join(project, 'templates'))
    await expect(copyPackItem(project, source('1.0.0'))).rejects.toMatchObject({
      code: 'PATH_ESCAPE',
    })
    expect(readdirSync(elsewhere)).toEqual([])
    expect(existsSync(join(project, 'packs.json'))).toBe(false)
  })

  it('reads a symlinked or out-of-folder record file as edited, without following it', async () => {
    const { project, source } = setup()
    const copy = await copyPackItem(project, source('1.0.0'))
    expect(await isCopyEdited(project, copy)).toBe(false)
    // Same bytes behind a link: still edited, the link is not followed.
    const dir = join(project, 'templates/injects/rail_board')
    const real = join(mkdtempSync(join(tmpdir(), 'as-real-')), 'template.html')
    writeFileSync(real, readFileSync(join(dir, 'template.html')))
    rmSync(join(dir, 'template.html'))
    symlinkSync(real, join(dir, 'template.html'))
    expect(await isCopyEdited(project, copy)).toBe(true)
    expect(
      await isCopyEdited(project, { ...copy, files: [{ ...copy.files[1]!, path: 'x' }] }),
    ).toBe(true)
  })

  it('refuses a source file that is a symlink', async () => {
    const { project, pack, source } = setup()
    const link = join(pack, 'linked.html')
    symlinkSync(join(pack, 'template.html'), link)
    const src = source('1.0.0')
    await expect(
      copyPackItem(project, {
        ...src,
        files: [{ from: link, to: 'templates/injects/rail_board/template.html' }],
      }),
    ).rejects.toThrow(/Not a regular file/)
  })
})
