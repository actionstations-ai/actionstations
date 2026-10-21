// Ingest timing (parse + text.md + chunk; embedding is the index's cost and is excluded).
// Prints the numbers so they can be quoted; fails only far past the 30 s / 60 pages budget.
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPdf, planPdfPages } from '../../../tests/fixtures/ingest/builders'
import { chunkSections } from './chunker'
import { deriveShortName } from './headings'
import { parseFile } from './parsers'
import { renderTextMd } from './text-md'

async function ingestTimed(path: string) {
  const start = performance.now()
  const doc = await parseFile(path)
  renderTextMd(doc)
  const chunks = chunkSections(doc.sections, deriveShortName(doc.title, path))
  return { ms: performance.now() - start, pages: doc.pages, chunks: chunks.length }
}

describe('ingest performance', () => {
  it('reference/ncia/*.md', async () => {
    const files = readdirSync('reference/ncia').filter((f) => f.endsWith('.md'))
    const start = performance.now()
    let chunks = 0
    for (const f of files) chunks += (await ingestTimed(join('reference/ncia', f))).chunks
    const ms = performance.now() - start
    console.log(
      `[perf] ${files.length} NCIA markdown files → ${chunks} chunks in ${ms.toFixed(0)} ms`,
    )
    expect(ms).toBeLessThan(5_000)
  })

  it('60-page PDF', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'ttx-perf-')), 'plan-60.pdf')
    writeFileSync(path, buildPdf(planPdfPages(60, 8)))
    const r = await ingestTimed(path)
    console.log(`[perf] 60-page PDF → ${r.chunks} chunks in ${r.ms.toFixed(0)} ms`)
    expect(r.pages).toBe(60)
    expect(r.ms).toBeLessThan(30_000)
  }, 60_000)
})
