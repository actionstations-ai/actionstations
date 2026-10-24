// scripts/make-badges.mjs: offline README badges written by local CI (#317).
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  badgeValues,
  buildBadgeFiles,
  escapeXml,
  licenseName,
  parsePlaywrightList,
  parseVitestPassed,
  platformsFrom,
  renderBadge,
  textWidth,
  writeChanged,
} from '../../scripts/make-badges.mjs'

const FACTS = {
  unitTests: 2271,
  e2eTests: 71,
  e2eFiles: 37,
  version: '0.1.0',
  license: 'PolyForm Internal Use 1.0.0 + education',
  electron: '45.0.0',
  platforms: 'macOS | Windows | Linux',
}

describe('renderBadge', () => {
  it('draws a label box and a message box whose widths add up', () => {
    const svg = renderBadge({ label: 'version', message: '0.1.0', color: '#1565c0' })
    const total = Number(svg.match(/<svg[^>]* width="(\d+)"/)?.[1])
    const rects = [...svg.matchAll(/<rect (?:x="\d+" )?width="(\d+)" height="20" fill="#/g)]
    expect(rects.map((r) => Number(r[1])).reduce((a, b) => a + b)).toBe(total)
    expect(svg).toContain('aria-label="version: 0.1.0"')
    expect(svg).toContain('fill="#1565c0"')
  })

  it('escapes markup in labels and messages', () => {
    const svg = renderBadge({ label: 'a<b', message: '"x" & y', color: '#000' })
    expect(svg).not.toMatch(/a<b/)
    expect(svg).toContain('a&lt;b')
    expect(svg).toContain('&quot;x&quot; &amp; y')
    expect(escapeXml(`'`)).toBe('&apos;')
  })

  it('measures wider text as wider', () => {
    expect(textWidth('WWW')).toBeGreaterThan(textWidth('iii'))
    expect(textWidth('')).toBe(0)
  })
})

describe('parsers', () => {
  it('reads the passed count from Vitest output, with or without colors', () => {
    const log =
      ' Test Files  243 passed | 7 skipped (250)\n      Tests  2271 passed | 25 skipped (2296)\n'
    expect(parseVitestPassed(log)).toBe(2271)
    expect(parseVitestPassed('\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m12 passed\x1b[39m')).toBe(
      12,
    )
    expect(parseVitestPassed('no summary')).toBeNull()
  })

  it('reads test and file counts from playwright --list', () => {
    expect(parsePlaywrightList('...\nTotal: 71 tests in 37 files\n')).toEqual({
      tests: 71,
      files: 37,
    })
    expect(parsePlaywrightList('Total: 1 test in 1 file')).toEqual({ tests: 1, files: 1 })
    expect(parsePlaywrightList('')).toBeNull()
  })

  it('names the license from LICENSE.md and the education permission', () => {
    const md = '# PolyForm Internal Use License 1.0.0\n\n<https://...>\n'
    expect(licenseName(md, true)).toBe('PolyForm Internal Use 1.0.0 + education')
    expect(licenseName(md, false)).toBe('PolyForm Internal Use 1.0.0')
  })

  it('lists the platforms electron-builder.yml configures', () => {
    expect(platformsFrom('appId: x\nmac:\n  a: 1\nwin:\n  b: 2\nlinux:\n  c: 3\n')).toBe(
      'macOS | Windows | Linux',
    )
    expect(platformsFrom('mac:\n  target: dmg\n')).toBe('macOS')
  })

  it('matches what the repository has today', () => {
    const root = join(__dirname, '..', '..')
    const license = licenseName(readFileSync(join(root, 'LICENSE.md'), 'utf8'), true)
    expect(license).toBe('PolyForm Internal Use 1.0.0 + education')
    const yml = readFileSync(join(root, 'electron-builder.yml'), 'utf8')
    expect(platformsFrom(yml)).toBe('macOS | Windows | Linux')
  })
})

describe('buildBadgeFiles', () => {
  const values = badgeValues(FACTS)

  it('writes one SVG per badge plus badges.json', () => {
    const files = buildBadgeFiles(values, null, '2026-10-24')
    expect(Object.keys(files).sort()).toEqual(
      [
        'badges.json',
        'ci.svg',
        'e2e.svg',
        'electron.svg',
        'license.svg',
        'local-first.svg',
        'platforms.svg',
        'telemetry.svg',
        'unit-tests.svg',
        'version.svg',
      ].sort(),
    )
    expect(files['ci.svg']).toContain('passing · 2026-10-24')
    expect(files['unit-tests.svg']).toContain('2271 passed')
    expect(files['e2e.svg']).toContain('71 tests in 37 specs')
    expect(JSON.parse(files['badges.json'] ?? '')).toEqual({ ciDate: '2026-10-24', values })
  })

  it('keeps the previous date when no value changed, so a green rerun changes nothing', () => {
    const first = buildBadgeFiles(values, null, '2026-10-01')
    const again = buildBadgeFiles(values, JSON.parse(first['badges.json'] ?? ''), '2026-10-24')
    expect(again).toEqual(first)
  })

  it('moves the date when a value changed', () => {
    const first = buildBadgeFiles(values, null, '2026-10-01')
    const more = badgeValues({ ...FACTS, unitTests: 2300 })
    const next = buildBadgeFiles(more, JSON.parse(first['badges.json'] ?? ''), '2026-10-24')
    expect(next['ci.svg']).toContain('passing · 2026-10-24')
    expect(next['unit-tests.svg']).toContain('2300 passed')
  })
})

describe('writeChanged', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  it('writes new files, then skips files whose content is unchanged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'badges-'))
    dirs.push(dir)
    const files = buildBadgeFiles(badgeValues(FACTS), null, '2026-10-24')
    expect(writeChanged(dir, files)).toHaveLength(Object.keys(files).length)
    const before = statSync(join(dir, 'ci.svg')).mtimeMs
    expect(writeChanged(dir, files)).toEqual([])
    expect(statSync(join(dir, 'ci.svg')).mtimeMs).toBe(before)
    expect(readdirSync(dir)).toHaveLength(Object.keys(files).length)
  })
})
