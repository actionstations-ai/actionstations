// scripts/check-user-docs.mjs: run as a CLI against small repository trees.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = resolve('scripts/check-user-docs.mjs')

function tree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'ttx-userdocs-'))
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  return dir
}

function check(dir: string) {
  const r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}

describe('check-user-docs', () => {
  it('passes plain product documentation', () => {
    const dir = tree({
      'docs/guides/start.md': '# Start\n\nOpen **Projects** and click **New project**.\n',
      'docs/packs-format.md': 'A pack is a zip file.\n',
    })
    const r = check(dir)
    expect(r.status).toBe(0)
    expect(r.out).toContain('no internal references')
  })

  it.each([
    ['an ADR number', 'See ADR-0018 for the design.', 'ADR number'],
    ['a spec number', 'Described in spec 0423.', 'spec number'],
    ['an issue number', 'Fixed in (#123) last week.', 'issue or PR number'],
    ['a test file', 'Covered by tests/scripts/foo.test.ts today.', 'test file'],
    ['a source path', 'Lives in src/main/packs/reader.ts.', 'source path'],
    ['a developer command', 'Run pnpm test before you ask.', 'developer command'],
  ])('fails on %s and prints file:line', (_label, line, name) => {
    const dir = tree({ 'docs/guides/a.md': `# A\n\n${line}\n` })
    const r = check(dir)
    expect(r.status).toBe(1)
    expect(r.out).toContain('docs/guides/a.md:3:')
    expect(r.out).toContain(name)
  })

  it('ignores text inside fenced code blocks', () => {
    const dir = tree({
      'docs/guides/a.md': '# A\n\n```bash\npnpm test # see #123 and ADR-0001\n```\n\nDone.\n',
    })
    expect(check(dir).status).toBe(0)
  })

  it('checks the single files and nested guide folders, and ignores other docs', () => {
    const dir = tree({
      'docs/guides/providers/x.md': 'Uses ADR-0010.\n',
      'docs/accessibility/ACR-508.md': 'Evidence: e2e/a11y.spec.ts\n',
      'docs/02-ARCHITECTURE.md': 'ADR-0001 and src/main/ are fine here.\n',
    })
    const r = check(dir)
    expect(r.status).toBe(1)
    expect(r.out).toContain('docs/guides/providers/x.md:1')
    expect(r.out).toContain('docs/accessibility/ACR-508.md:1')
    expect(r.out).not.toContain('02-ARCHITECTURE')
  })

  it('does not flag hex colors, headings or ordinary words', () => {
    const dir = tree({
      'docs/guides/a.md': '# Heading\n\nColor #ff0000 and step #1 and item#12.\n',
    })
    expect(check(dir).status).toBe(0)
  })

  it('passes on the real repository documents', () => {
    expect(check(resolve('.')).status).toBe(0)
  })
})
