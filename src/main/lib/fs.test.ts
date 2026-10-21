import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { readJson, safeJoin, safeJoinReal, slugify, toRel, writeJsonAtomic } from './fs'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'

describe('safeJoin', () => {
  const root = '/projects/NCIA.ttxproj'
  it('joins paths inside the root', () => {
    expect(safeJoin(root, 'scenarios/abc/scenario.json')).toBe(
      '/projects/NCIA.ttxproj/scenarios/abc/scenario.json',
    )
  })
  it('rejects parent traversal', () => {
    expect(() => safeJoin(root, '../other/secret.json')).toThrow(/escapes/)
    expect(() => safeJoin(root, 'media/../../x')).toThrow(/escapes/)
  })
  it('never resolves to the root itself', () => {
    for (const p of ['', '.', '..', 'scenarios/..', 'a/../'])
      expect(() => safeJoin(root, p), p).toThrow(/escapes/)
  })
  it('allows names that merely start with two dots', () => {
    expect(safeJoin(root, '..notes.md')).toBe('/projects/NCIA.ttxproj/..notes.md')
  })
  it('rejects absolute paths', () => {
    expect(() => safeJoin(root, '/etc/passwd')).toThrow(/Absolute/)
    expect(() => safeJoin(root, 'C:\\Windows')).toThrow(/Absolute/)
  })
  it('round-trips with toRel', () => {
    expect(toRel(root, safeJoin(root, 'documents/d1/text.md'))).toBe('documents/d1/text.md')
  })
})

describe('JSON helpers', () => {
  it('writes atomically and reads back with schema validation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-fs-'))
    const file = join(dir, 'nested/x.json')
    await writeJsonAtomic(file, { a: 1 })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ a: 1 })
    await expect(readJson(file, z.object({ a: z.number() }))).resolves.toEqual({ a: 1 })
    await expect(readJson(file, z.object({ a: z.string() }))).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    await expect(readJson(join(dir, 'missing.json'), z.any())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('slugify', () => {
  it('makes folder-safe names', () => {
    expect(slugify('North Coast Int’l Airport (NCIA)')).toBe('North-Coast-Int-l-Airport-NCIA')
    expect(slugify('   ')).toBe('untitled')
  })
})

describe('safeJoinReal', () => {
  it('rejects symlinks that point outside the root', () => {
    const outside = mkdtempSync(join(tmpdir(), 'ttx-out-'))
    writeFileSync(join(outside, 'secret.txt'), 'x')
    const root = mkdtempSync(join(tmpdir(), 'ttx-root-'))
    mkdirSync(join(root, 'media'))
    writeFileSync(join(root, 'media', 'ok.png'), 'png')
    symlinkSync(join(outside, 'secret.txt'), join(root, 'media', 'link.png'))
    expect(safeJoinReal(root, 'media/ok.png')).toContain('ok.png')
    expect(() => safeJoinReal(root, 'media/link.png')).toThrow(/Symlink/)
  })
})
