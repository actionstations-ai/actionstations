import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject, loadProject, updateProject } = await import('./store')
const { resetSettingsCache } = await import('../settings/store')
const { brandLogoFile, clearLogo, importLogo, sniffLogoType, LOGO_MAX_BYTES } =
  await import('./logo')

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])

describe('project logo (#217)', () => {
  let root: string
  let scratch: string
  beforeEach(async () => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
    scratch = mkdtempSync(join(tmpdir(), 'ttx-logo-src-'))
    root = (await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-p-')), name: 'Logo' }))
      .path
  })
  const source = (name: string, data: Uint8Array) => {
    const p = join(scratch, name)
    writeFileSync(p, data)
    return p
  }

  it('copies the image into brand/ under a content name and stores the relative path', async () => {
    const project = await importLogo(root, source('Our Logo.PNG', PNG))
    expect(project.brand.logoPath).toMatch(/^brand\/logo-[0-9a-f]{12}\.png$/)
    expect(existsSync(join(root, project.brand.logoPath!))).toBe(true)
    expect((await loadProject(root)).brand.logoPath).toBe(project.brand.logoPath)
  })

  it('names the copy after the bytes, not the extension the user gave it', async () => {
    const project = await importLogo(root, source('logo.png', JPEG))
    expect(project.brand.logoPath).toMatch(/\.jpg$/)
  })

  it('replacing the logo deletes the previous copy; clearing deletes the current one', async () => {
    const first = (await importLogo(root, source('a.png', PNG))).brand.logoPath!
    const second = (await importLogo(root, source('b.jpg', JPEG))).brand.logoPath!
    expect(readdirSync(join(root, 'brand'))).toEqual([second.split('/')[1]])
    expect(existsSync(join(root, first))).toBe(false)
    const cleared = await clearLogo(root)
    expect(cleared.brand.logoPath).toBeUndefined()
    expect(readdirSync(join(root, 'brand'))).toEqual([])
  })

  it('rejects files that are not PNG, JPEG or WebP, and files over 2 MB', async () => {
    await expect(importLogo(root, source('evil.png', Buffer.from('<svg/>')))).rejects.toMatchObject(
      { code: 'VALIDATION' },
    )
    const big = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES)])
    await expect(importLogo(root, source('big.png', big))).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('2 MB'),
    })
    await expect(importLogo(root, scratch)).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(importLogo(root, join(scratch, 'gone.png'))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect((await loadProject(root)).brand.logoPath).toBeUndefined()
  })

  it('never deletes a file outside brand/ that logoPath pointed at', async () => {
    writeFileSync(join(root, 'documents', 'seal.png'), PNG)
    await updateProject(root, (p) => {
      p.brand.logoPath = 'documents/seal.png'
    })
    await importLogo(root, source('new.png', PNG))
    expect(existsSync(join(root, 'documents', 'seal.png'))).toBe(true)
  })

  it('resolves the logo for rendering only when it is an image inside the project', async () => {
    const { brand } = await importLogo(root, source('a.png', PNG))
    expect(await brandLogoFile(root, brand)).toBe(realpathSync(join(root, brand.logoPath!)))
    expect(await brandLogoFile(root, { logoPath: 'brand/missing.png' })).toBeUndefined()
    expect(await brandLogoFile(root, undefined)).toBeUndefined()
    writeFileSync(join(root, 'notes.png'), 'not an image')
    expect(await brandLogoFile(root, { logoPath: 'notes.png' })).toBeUndefined()
    symlinkSync(source('outside.png', PNG), join(root, 'brand', 'link.png'))
    expect(await brandLogoFile(root, { logoPath: 'brand/link.png' })).toBeUndefined()
  })

  it('sniffs PNG, JPEG and WebP signatures', () => {
    expect(sniffLogoType(PNG)).toBe('png')
    expect(sniffLogoType(JPEG)).toBe('jpg')
    expect(sniffLogoType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp')
    expect(sniffLogoType(Buffer.from('GIF89a'))).toBeUndefined()
  })
})
