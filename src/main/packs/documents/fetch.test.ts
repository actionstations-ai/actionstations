// fetch-documents (#325) against a local http server: pinned files land in the cache, a file
// whose sha256 differs is refused and never written, bot pages are rejected, mirrors and the
// inbox are used, and pin mode records new hashes.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bytes, sha256, startServer, type TestServer } from '../test-server'
import { applyPins, fetchDocuments, manualDownloadLines, sniffProblem } from './fetch'
import { DocumentsManifest } from './manifest'

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n')
const NEW_EDITION = Buffer.from('%PDF-1.7\n% revised edition\n%%EOF\n')
const HTML = Buffer.from('<!DOCTYPE html><html><body>Please verify you are a human</body></html>')

let server: TestServer
const seen: Record<string, string | undefined> = {}
beforeAll(async () => {
  server = await startServer()
  server.route('/doc.pdf', bytes(PDF))
  server.route('/new.pdf', bytes(NEW_EDITION))
  server.route('/bot.pdf', (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' }).end(HTML)
  })
  server.route('/ranged.pdf', (req, res) => {
    seen.range = req.headers.range
    seen.ua = req.headers['user-agent']
    res.writeHead(206, { 'content-range': `bytes 0-${PDF.length - 1}/${PDF.length}` }).end(PDF)
  })
  let busy = 1
  server.route('/busy.pdf', (_req, res) => {
    if (busy-- > 0) res.writeHead(429, { 'retry-after': '0' }).end('slow down')
    else res.writeHead(200).end(PDF)
  })
})
afterAll(() => server.close())

const entry = (slug: string, path: string, over: Record<string, unknown> = {}) => ({
  pack: 'test-library',
  slug,
  file: `${slug}.pdf`,
  title: slug,
  publisher: 'Test agency',
  edition: '2026',
  url: server.url(path),
  sha256: sha256(PDF),
  size: PDF.length,
  license: 'LicenseRef-US-Government-Work',
  basis: 'US federal government work',
  ...over,
})
const manifestOf = (docs: Record<string, unknown>[]) =>
  DocumentsManifest.parse({
    formatVersion: 1,
    libraries: {
      'test-library': {
        name: 'Test reference library',
        summary: 'Test.',
        domain: 'generic',
        version: '1.0.0',
      },
    },
    documents: docs,
  })
const cache = () => mkdtempSync(join(tmpdir(), 'ttx-docs-'))
const quick = { retryBaseMs: 1, concurrency: 2 }

describe('fetchDocuments', () => {
  it('downloads a pinned document into <cache>/<slug>/<file> with browser-like headers', async () => {
    const dir = cache()
    const [r] = await fetchDocuments(manifestOf([entry('a', '/ranged.pdf')]), {
      cacheDir: dir,
      ...quick,
    })
    expect(r?.status).toBe('fetched')
    expect(readFileSync(join(dir, 'a', 'a.pdf'))).toEqual(PDF)
    expect(seen.range).toBe('bytes=0-')
    expect(seen.ua).toMatch(/Mozilla\/5\.0/)
  })

  it('refuses a file whose sha256 differs from the manifest and does not write it', async () => {
    const dir = cache()
    const m = manifestOf([entry('a', '/new.pdf')])
    const [r] = await fetchDocuments(m, { cacheDir: dir, ...quick })
    expect(r?.status).toBe('mismatch')
    expect(r?.sha256).toBe(sha256(NEW_EDITION))
    expect(existsSync(join(dir, 'a', 'a.pdf'))).toBe(false)
    expect(manualDownloadLines(m, [r!], dir).join('\n')).toMatch(/differs from the pinned/)
  })

  it('refuses a mismatch in pin mode too, unless the slug is named in repin', async () => {
    const dir = cache()
    const m = manifestOf([entry('a', '/new.pdf')])
    expect((await fetchDocuments(m, { cacheDir: dir, pin: true, ...quick }))[0]?.status).toBe(
      'mismatch',
    )
    const [r] = await fetchDocuments(m, { cacheDir: dir, pin: true, repin: ['a'], ...quick })
    expect(r?.status).toBe('pinned')
    expect(applyPins(m, [r!], '2026-10-24').documents[0]).toMatchObject({
      sha256: sha256(NEW_EDITION),
      size: NEW_EDITION.length,
      pinned: '2026-10-24',
    })
  })

  it('rejects an HTML bot page served in place of the file and tries the mirrors', async () => {
    const dir = cache()
    const m = manifestOf([entry('a', '/bot.pdf', { mirrors: [server.url('/doc.pdf')] })])
    const [r] = await fetchDocuments(m, { cacheDir: dir, ...quick })
    expect(r?.status).toBe('fetched')
    expect(r?.from).toBe(server.url('/doc.pdf'))
    expect(r?.errors[0]).toMatch(/HTML page/)
  })

  it('reports a document no URL could serve, with where to save it by hand', async () => {
    const dir = cache()
    const m = manifestOf([entry('a', '/bot.pdf'), entry('b', '/missing.pdf')])
    const results = await fetchDocuments(m, { cacheDir: dir, ...quick })
    expect(results.map((r) => r.status)).toEqual(['failed', 'failed'])
    const lines = manualDownloadLines(m, results, dir).join('\n')
    expect(lines).toContain(join(dir, 'a', 'a.pdf'))
    expect(lines).toContain('HTTP 404')
  })

  it('retries after 429', async () => {
    const [r] = await fetchDocuments(manifestOf([entry('a', '/busy.pdf')]), {
      cacheDir: cache(),
      ...quick,
    })
    expect(r?.status).toBe('fetched')
  })

  it('records the hash of an unpinned document only in pin mode', async () => {
    const dir = cache()
    const m = manifestOf([entry('a', '/doc.pdf', { sha256: null, size: null })])
    expect((await fetchDocuments(m, { cacheDir: dir, ...quick }))[0]?.status).toBe('unpinned')
    expect(existsSync(join(dir, 'a', 'a.pdf'))).toBe(false)
    const [r] = await fetchDocuments(m, { cacheDir: dir, pin: true, ...quick })
    expect(r).toMatchObject({ status: 'pinned', sha256: sha256(PDF), size: PDF.length })
    expect(existsSync(join(dir, 'a', 'a.pdf'))).toBe(true)
  })

  it('uses the cache and the inbox without the network', async () => {
    const dir = cache()
    mkdirSync(join(dir, 'inbox'), { recursive: true })
    writeFileSync(join(dir, 'inbox', 'downloaded in a browser.pdf'), PDF)
    const m = manifestOf([entry('a', '/missing.pdf')])
    expect((await fetchDocuments(m, { cacheDir: dir, offline: true }))[0]?.status).toBe('inbox')
    expect(existsSync(join(dir, 'inbox', 'downloaded in a browser.pdf'))).toBe(false)
    expect((await fetchDocuments(m, { cacheDir: dir, offline: true }))[0]?.status).toBe('cached')
  })

  it('reports a hand-placed cache file with the wrong hash as a mismatch', async () => {
    const dir = cache()
    mkdirSync(join(dir, 'a'), { recursive: true })
    writeFileSync(join(dir, 'a', 'a.pdf'), NEW_EDITION)
    const [r] = await fetchDocuments(manifestOf([entry('a', '/doc.pdf')]), {
      cacheDir: dir,
      offline: true,
    })
    expect(r?.status).toBe('mismatch')
  })
})

describe('sniffProblem', () => {
  it('tells documents from error pages', () => {
    expect(sniffProblem('a.pdf', PDF)).toBeUndefined()
    expect(sniffProblem('a.pdf', HTML)).toMatch(/HTML/)
    expect(sniffProblem('a.docx', PDF)).toMatch(/zip/)
    expect(sniffProblem('a.pdf', Buffer.from('hello'))).toBe('not a PDF')
  })
})
