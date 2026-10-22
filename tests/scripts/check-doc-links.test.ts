// scripts/check-doc-links.mjs: run as a CLI against small Markdown trees.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = resolve('scripts/check-doc-links.mjs')

function tree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'ttx-links-'))
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

describe('check-doc-links', () => {
  it('passes when files, folders and heading anchors exist', () => {
    const dir = tree({
      'a.md': [
        '# Guide',
        '[b](sub/b.md#setup-steps) [self](#guide) [folder](sub/) ![img](sub/pic.png)',
        '[web](https://example.com) [mail](mailto:x@example.com)',
        '[ref]: sub/b.md',
      ].join('\n'),
      'sub/b.md': '# B\n\n## Setup steps\n',
      'sub/pic.png': 'png',
    })
    const r = check(dir)
    expect(r.out).toContain('links ok in 2 Markdown files')
    expect(r.status).toBe(0)
  })

  it('reports a missing file and a missing heading with their line numbers', () => {
    const dir = tree({
      'a.md': '# A\n\n[gone](missing.md)\n[bad anchor](b.md#nope)\n',
      'b.md': '# B\n',
    })
    const r = check(dir)
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/a\.md:3\s+missing\.md\s+\(file not found\)/)
    expect(r.out).toMatch(/a\.md:4\s+b\.md#nope\s+\(no heading #nope\)/)
    expect(r.out).toContain('2 broken link(s)')
  })

  it('ignores links inside fenced and inline code', () => {
    const dir = tree({
      'a.md': '# A\n\n```md\n[x](nowhere.md)\n```\n\nUse `[y](also-nowhere.md)` here.\n',
    })
    expect(check(dir).status).toBe(0)
  })

  it('numbers repeated headings like GitHub (-1, -2)', () => {
    const dir = tree({
      'a.md': '# A\n\n## Troubleshooting\n\n## Troubleshooting\n\n[second](#troubleshooting-1)\n',
    })
    expect(check(dir).status).toBe(0)
  })
})
