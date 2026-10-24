// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { CachedCatalogView } from '@shared/ipc'
import type { PackCatalogEntry } from '@shared/schemas/pack'
import { descriptionHtml } from './description'
import {
  archiveShaText,
  countsText,
  entryState,
  filterEntries,
  latestEntries,
  NO_FILTER,
  sourceText,
} from './pack-format'

const entry = (over: Partial<PackCatalogEntry>): PackCatalogEntry => ({
  id: 'org.example.a',
  name: 'A',
  version: '1.0.0',
  formatVersion: 1,
  summary: 'A pack',
  author: { name: 'Ann' },
  license: 'MIT',
  kinds: ['prompts'],
  domains: [],
  tags: [],
  minAppVersion: '0.3.0',
  size: 1,
  sha256: 'a'.repeat(64),
  url: 'https://example.org/a.aspack',
  updated: '2026-10-01T00:00:00Z',
  ...over,
})

const catalog = (entries: PackCatalogEntry[]): CachedCatalogView => ({
  url: 'https://example.org/index.json',
  name: 'Example',
  fetchedAt: '2026-10-01T00:00:00Z',
  skipped: 0,
  entries,
})

describe('pack-format', () => {
  it('keeps the newest version of each pack per catalog', () => {
    const list = latestEntries([
      catalog([
        entry({ version: '1.0.0' }),
        entry({ version: '1.10.0' }),
        entry({ version: '1.2.0' }),
      ]),
    ])
    expect(list.map((e) => e.entry.version)).toEqual(['1.10.0'])
  })

  it('filters by search text, kind, domain and tag', () => {
    const list = latestEntries([
      catalog([
        entry({ id: 'org.example.a', name: 'Dam ops', kinds: ['domains'], domains: ['dam'] }),
        entry({ id: 'org.example.b', name: 'Bus', tags: ['transit'], author: { name: 'Zed' } }),
      ]),
    ])
    const names = (f: Partial<typeof NO_FILTER>) =>
      filterEntries(list, { ...NO_FILTER, ...f }).map((e) => e.entry.name)
    expect(names({ query: 'zed' })).toEqual(['Bus'])
    expect(names({ kind: 'domains' })).toEqual(['Dam ops'])
    expect(names({ domain: 'dam' })).toEqual(['Dam ops'])
    expect(names({ tag: 'transit' })).toEqual(['Bus'])
  })

  it('compares an entry with what is installed', () => {
    const have = [{ id: 'org.example.a', version: '1.1.0' }] as never
    expect(entryState(entry({ version: '1.2.0' }), have)).toEqual({
      kind: 'update',
      installed: '1.1.0',
    })
    expect(entryState(entry({ version: '1.1.0' }), have)).toEqual({
      kind: 'installed',
      version: '1.1.0',
    })
    expect(entryState(entry({ version: '1.0.0' }), have).kind).toBe('newer-installed')
    expect(entryState(entry({ id: 'org.example.z' }), have).kind).toBe('available')
  })

  it('describes sources, hashes and counts in words', () => {
    expect(sourceText({ kind: 'file', name: 'a.aspack' })).toBe('File: a.aspack')
    expect(sourceText({ kind: 'unknown' })).toMatch(/^Not recorded/)
    expect(archiveShaText('unknown')).toMatch(/^Not recorded/)
    expect(archiveShaText('f'.repeat(64))).toBe('f'.repeat(64))
    const item = { replacesBuiltin: false, license: 'MIT', size: 1, title: 't' }
    expect(
      countsText([
        { ...item, kind: 'prompts', id: 'a' },
        { ...item, kind: 'templates', id: 'b' },
        { ...item, kind: 'prompts', id: 'c' },
      ]),
    ).toBe('1 template, 2 prompts')
  })
})

describe('descriptionHtml', () => {
  it('renders Markdown as text only', () => {
    // Starts with a paragraph: under happy-dom, DOMPurify drops a leading element's tag.
    const html = descriptionHtml(
      'Intro\n\n# Title\n\n**Bold** <b onclick="x()">raw</b> <img src="https://x.test/a.png">\n\n![alt text](https://x.test/b.png) [site](https://example.org)',
    )
    expect(html).toContain('<h3>Title</h3>')
    expect(html).toContain('<strong>Bold</strong>')
    expect(html).toContain('&lt;b onclick="x()"&gt;raw&lt;/b&gt;')
    expect(html).not.toMatch(/<img|<a |<b /)
    expect(html).toContain('alt text')
    expect(html).toContain('site (https://example.org)')
  })
})
