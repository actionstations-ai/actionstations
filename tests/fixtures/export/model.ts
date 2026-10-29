// An ExportModel for unit tests: the Scenario 3 fixture plus a handful of injects whose assets
// live in a temporary project folder (PNG, paper PDF, generated slot image, WAV, MP4 + poster).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { WaveFile } from 'wavefile'
import { Aar, conductOf, Inject, Scenario, type MediaAsset } from '../../../src/shared/schemas'
import type { ExportModel } from '../../../src/main/export/model'
import { evaluationOf } from '../../../src/main/export/evaluation'
import { planMediaFiles } from '../../../src/main/export/naming'

const ULID = (n: number) => `01M5GJ27PWYJ1CJB60T579J4${String(n).padStart(2, '0')}`
const provenance = { provider: 'template', createdAt: '2026-10-21T00:00:00.000Z' }

export function fixtureScenario(): Scenario {
  const raw = JSON.parse(
    readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
  ) as unknown
  return Scenario.parse(raw)
}

function wav(): Uint8Array {
  const w = new WaveFile()
  w.fromScratch(
    1,
    8000,
    '16',
    new Int16Array(800).map((_, i) => Math.round(Math.sin(i) * 9000)),
  )
  return w.toBuffer()
}

function asset(
  root: string,
  injectId: string,
  id: string,
  kind: MediaAsset['kind'],
  ext: string,
  role: MediaAsset['role'],
  data: Uint8Array | string,
  extra: Partial<MediaAsset> = {},
): MediaAsset {
  const rel = `scenarios/scenario-3/media/${injectId}/${id}.${ext}`
  mkdirSync(join(root, 'scenarios/scenario-3/media', injectId), { recursive: true })
  writeFileSync(join(root, rel), data)
  return { id, kind, path: rel, role, provenance, ...extra }
}

/** Injects for I-02a (paper ticket), I-04 (tweet composite), I-05b (radio + WAV), I-06 (video). */
export function fixtureInjects(root: string): Inject[] {
  const mk = (id: string, mselRowId: string, type: string, assets: MediaAsset[], extra = {}) =>
    Inject.parse({
      id,
      mselRowId,
      type,
      title: `${type} for ${mselRowId}`,
      fields: {},
      instructorNote: `Note for ${mselRowId}`,
      assets,
      ...extra,
    })
  const posterRel = 'scenarios/scenario-3/media/inj-06/poster.png'
  mkdirSync(join(root, 'scenarios/scenario-3/media/inj-06'), { recursive: true })
  writeFileSync(join(root, posterRel), 'poster-png')
  return [
    mk('inj-02a', 'I-02a', 'helpdesk_ticket', [
      asset(root, 'inj-02a', ULID(1), 'image', 'png', 'rendered', 'png-02a'),
      asset(root, 'inj-02a', ULID(2), 'pdf', 'pdf', 'rendered', 'pdf-02a'),
    ]),
    mk('inj-04', 'I-04', 'tweet', [
      asset(root, 'inj-04', `attached_image-${ULID(3)}`, 'image', 'png', 'generated', 'ai-04'),
      asset(root, 'inj-04', ULID(4), 'image', 'png', 'composite', 'composite-04'),
    ]),
    mk(
      'inj-05b',
      'I-05b',
      'radio_call',
      [
        asset(root, 'inj-05b', ULID(5), 'audio', 'wav', 'generated', wav(), { durationSec: 37 }),
        asset(root, 'inj-05b', ULID(6), 'image', 'png', 'rendered', 'png-05b'),
      ],
      { deliveryMode: 'play_audio' },
    ),
    mk(
      'inj-06',
      'I-06',
      'fids_board',
      [
        asset(root, 'inj-06', ULID(7), 'video', 'mp4', 'generated', 'mp4-06', {
          posterPath: posterRel,
          durationSec: 12,
        }),
      ],
      { deliveryMode: 'display_main_screen' },
    ),
    mk('inj-07', 'I-07', 'memo', [], { includeInDeck: false }),
  ]
}

export function fixtureModel(overrides: Partial<ExportModel> = {}): ExportModel {
  const root = mkdtempSync(join(tmpdir(), 'ttx-export-model-'))
  const scenario = fixtureScenario()
  const injects = fixtureInjects(root)
  const available = new Set(
    injects.flatMap((i) =>
      i.assets.flatMap((a) => [a.path, ...(a.posterPath ? [a.posterPath] : [])]),
    ),
  )
  return {
    root,
    project: {
      id: 'ncia',
      name: 'North Coast International Airport',
      orgName: 'North Coast Regional Airport Authority',
      scenarios: [],
      brand: { aliases: {} },
    },
    scenario,
    injects,
    docs: {
      handbook: readFileSync(resolve('reference/scenario-3/controller-handbook.md'), 'utf8'),
      briefing: readFileSync(resolve('reference/scenario-3/player-briefing.md'), 'utf8'),
      hotwash: '',
      overview: '',
      handouts: '',
      controller_handouts: '',
      aar: '',
    },
    scenarioNo: '3',
    media: planMediaFiles('3', injects),
    available,
    generatedAt: '2026-10-21T12:00:00.000Z',
    surveys: [],
    conduct: conductOf(scenario),
    ...(evaluationOf(scenario) ? { evaluation: evaluationOf(scenario)! } : {}),
    aar: null,
    ...overrides,
  }
}

const readFixture = (name: string): unknown =>
  JSON.parse(readFileSync(resolve('tests/fixtures/export', name), 'utf8'))

/** The fixture model with hand-written exercise details and SitMan modules (#420). */
export function hseepFixtureModel(overrides: Partial<ExportModel> = {}): ExportModel {
  const model = fixtureModel(overrides)
  model.scenario = Scenario.parse({
    ...model.scenario,
    conduct: readFixture('scenario-3.conduct.json'),
    sitman: readFixture('scenario-3.sitman.json'),
  })
  model.conduct = conductOf(model.scenario)
  return model
}

/** The model as for a scenario written before the eeg stage existed: no evaluation guides. */
export function withoutEvaluation(model: ExportModel): ExportModel {
  model.scenario.evaluation = { objectiveCapabilities: [], eegs: [] }
  delete model.evaluation
  return model
}

const AAR_AT = '2026-10-29T15:00:00.000Z'

/** The fixture's EEG citation for a task id (so AAR findings cite real plan sections). */
function taskCitation(scenario: Scenario, taskId: string) {
  const task = scenario.evaluation.eegs.flatMap((e) => e.criticalTasks).find((t) => t.id === taskId)
  if (!task) throw new Error(`No task ${taskId} in the Scenario 3 fixture`)
  return task.citation
}

/**
 * A hand-written AAR/IP for the Scenario 3 fixture (#419): one capability rated and confirmed,
 * one with a proposal awaiting confirmation, one with neither. Evidence refs name notes,
 * observations and hot wash items of the kind the record builder produces.
 */
export function fixtureAar(): Aar {
  const s = fixtureScenario()
  return Aar.parse({
    createdAt: AAR_AT,
    updatedAt: AAR_AT,
    exerciseDate: '2026-10-29',
    executiveSummaryMd:
      'The exercise tested the response to manipulated flight information in the AODB. Operations moved the terminal to manual procedures and the PIO held the public line; the hand-off between IT and Operations at the Go Dark decision took longer than TIRP 13.6 allows.',
    sourcesUsed: ['facilitator', 'evaluation'],
    capabilities: [
      {
        capability: 'public_information_and_warning',
        rating: 'S',
        proposedRating: 'S',
        ratingRationale:
          'Passengers were told to check with gate agents within ten minutes, but the first holding statement went out before IT had confirmed the cause.',
        observationCounts: { met: 3, partial: 1, not_met: 0, not_observed: 1 },
        objectiveRefs: ['obj-communication'],
        strengths: [
          {
            id: 'F-01',
            title: 'Plain-language PA and social media messages',
            analysisMd:
              'The PIO used the PA system and the airport account to direct passengers to gate agents, as TIRP 1.4.5 asks.',
            citations: [taskCitation(s, 'T-01')],
            evidence: ['note:I-06', 'obs:O-I-04-T-01', 'hw:hw-1'],
            objectiveRefs: ['obj-communication'],
            recommendation: '',
            correctiveActions: [],
            locked: false,
          },
        ],
        areasForImprovement: [
          {
            id: 'F-02',
            title: 'Holding statement issued before the cause was confirmed',
            analysisMd:
              'The first statement named a "system glitch" while IT was still investigating; the viral rumor at I-06b then had to be answered twice.',
            citations: [taskCitation(s, 'T-04')],
            evidence: ['note:I-06b', 'hw:hw-2'],
            objectiveRefs: ['obj-communication'],
            recommendation:
              'Add a pre-approved holding statement for unverified system failures to the PIO annex.',
            correctiveActions: [
              {
                id: 'CA-01',
                action: 'Write and approve a holding statement for unverified FIDS failures',
                element: 'planning',
                ownerRole: 'pio',
                ownerOrganization: 'NCIA Public Affairs',
                poc: 'Public Affairs Manager',
                startDate: '2026-11-15',
                dueDate: '2027-01-31',
                status: 'open',
                locked: true,
              },
            ],
            locked: false,
          },
        ],
      },
      {
        capability: 'operational_coordination',
        proposedRating: 'M',
        ratingRationale:
          'Incident command was established, but the IT and Operations command posts worked apart for twenty minutes at the Go Dark decision.',
        observationCounts: { met: 1, partial: 2, not_met: 1, not_observed: 0 },
        objectiveRefs: ['obj-decision'],
        strengths: [],
        areasForImprovement: [
          {
            id: 'F-03',
            title: 'IT and Operations decided the Go Dark call apart',
            analysisMd:
              'The decision to silence the PA and take the FIDS dark was made in the IT room and reached Operations by hallway conversation.',
            citations: [taskCitation(s, 'T-07')],
            evidence: ['note:I-09', 'obs:O-I-09-T-07', 'dec:d-1'],
            objectiveRefs: ['obj-decision'],
            recommendation:
              'Make the Go Dark decision a joint Operations and IT call with one announcement channel in TIRP 13.6.',
            correctiveActions: [
              {
                id: 'CA-02',
                action:
                  'Revise TIRP 13.6 so the Go Dark decision is taken jointly and announced once',
                element: 'planning',
                ownerRole: 'ops-director',
                ownerOrganization: '',
                poc: '',
                status: 'open',
                locked: false,
              },
              {
                id: 'CA-03',
                action: 'Run a 30-minute drill of the manual FIDS procedure each quarter',
                element: 'exercises',
                ownerRole: 'ops-director',
                ownerOrganization: '',
                poc: '',
                status: 'open',
                locked: false,
              },
            ],
            locked: false,
          },
        ],
      },
      {
        capability: 'cybersecurity',
        ratingRationale: 'Not enough evidence: no observation or note covers this capability.',
        observationCounts: { met: 0, partial: 0, not_met: 0, not_observed: 0 },
        objectiveRefs: ['obj-technical'],
        strengths: [],
        areasForImprovement: [],
      },
    ],
    participantFeedbackMd: '',
    participatingOrganizations: ['North Coast Regional Airport Authority', 'Skyline Airways'],
    acronyms: [{ term: 'AODB', meaning: 'Airport Operational Database' }],
    provenance: [],
  })
}
