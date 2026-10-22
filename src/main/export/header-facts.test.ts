import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dropDuplicateHeaderFacts } from './header-facts'

const sample = (name: string) =>
  readFileSync(resolve('tests/fixtures/generate/sample-run', name), 'utf8')

const BRIEFING_HEADER = ['Location', 'Duration', 'Exercise time']
const HANDBOOK_HEADER = ['Location', 'Duration', 'Exercise date']

describe('dropDuplicateHeaderFacts (#154)', () => {
  it('drops the briefing fact segments the export header shows and keeps the weather', () => {
    const md = sample('briefing.md')
    const out = dropDuplicateHeaderFacts(md, BRIEFING_HEADER)
    const opening = out.split('### 1.')[0]!
    expect(opening).not.toMatch(/Location:|Exercise Duration:|Current Time:/)
    expect(opening).toContain('Weather: Clear skies, light winds, temperature 28°F')
    expect(out).toContain('## Light Out — ALCS Cyber-Intrusion & Manual Lighting Response')
    // Everything after the opening paragraph is untouched.
    expect(out.slice(out.indexOf('### 1.'))).toBe(md.slice(md.indexOf('### 1.')))
  })

  it('drops the whole handbook fact line when the header shows every fact in it', () => {
    const md = sample('handbook.md')
    const out = dropDuplicateHeaderFacts(md, HANDBOOK_HEADER)
    expect(out).not.toContain('Exercise Date: [Date]')
    expect(out).not.toContain('Duration: 4 Hours')
    expect(out.slice(out.indexOf('### 1.'))).toBe(md.slice(md.indexOf('### 1.')))
  })

  it('keeps a fact the header does not print (empty header fact)', () => {
    const out = dropDuplicateHeaderFacts(sample('briefing.md'), ['Location', 'Duration'])
    expect(out).toContain('Current Time: 09:00 AM (Exercise Time)')
    expect(out).not.toContain('Exercise Duration: 4 Hours')
  })

  it('leaves a body that opens with prose alone', () => {
    const md = '# Briefing\n\nThe exercise takes place at Location: X · in the morning.\n'
    expect(dropDuplicateHeaderFacts(md, BRIEFING_HEADER)).toBe(md)
  })

  it('only touches the first paragraph', () => {
    const md = '# T\n\nIntro text.\n\nLocation: Here · Duration: 2 Hours\n'
    expect(dropDuplicateHeaderFacts(md, BRIEFING_HEADER)).toBe(md)
  })

  it('handles bold labels', () => {
    const md = '## T\n\n**Location:** Here · **Duration:** 2 Hours\n\nBody'
    expect(dropDuplicateHeaderFacts(md, BRIEFING_HEADER)).toBe('## T\n\n\nBody')
  })
})
