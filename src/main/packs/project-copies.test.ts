import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  copyPackItem,
  copyState,
  findCopy,
  forgetCopy,
  isCopyEdited,
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
    ).rejects.toThrow(/escapes/)
  })

  it('forgets a record and keeps the files', async () => {
    const { project, source } = setup()
    await copyPackItem(project, source('1.0.0'))
    await forgetCopy(project, 'templates', 'rail_board')
    expect(await findCopy(project, 'templates', 'rail_board')).toBeUndefined()
    expect(existsSync(join(project, 'templates/injects/rail_board/template.html'))).toBe(true)
  })
})
