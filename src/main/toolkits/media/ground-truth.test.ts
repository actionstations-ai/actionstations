// The simulated media ground truth (spec 0458 FR-9): the generator writes a `media-ground-truth`
// events dataset labeled simulated, and each of the four ground-truth metrics computes from it.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { MetricDecision } from '@shared/schemas/metrics'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const media = await import('./index')
const { runGenerator } = await import('../../case-data/generators')
const { caseDir, readManifest } = await import('../../case-data/store')
const { readGroundTruth } = await import('../../evaluation/metrics/inputs')
const { runMetric } = await import('../../evaluation/metrics/registry')
const { createProject } = await import('../../project/store')
const { createScenario } = await import('../../scenario/store')
const { ScenarioBrief } = await import('@shared/schemas')

const START = '2026-11-04T14:00:00.000Z'
const PARAMS = {
  startAt: START,
  news: { seed: 11, triggerAtMin: 30, severity: 4, visibility: 'regional' },
}

async function generated() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-gt-'))
  const { path: root } = await createProject({ parentDir: parent, name: 'Org', orgType: 'generic' })
  const scenario = await createScenario(root, { title: 'Breach', brief: ScenarioBrief.parse({}) })
  media.registerMediaToolkit()
  const manifest = await runGenerator(root, scenario.id, 'media-ground-truth', PARAMS, {
    maxMbPerScenario: 10,
  })
  const events = await readGroundTruth(caseDir(root, scenario.id), 'media-ground-truth.json')
  return { root, scenarioId: scenario.id, manifest, events }
}

const at = (min: number) => new Date(Date.parse(START) + min * 60_000).toISOString()
const dec = (
  id: string,
  kind: string,
  min: number,
  fields: Record<string, unknown>,
): MetricDecision => ({
  id,
  kind,
  time: at(min),
  fields,
})
const summary = (r: ReturnType<typeof runMetric>, label: string) =>
  r.summary.find((s) => s.label === label)?.value

describe('media-ground-truth generator', () => {
  it('writes an events dataset the metrics can read, labeled simulated with its generator', async () => {
    const { manifest, events } = await generated()
    const ds = manifest.datasets.find((d) => d.id === 'media-ground-truth')!
    expect(ds.kind).toBe('reports')
    expect(ds.provenance).toMatchObject({ origin: 'simulated', generator: 'media-ground-truth' })
    const kinds = new Set(events.map((e) => e.kind))
    expect(kinds).toEqual(
      new Set(['first_public_signal', 'reporter_query', 'error_found', 'verification_item']),
    )
    expect(events.find((e) => e.kind === 'first_public_signal')!.time).toBe(at(30))
    for (const q of events.filter((e) => e.kind === 'reporter_query'))
      expect(typeof q.attrs.deadline).toBe('string')
  })

  it('gives the same events for the same parameters', async () => {
    const a = (await generated()).events
    const b = (await generated()).events
    expect(a).toEqual(b)
  })

  it('is listed in the case data of a scenario as a dataset a toolkit metric can name', async () => {
    const { root, scenarioId } = await generated()
    const manifest = await readManifest(root, scenarioId)
    expect(manifest?.datasets.map((d) => d.id)).toContain('media-ground-truth')
  })

  it('computes all four ground-truth metrics from the generated dataset', async () => {
    const { events } = await generated()
    const queries = events.filter((e) => e.kind === 'reporter_query')
    const first = queries[0]!
    const decisions = [
      dec('d1', 'issue_holding_statement', 70, { channel: 'website', approver: 'CEO' }),
      dec('d2', 'issue_correction', 150, { error: 'error-1', channel: 'website' }),
      dec('d3', 'respond_to_reporter', 45, { inquiry: first.id, response_mode: 'on_the_record' }),
      dec('d4', 'request_clue', 60, { item: 'item-1', clue_kind: 'reverse_image_result' }),
      dec('d5', 'hold_or_publish', 70, {
        item: 'item-1',
        verdict: 'false',
        confidence: 'medium',
        action: 'hold',
      }),
      dec('d6', 'hold_or_publish', 80, {
        item: 'item-2',
        verdict: 'verified',
        confidence: 'high',
        action: 'publish',
      }),
    ]
    const bag = { events, decisions }

    const holding = runMetric({ id: 'holding_statement_time', config: { windowMin: 60 } }, bag)
    expect(summary(holding, 'Time from first signal to first holding statement')).toBe('40 min')
    expect(summary(holding, 'Within the window')).toBe('Yes')

    const corrections = runMetric({ id: 'corrections', config: {} }, bag)
    expect(summary(corrections, 'Errors corrected')).toBe('1 of 1')
    expect(summary(corrections, 'Corrections on the channel the error spread on')).toBe('1 of 1')

    const reporters = runMetric({ id: 'reporter_handling', config: {} }, bag)
    expect(summary(reporters, 'Queries answered')).toBe(`1 of ${queries.length}`)
    expect(summary(reporters, 'On the record')).toBe('1')

    const verification = runMetric({ id: 'verification', config: {} }, bag)
    expect(summary(verification, 'False items correctly held')).toBe('1 of 1')
    expect(summary(verification, 'Verdicts that matched the ground truth')).toBe('2 of 2')
    expect(summary(verification, 'Items published')).toBe('1')
  })

  it('takes errors and items from the parameters when given', async () => {
    const [ds] = media.generateMediaGroundTruth({
      ...PARAMS,
      news: { ...PARAMS.news, responses: [] } as never,
      errors: [{ id: 'e9', atMin: 200, channel: 'Social media', label: 'A wrong figure' }],
      items: [{ id: 'v9', atMin: 100, truth: 'synthetic', label: 'A clip' }],
    } as never)
    const events = ds!.data as { id: string; kind: string; attrs: Record<string, unknown> }[]
    expect(events.find((e) => e.id === 'e9')?.attrs.channel).toBe('Social media')
    expect(events.find((e) => e.id === 'v9')?.attrs.truth).toBe('synthetic')
    expect(events.some((e) => e.id === 'error-1')).toBe(false)
  })
})
