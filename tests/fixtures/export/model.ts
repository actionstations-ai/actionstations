// An ExportModel for unit tests: the Scenario 3 fixture plus a handful of injects whose assets
// live in a temporary project folder (PNG, paper PDF, generated slot image, WAV, MP4 + poster).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { WaveFile } from 'wavefile'
import { conductOf, Inject, Scenario, type MediaAsset } from '../../../src/shared/schemas'
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
    },
    scenarioNo: '3',
    media: planMediaFiles('3', injects),
    available,
    generatedAt: '2026-10-21T12:00:00.000Z',
    surveys: [],
    conduct: conductOf(scenario),
    ...(evaluationOf(scenario) ? { evaluation: evaluationOf(scenario)! } : {}),
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
