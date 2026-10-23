import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureDefaultOutDir } from './default-dir'

describe('default export folder (#238)', () => {
  it('creates <project>/exports on the first export there', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ttx-export-'))
    expect(await ensureDefaultOutDir(join(root, 'exports'), [root])).toBe(true)
    expect(existsSync(join(root, 'exports'))).toBe(true)
    // Again: already there.
    expect(await ensureDefaultOutDir(join(root, 'exports/'), [root])).toBe(true)
  })

  it('never creates any other folder', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ttx-export-'))
    for (const dir of [join(root, 'elsewhere'), join(root, 'exports', 'deeper'), 'exports']) {
      expect(await ensureDefaultOutDir(dir, [root])).toBe(false)
    }
    expect(existsSync(join(root, 'elsewhere'))).toBe(false)
    expect(existsSync(join(root, 'exports'))).toBe(false)
  })
})
