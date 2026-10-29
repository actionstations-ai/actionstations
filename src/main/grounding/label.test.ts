// FR-4 label rules (#423): each branch with a short plan passage, plus similarity and facts.
import { describe, expect, it } from 'vitest'
import type { Citation } from '@shared/schemas'
import { labelClaims } from './label'
import { phraseKey } from './normalize'
import { preparePassage, type Passage } from './support'

const PASSAGE: Passage = {
  chunkId: 7,
  documentId: 'erp',
  documentTitle: 'Emergency Response Plan',
  headingPath: 'ERP › Section 5 › 5.3 External Reporting Clocks',
  text:
    'The Water Quality Manager notifies the Ohio EPA district office within 2 hours of a confirmed ' +
    'exceedance. The Director declares a Level 3 condition and activates the Emergency Operations Center. ' +
    'Public notice follows within 24 hours.',
}
const OTHER: Passage = {
  chunkId: 9,
  documentId: 'erp',
  documentTitle: 'Emergency Response Plan',
  headingPath: 'ERP › Section 12 › 12.1 Mutual Aid',
  text: 'Mutual aid requests go through OHWARN. The utility keeps a list of spare pumps and generators.',
}
const cite = (p: Passage): Citation => ({
  documentId: p.documentId,
  documentTitle: p.documentTitle,
  headingPath: p.headingPath,
  chunkId: p.chunkId,
})

const label = (claimText: string, passages: Passage[], extra: { facts?: string[] } = {}) =>
  labelClaims({
    claimText,
    citations: passages.length ? passages.map(cite) : [cite(PASSAGE)],
    passages: passages.map(preparePassage),
    facts: new Set((extra.facts ?? []).map(phraseKey)),
  })

describe('grounding labels (FR-4)', () => {
  it('is grounded when every claim matches and every term is in the passage', () => {
    const r = label(
      'The Water Quality Manager notifies the Ohio EPA district office within 2 hours of the confirmed exceedance.',
      [PASSAGE],
    )
    expect(r.label).toBe('grounded')
    expect(r.reason).toBe('Every claim matches 5.3 External Reporting Clocks.')
    expect(r.claims[0]).toMatchObject({ chunkId: 7, missing: [], conflicting: [] })
    expect(r.claims[0]!.matched).toEqual(
      expect.arrayContaining(['2 hours', 'Water Quality Manager', 'notifies']),
    )
  })

  it('is unsupported when a duration differs from the plan in the same statement', () => {
    const r = label(
      'The Water Quality Manager notifies the Ohio EPA district office within 1 hour of a confirmed exceedance.',
      [PASSAGE],
    )
    expect(r.label).toBe('unsupported')
    expect(r.reason).toMatch(
      /^‘1 hour’ is not in 5\.3 External Reporting Clocks; the passage says ‘.*within 2 hours/,
    )
  })

  it('is unsupported when nothing is cited, or the cited chunk left the index', () => {
    const none = labelClaims({
      claimText: 'The Director declares a Level 3 condition.',
      citations: [],
      passages: [],
      facts: new Set(),
    })
    expect(none).toMatchObject({
      label: 'unsupported',
      reason: 'No plan passage is cited for this claim.',
    })
    const gone = label('The Director declares a Level 3 condition.', [])
    expect(gone.label).toBe('unsupported')
    expect(gone.reason).toMatch(/no longer in the index/)
  })

  it('is unsupported when the passage does not address the claim', () => {
    expect(label('Security posts a guard at the Chemical Building doors.', [OTHER]).label).toBe(
      'unsupported',
    )
  })

  it('needs review when a named term is missing from the passage', () => {
    const r = label(
      'The Director declares a Level 3 condition and activates the EOC per SOP 4.2.',
      [PASSAGE],
    )
    expect(r.label).toBe('review')
    expect(r.reason).toContain('‘SOP 4.2’')
  })

  it('needs review when only part of the claim is in the passage', () => {
    const r = label(
      'The Director declares a Level 3 condition, closes the visitor centre, cancels tours and moves staff to the annex.',
      [PASSAGE],
    )
    expect(r.label).toBe('review')
    expect(r.reason).toMatch(/^Only \d+% of/)
  })

  it('counts an identifier stated in the facility facts', () => {
    const claim =
      'The Director declares a Level 3 condition and activates the Emergency Operations Center at MBW-EOC-1.'
    expect(label(claim, [PASSAGE]).label).toBe('review')
    expect(label(claim, [PASSAGE], { facts: ['MBW-EOC-1'] }).label).toBe('grounded')
  })

  it('makes no claim for an empty field or text with no plan terms and no citation', () => {
    expect(
      labelClaims({ claimText: '', citations: [], passages: [], facts: new Set() }).label,
    ).toBe('none')
    expect(
      labelClaims({
        claimText: 'Players react to the post.',
        citations: [],
        passages: [],
        facts: new Set(),
      }).label,
    ).toBe('none')
  })

  it('lets embedding similarity support a claim worded differently', () => {
    const claim = 'Regulators hear about it soon after the lab is sure.'
    const base = {
      claimText: claim,
      citations: [cite(PASSAGE)],
      passages: [preparePassage(PASSAGE)],
      facts: new Set<string>(),
    }
    expect(labelClaims(base).label).not.toBe('grounded')
    const similarity = new Map([[claim, new Map([[7, 0.91]])]])
    const r = labelClaims({ ...base, similarity })
    expect(r.label).toBe('grounded')
    expect(r.claims[0]!.similarity).toBe(0.91)
  })

  it('checks section references in the event against the citations', () => {
    const r = labelClaims({
      claimText: 'The Water Quality Manager notifies the Ohio EPA district office within 2 hours.',
      referenceText: 'Phone call quoting ERP 9.4 on advisory areas.',
      citations: [cite(PASSAGE)],
      passages: [preparePassage(PASSAGE)],
      facts: new Set(),
    })
    expect(r.label).toBe('review')
    expect(r.claims.at(-1)!.text).toBe('Referenced: ERP 9.4')
  })
})
