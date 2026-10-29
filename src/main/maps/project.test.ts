// Project maps (#436): maps.json with revisions, site plan import, and the path guards.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ProjectMaps } from '@shared/schemas'
import { solidPng } from '../../../tests/fixtures/maps/fixtures'

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0', getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { readProjectMaps, saveProjectMaps } = await import('./project')
const { imageSize, importSitePlan, MAX_PLAN_PIXELS } = await import('./import-plan')

const project = () => mkdtempSync(join(tmpdir(), 'maps-proj-'))
const picture = (dir: string, name = 'terminal.png', png = solidPng(40, [10, 20, 30, 255])) => {
  const path = join(dir, name)
  writeFileSync(path, png)
  return path
}

describe('site plan import', () => {
  it('copies the image into maps/<id>/ and records its size', async () => {
    const root = project()
    const done = await importSitePlan(root, { filePath: picture(root), title: 'Terminal' })
    expect(done.layer).toMatchObject({
      kind: 'site_plan',
      title: 'Terminal',
      width: 40,
      height: 40,
    })
    expect(done.layer.kind === 'site_plan' && done.layer.image).toMatch(
      /^maps\/plan-[a-z0-9]+\/plan\.png$/,
    )
    expect(done.maps.defaultMapId).toBe(done.layer.id)
    const onDisk = readFileSync(join(root, (done.layer as { image: string }).image))
    expect(onDisk.length).toBeGreaterThan(0)
    expect((await readProjectMaps(root)).maps.maps).toHaveLength(1)
  })

  it('refuses a PDF with a clear message, other file types, and images over 50 megapixels', async () => {
    const root = project()
    await expect(
      importSitePlan(root, { filePath: picture(root, 'a.pdf'), title: 'x' }),
    ).rejects.toThrow(/PDF pages are not supported yet/)
    await expect(
      importSitePlan(root, { filePath: picture(root, 'a.gif'), title: 'x' }),
    ).rejects.toThrow(/\.png, \.jpg or \.webp/)
    const big = solidPng(8, [0, 0, 0, 255])
    big.writeUInt32BE(10_000, 16)
    big.writeUInt32BE(6_000, 20)
    expect(10_000 * 6_000).toBeGreaterThan(MAX_PLAN_PIXELS)
    await expect(
      importSitePlan(root, { filePath: picture(root, 'big.png', big), title: 'x' }),
    ).rejects.toThrow(/50 megapixels/)
    await expect(
      importSitePlan(root, { filePath: picture(root, 'bad.png', Buffer.from('nope')), title: 'x' }),
    ).rejects.toThrow(/not a valid PNG/)
  })

  it('reads sizes from PNG, JPEG and WebP headers', () => {
    const jpeg = Buffer.from(
      'ffd8ffe000104a46494600010100000100010000ffc0001108012c0190030111000211010311010000',
      'hex',
    )
    expect(imageSize(solidPng(12, [0, 0, 0, 255]))).toEqual({ width: 12, height: 12 })
    expect(imageSize(jpeg)).toEqual({ width: 400, height: 300 })
    const webp = Buffer.alloc(30)
    webp.write('RIFF', 0)
    webp.write('WEBP', 8)
    webp.write('VP8X', 12)
    webp.writeUIntLE(799, 24, 3)
    webp.writeUIntLE(599, 27, 3)
    expect(imageSize(webp)).toEqual({ width: 800, height: 600 })
  })
})

describe('maps.json', () => {
  const place = { id: 'gate', label: 'Gate A1', positions: [{ mapId: 'm1', x: 10, y: 20 }] }

  it('refuses a stale revision with CONFLICT', async () => {
    const root = project()
    const first = await readProjectMaps(root)
    await saveProjectMaps(root, ProjectMaps.parse({}), first.revision)
    await expect(
      saveProjectMaps(root, ProjectMaps.parse({}), first.revision),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('refuses a place pinned to a map that does not exist, and a missing default map', async () => {
    const root = project()
    const { revision } = await readProjectMaps(root)
    await expect(
      saveProjectMaps(root, ProjectMaps.parse({ places: [place] }), revision),
    ).rejects.toThrow(/does not exist/)
    await expect(
      saveProjectMaps(root, ProjectMaps.parse({ defaultMapId: 'nope' }), revision),
    ).rejects.toThrow(/default map/)
  })

  it('refuses site plan files outside their own maps/<id>/ folder', async () => {
    const root = project()
    mkdirSync(join(root, 'maps', 'm1'), { recursive: true })
    const { revision } = await readProjectMaps(root)
    const layer = (image: string) =>
      ProjectMaps.parse({
        maps: [
          { kind: 'site_plan', id: 'm1', title: 'T', source: image, image, width: 5, height: 5 },
        ],
      })
    await expect(
      saveProjectMaps(root, layer('maps/other/plan.png'), revision),
    ).rejects.toMatchObject({ code: 'PATH_ESCAPE' })
    // The schema refuses these before the folder check runs.
    expect(() => layer('../outside.png')).toThrow()
    expect(() => layer('/etc/passwd')).toThrow()
  })

  it('keeps fields a newer version added', async () => {
    const root = project()
    const { revision } = await readProjectMaps(root)
    const saved = await saveProjectMaps(root, ProjectMaps.parse({ future: { a: 1 } }), revision)
    expect((await readProjectMaps(root)).maps).toMatchObject({ future: { a: 1 } })
    expect(saved.revision).not.toBe(revision)
  })
})
