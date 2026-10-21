import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { chunkSections } from './chunker'
import { buildHeadingPath, classifyHeading, deriveShortName } from './headings'
import { parseMarkdown } from './parsers/markdown'

const reference = (name: string) => {
  const file = `reference/ncia/${name}`
  const doc = parseMarkdown(readFileSync(file, 'utf8'), { fallbackTitle: name })
  const shortName = deriveShortName(doc.title, name)
  return { doc, shortName, chunks: chunkSections(doc.sections, shortName) }
}

describe('classifyHeading', () => {
  it.each([
    [
      'SECTION 13: TECHNICAL INCIDENT – CYBERSECURITY & IT SYSTEMS FAILURE',
      'division',
      2,
      'Section 13',
    ],
    ['APPENDIX 6: CYBER-PHYSICAL INCIDENTS', 'division', 2, 'Appendix 6'],
    ['ANNEX A: CONTACT LISTS (Mock-Up)', 'division', 2, 'Annex A'],
    ['Annex B Terminal Shelter Locations', 'division', 2, 'Annex B'],
    ['PART II: HAZARD-SPECIFIC APPENDICES', 'part', 1, 'Part II'],
    ['Part II — Appendices', 'part', 1, 'Part II'],
    ['Part 3', 'part', 1, 'Part 3'],
    ['CHAPTER 3', 'division', 2, 'Chapter 3'],
    [
      '13.6 Scenario C: FIDS / BHS System Failure',
      'numbered',
      3,
      '13.6 Scenario C: FIDS / BHS System Failure',
    ],
    ['6.2.1 Backup Power', 'numbered', 4, '6.2.1 Backup Power'],
    ['D.1 Network Topology', 'numbered', 3, 'D.1 Network Topology'],
    ['5.1–5.2 Purpose and Assumptions', 'numbered', 3, '5.1–5.2 Purpose and Assumptions'],
  ])('%s', (text, kind, level, label) => {
    expect(classifyHeading(text)).toEqual({ kind, level, label })
  })

  it('leaves free-text headings alone and does not read words as roman numerals', () => {
    expect(classifyHeading('Table of Contents')).toEqual({
      kind: 'plain',
      label: 'Table of Contents',
    })
    expect(classifyHeading('Section civil defense').kind).toBe('plain')
    expect(classifyHeading('**Supporting** Documents').label).toBe('Supporting Documents')
  })
})

describe('deriveShortName', () => {
  it('takes the last acronym in parentheses', () => {
    expect(deriveShortName('Terminal Incident Response Plan (TIRP)')).toBe('TIRP')
    expect(
      deriveShortName('North Coast International Airport (NCIA) — Airport Emergency Plan (AEP)'),
    ).toBe('AEP')
  })

  it('falls back to a filename acronym, a short title, or initials', () => {
    expect(deriveShortName('Security plan', 'airport-security-program-ASP.md')).toBe('ASP')
    expect(deriveShortName('Hot Wash Notes')).toBe('Hot Wash Notes')
    expect(deriveShortName('Continuity of Operations Plan for the Terminal')).toBe('COPT')
  })
})

describe('heading paths on the NCIA reference plans', () => {
  it('TIRP: Section 13 › 13.6 Scenario C', () => {
    const { shortName, chunks } = reference('terminal-incident-response-plan-TIRP.md')
    expect(shortName).toBe('TIRP')
    const paths = chunks.map((c) => c.headingPath)
    expect(paths).toContain('TIRP › Section 13 › 13.6 Scenario C: FIDS / BHS System Failure')
    expect(paths).toContain('TIRP › Section 1 › 1.3 Coordinated Use with Other Documents')
    expect(paths).toContain('TIRP › Annex A')
  })

  it('AEP: Part II › Appendix 6 › 6.2 Critical Systems & Impact', () => {
    const { shortName, chunks } = reference('airport-emergency-plan-AEP.md')
    expect(shortName).toBe('AEP')
    const paths = chunks.map((c) => c.headingPath)
    expect(paths).toContain('AEP › Part II › Appendix 6 › 6.2 Critical Systems & Impact')
    expect(paths).toContain('AEP › Part I › Section 4 › 4.5 EOC Activation Levels')
  })

  it('ASP: lettered appendix subsections', () => {
    const { chunks } = reference('airport-security-program-ASP.md')
    expect(chunks.map((c) => c.headingPath)).toContain('ASP › Appendix D › D.1 Network Topology')
  })

  it('every path starts with the short name and uses the › separator', () => {
    const { chunks } = reference('airport-emergency-plan-AEP.md')
    for (const c of chunks) expect(c.headingPath.startsWith('AEP')).toBe(true)
    expect(buildHeadingPath('X', ['SECTION 2: A', '2.1 B'])).toBe('X › Section 2 › 2.1 B')
  })
})
