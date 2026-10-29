// The AAR/IP document renderer (#419, FR-6): HSEEP layout, only confirmed ratings printed,
// evidence as counts, section markers that let the tables be re-rendered around edited prose.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Scenario, type Aar } from '@shared/schemas'
import {
  evidenceLabel,
  planSectionLabel,
  refreshAarMarkdown,
  renderAarMarkdown,
  sectionBody,
  upsertSection,
} from './markdown'

const scenario = Scenario.parse(
  JSON.parse(readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8')),
)
const task = scenario.evaluation.eegs[1]!.criticalTasks[2]!

const aar: Aar = {
  formatVersion: 1,
  createdAt: '2026-10-28T18:00:00.000Z',
  updatedAt: '2026-10-28T18:00:00.000Z',
  exerciseDate: '2026-10-28',
  executiveSummaryMd: 'The plans held, apart from the Go Dark hand-off.',
  sourcesUsed: ['facilitator', 'evaluation'],
  capabilities: [
    {
      capability: 'operational_coordination',
      rating: 'S',
      proposedRating: 'M',
      ratingRationale: 'Command was established; the hand-off was slow.',
      observationCounts: { met: 1, partial: 1, not_met: 0, not_observed: 0 },
      objectiveRefs: ['obj-decision'],
      strengths: [
        {
          id: 'f1',
          title: 'Command established early',
          analysisMd: 'Operations took command at I-01.',
          citations: [task.citation],
          evidence: ['note:I-06', 'obs:O-1', 'obs:O-2', 'hw:h1'],
          objectiveRefs: [],
          recommendation: '',
          correctiveActions: [],
          locked: false,
        },
      ],
      areasForImprovement: [
        {
          id: 'f2',
          title: 'Go Dark decided apart',
          analysisMd: 'IT decided alone.',
          citations: [],
          evidence: ['note:I-09'],
          objectiveRefs: [],
          recommendation: 'Make it a joint call.',
          correctiveActions: [
            { id: 'a1', action: 'Revise TIRP 13.6', element: 'planning', ownerRole: 'ops-director', ownerOrganization: '', poc: '', status: 'open', locked: false },
            { id: 'a2', action: 'Quarterly manual FIDS drill', element: 'exercises', ownerOrganization: 'Airport Operations', poc: 'Duty manager', startDate: '2027-01-01', dueDate: '2027-03-31', status: 'open', locked: true },
          ],
          locked: false,
        },
      ],
    },
    {
      capability: 'cybersecurity',
      proposedRating: 'U',
      ratingRationale: 'Isolation was late.',
      observationCounts: { met: 0, partial: 0, not_met: 1, not_observed: 0 },
      objectiveRefs: [],
      strengths: [],
      areasForImprovement: [],
    },
  ],
  participantFeedbackMd: '',
  participatingOrganizations: ['North Coast Regional Airport Authority', 'Skyline Air'],
  acronyms: [{ term: 'FIDS', meaning: 'Flight Information Display System' }],
  provenance: [],
}

describe('renderAarMarkdown', () => {
  const md = renderAarMarkdown(aar, scenario, 'North Coast Regional Airport Authority')

  it('follows the HSEEP layout with every section between markers', () => {
    for (const name of ['overview', 'summary', 'ratings', 'findings', 'ip', 'participants', 'acronyms'])
      expect(sectionBody(md, name as never), name).toBeTruthy()
    expect(sectionBody(md, 'feedback')).toBeUndefined()
    expect(md.indexOf('## Exercise Overview')).toBeLessThan(md.indexOf('## Executive Summary'))
    expect(md.indexOf('## Analysis of Core Capabilities')).toBeLessThan(md.indexOf('## Appendix A: Improvement Plan'))
    expect(md).toContain('## Appendix B: Exercise Participants')
    expect(md).toContain('## Appendix D: Acronyms')
    expect(md).toContain('Status: Draft (ratings pending)')
    expect(md).toContain('Evidence: facilitator notes, hot wash items and decision log; evaluator observations. Not recorded: the live-play session log; participant feedback surveys.')
  })

  it('prints only confirmed ratings and never the proposal', () => {
    const ratings = sectionBody(md, 'ratings')!
    expect(ratings).toContain('| Decision Making | Operational Coordination |  | X |  |  |  |')
    expect(ratings).toContain('| Cybersecurity |  |  |  |  | Rating pending |')
    expect(ratings).toContain('Performed with Some Challenges (S):')
    const findings = sectionBody(md, 'findings')!
    expect(findings).toContain('Rating: **Performed with Some Challenges (S)**')
    expect(findings).toContain('Rating: _Rating pending_')
    expect(findings).not.toMatch(/proposed/i)
  })

  it('writes findings with reference and evidence lines, never raw refs', () => {
    const findings = sectionBody(md, 'findings')!
    expect(findings).toContain('#### Strength 1: Command established early')
    expect(findings).toContain('**Reference:** TIRP 13.6')
    expect(findings).toContain('_Evidence: note on I-06; 2 observations; 1 hot wash item_')
    expect(findings).toContain('**Recommendation:** Make it a joint call.')
    expect(findings).not.toContain('obs:O-1')
  })

  it('fills Appendix A with one row per corrective action, the proposed role in brackets', () => {
    const ip = sectionBody(md, 'ip')!
    expect(ip).toContain('| Core Capability | Issue/Area for Improvement | Corrective Action | Capability Element | Primary Responsible Organization | Organization POC | Start Date | Completion Date |')
    expect(ip).toContain('| Operational Coordination | Go Dark decided apart | Revise TIRP 13.6 | Planning | [IC] |  |  |  |')
    expect(ip).toContain('| Quarterly manual FIDS drill | Exercises | Airport Operations | Duty manager | 2027-01-01 | 2027-03-31 |')
  })

  it('lists organizations and merges the scenario acronyms with the built-in ones', () => {
    expect(sectionBody(md, 'participants')).toContain('- Skyline Air')
    const acronyms = sectionBody(md, 'acronyms')!
    expect(acronyms).toContain('| FIDS | Flight Information Display System |')
    expect(acronyms).toContain('| HSEEP |')
  })
})

describe('refreshAarMarkdown', () => {
  it('re-renders the tables and keeps the prose a person edited', () => {
    const md = renderAarMarkdown(aar, scenario, 'NCRAA')
    const edited = upsertSection(
      upsertSection(md, 'summary', '## Executive Summary\n\nMy own words.'),
      'findings',
      '### Operational Coordination\n\nRewritten by the director.',
    )
    const confirmed: Aar = {
      ...aar,
      capabilities: aar.capabilities.map((c) => ({ ...c, rating: c.rating ?? 'M' })),
    }
    const refreshed = refreshAarMarkdown(edited, confirmed, scenario, 'NCRAA')
    expect(sectionBody(refreshed, 'summary')).toBe('## Executive Summary\n\nMy own words.')
    expect(sectionBody(refreshed, 'findings')).toContain('Rewritten by the director.')
    expect(sectionBody(refreshed, 'ratings')).toContain('| Cybersecurity |  |  | X |  |  |')
    expect(sectionBody(refreshed, 'ratings')).not.toContain('Rating pending')
  })

  it('rebuilds a document without markers but keeps prose sections it can find', () => {
    const md = refreshAarMarkdown('', aar, scenario, 'NCRAA')
    expect(sectionBody(md, 'ip')).toBeTruthy()
    const partial = '<!-- section:summary -->\nKept summary\n<!-- /section:summary -->'
    expect(sectionBody(refreshAarMarkdown(partial, aar, scenario, 'NCRAA'), 'summary')).toBe('Kept summary')
  })
})

describe('labels', () => {
  it('shortens plan sections to document and number', () => {
    expect(planSectionLabel({ documentId: 'tirp', documentTitle: 'TIRP', headingPath: 'TIRP › Section 13 › 13.6 Scenario C: FIDS / BHS System Failure', page: 41 })).toBe('TIRP 13.6 (p. 41)')
    expect(planSectionLabel({ documentId: 'asp', documentTitle: 'Airport Security Program', headingPath: 'ASP › Appendix B' })).toBe('ASP Appendix B')
    expect(planSectionLabel({ documentId: 'x', documentTitle: 'Plan', headingPath: 'Plan' })).toBe('Plan')
  })

  it('describes evidence by kind, never by id', () => {
    expect(evidenceLabel(['note:I-09', 'note:general', 'obs:a', 'obs:b', 'dec:1', 'vote:v', 'msg:m', 'msg:n', 'survey:s:q', 'log:3'])).toBe(
      'note on I-09; general notes; 2 observations; 1 decision; 1 vote; 2 messages; 1 participant feedback item; 1 log entry',
    )
  })
})
