// The AAR/IP document renderer (#419, FR-6): HSEEP layout, only confirmed ratings printed,
// evidence as counts, section markers that let the tables be re-rendered around edited prose.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Scenario, type Aar } from '@shared/schemas'
import { ConductDetails } from '@shared/schemas/scenario'
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
            {
              id: 'a1',
              action: 'Revise TIRP 13.6',
              element: 'planning',
              ownerRole: 'ops-director',
              ownerOrganization: '',
              poc: '',
              status: 'open',
              locked: false,
            },
            {
              id: 'a2',
              action: 'Quarterly manual FIDS drill',
              element: 'exercises',
              ownerOrganization: 'Airport Operations',
              poc: 'Duty manager',
              startDate: '2027-01-01',
              dueDate: '2027-03-31',
              status: 'open',
              locked: true,
            },
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
    for (const name of [
      'overview',
      'summary',
      'ratings',
      'findings',
      'ip',
      'participants',
      'acronyms',
    ])
      expect(sectionBody(md, name as never), name).toBeTruthy()
    expect(sectionBody(md, 'feedback')).toBeUndefined()
    expect(md.indexOf('## Exercise Overview')).toBeLessThan(md.indexOf('## Executive Summary'))
    expect(md.indexOf('## Analysis of Core Capabilities')).toBeLessThan(
      md.indexOf('## Appendix A: Improvement Plan'),
    )
    expect(md).toContain('## Appendix B: Exercise Participants')
    expect(md).toContain('## Appendix D: Acronyms')
    expect(md).toContain('Status: Draft (ratings pending)')
    expect(md).toContain(
      'Evidence: facilitator notes, hot wash items and decision log; evaluator observations. Not recorded: the live-play session log; participant feedback surveys.',
    )
  })

  it('prints only confirmed ratings and never the proposal', () => {
    const ratings = sectionBody(md, 'ratings')!
    expect(ratings).toContain(
      '| Decision Making | Operational Coordination |  | X |  |  | Performed with Some Challenges (S) |',
    )
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
    expect(ip).toContain(
      '| Core Capability | Issue/Area for Improvement | Corrective Action | Capability Element | Primary Responsible Organization | Organization POC | Start Date | Completion Date |',
    )
    expect(ip).toContain(
      '| Operational Coordination | Go Dark decided apart | Revise TIRP 13.6 | Planning | [IC] |  |  |  |',
    )
    expect(ip).toContain(
      '| Quarterly manual FIDS drill | Exercises | Airport Operations | Duty manager | 2027-01-01 | 2027-03-31 |',
    )
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
    expect(sectionBody(refreshed, 'ratings')).toContain(
      '| Cybersecurity |  |  | X |  | Performed with Major Challenges (M) |',
    )
    expect(sectionBody(refreshed, 'ratings')).not.toContain('Rating pending')
  })

  it('refreshes each capability rating line and the table status in the findings prose', () => {
    const pending: Aar = {
      ...aar,
      capabilities: aar.capabilities.map((c) => ({ ...c, rating: undefined })),
    }
    const md = renderAarMarkdown(pending, scenario, 'NCRAA')
    expect(md).toContain('Rating: _Rating pending_')
    const confirmed: Aar = {
      ...aar,
      capabilities: aar.capabilities.map((c) => ({ ...c, rating: 'M' })),
    }
    const refreshed = refreshAarMarkdown(md, confirmed, scenario, 'NCRAA')
    expect(refreshed).not.toContain('Rating pending')
    expect(refreshed).toContain('Rating: **Performed with Major Challenges (M)**')
    expect(sectionBody(refreshed, 'ratings')).toContain('| Performed with Major Challenges (M) |')
  })

  it('prints the point of contact from the exercise details', () => {
    const withContact = {
      ...scenario,
      conduct: ConductDetails.parse({
        director: { name: 'Exercise Director', email: 'exercises@ncraa.example' },
      }),
    }
    const md = renderAarMarkdown(aar, withContact, 'NCRAA')
    expect(md).toContain('| **Point of Contact** | Exercise Director, exercises@ncraa.example |')
    expect(renderAarMarkdown(aar, scenario, 'NCRAA')).toContain('[Name, title, organization')
  })

  it('updates the date and status line once the ratings are confirmed', () => {
    const draft: Aar = {
      ...aar,
      exerciseDate: undefined,
      capabilities: aar.capabilities.map((c) => ({ ...c, rating: undefined })),
    }
    const md = renderAarMarkdown(draft, scenario, 'NCRAA')
    expect(md).toContain('Exercise date: [Date] · NCRAA · Status: Draft (ratings pending)')
    const confirmed: Aar = {
      ...aar,
      capabilities: aar.capabilities.map((c) => ({ ...c, rating: 'S' })),
    }
    const refreshed = refreshAarMarkdown(md, confirmed, scenario, 'NCRAA')
    expect(refreshed).toContain('Exercise date: 2026-10-28 · NCRAA · Status: Reviewed')
    expect(refreshed).not.toContain('Draft (ratings pending)')
  })

  it('rebuilds a document without markers but keeps prose sections it can find', () => {
    const md = refreshAarMarkdown('', aar, scenario, 'NCRAA')
    expect(sectionBody(md, 'ip')).toBeTruthy()
    const partial = '<!-- section:summary -->\nKept summary\n<!-- /section:summary -->'
    expect(sectionBody(refreshAarMarkdown(partial, aar, scenario, 'NCRAA'), 'summary')).toBe(
      'Kept summary',
    )
  })
})

describe('labels', () => {
  it('shortens plan sections to document and number', () => {
    expect(
      planSectionLabel({
        documentId: 'tirp',
        documentTitle: 'TIRP',
        headingPath: 'TIRP › Section 13 › 13.6 Scenario C: FIDS / BHS System Failure',
        page: 41,
      }),
    ).toBe('TIRP 13.6 (p. 41)')
    expect(
      planSectionLabel({
        documentId: 'asp',
        documentTitle: 'Airport Security Program',
        headingPath: 'ASP › Appendix B',
      }),
    ).toBe('ASP Appendix B')
    expect(planSectionLabel({ documentId: 'x', documentTitle: 'Plan', headingPath: 'Plan' })).toBe(
      'Plan',
    )
  })

  it('describes evidence by kind, never by id', () => {
    expect(
      evidenceLabel([
        'note:I-09',
        'note:general',
        'obs:a',
        'obs:b',
        'dec:1',
        'vote:v',
        'msg:m',
        'msg:n',
        'survey:s:q',
        'log:3',
      ]),
    ).toBe(
      'note on I-09; general notes; 2 observations; 1 decision; 1 vote; 2 messages; 1 participant feedback item; 1 log entry',
    )
  })
})

describe('Field metrics section', () => {
  const metric = {
    metricId: 'decision_timing',
    title: 'Decision timing',
    computedAt: '2026-10-28T18:00:00.000Z',
    config: {},
    inputs: [{ label: 'Ground-truth events scored', value: '3' }],
    summary: [
      { label: 'Hits', value: '2' },
      { label: 'POD (probability of detection)', value: '0.667' },
    ],
    tables: [{ title: 'Events', columns: ['Event', 'Outcome'], rows: [['e1', 'Hit']] }],
    caveats: ['Lead time is measured on hits only.'],
    data: {},
  }

  it('prints the inputs, the numbers, the tables and the caveats before the improvement plan', () => {
    const md = renderAarMarkdown(aar, scenario, 'NCRAA', {}, [metric])
    const body = sectionBody(md, 'metrics')!
    expect(body).toContain('## Field Metrics')
    expect(body).toContain('- Ground-truth events scored: 3')
    expect(body).toContain('0.667')
    expect(body).toContain('| e1 | Hit |')
    expect(body).toContain('Lead time is measured on hits only.')
    expect(md.indexOf('section:metrics')).toBeLessThan(md.indexOf('section:ip'))
  })

  it('leaves the section out when no metric ran', () => {
    expect(renderAarMarkdown(aar, scenario, 'NCRAA')).not.toContain('section:metrics')
  })

  it('adds the section to an existing document on refresh and keeps edited prose', () => {
    const md = renderAarMarkdown(aar, scenario, 'NCRAA')
    const edited = upsertSection(md, 'summary', 'My own summary.')
    const refreshed = refreshAarMarkdown(edited, aar, scenario, 'NCRAA', [metric])
    expect(sectionBody(refreshed, 'summary')).toBe('My own summary.')
    expect(sectionBody(refreshed, 'metrics')).toContain('Decision timing')
    expect(refreshed.indexOf('section:metrics')).toBeLessThan(refreshed.indexOf('section:ip'))
    const again = refreshAarMarkdown(refreshed, aar, scenario, 'NCRAA', [
      { ...metric, summary: [{ label: 'Hits', value: '5' }] },
    ])
    expect(again.match(/<!-- section:metrics -->/g)).toHaveLength(1)
    expect(sectionBody(again, 'metrics')).toContain('| Hits | 5 |')
  })
})
