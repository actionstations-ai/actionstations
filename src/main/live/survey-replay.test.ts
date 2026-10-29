// The response file is rebuilt from the session log after a crash (#422).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SessionLogEntry } from '@shared/schemas/live'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false, getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject } = await import('../project/store')
const { createScenario } = await import('../scenario/store')
const { ScenarioBrief, Survey } = await import('@shared/schemas')
const store = await import('../surveys/store')
const { rebuildSurveyResponses } = await import('./survey-replay')

const NOW = '2026-10-28T14:00:00.000Z'
const DELIVERY = 'dlv-0000000000000001'

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-survey-replay-'))
  const { path: root } = await createProject({ parentDir: parent, name: 'NCIA' })
  const s = await createScenario(root, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  await store.writeSurvey(
    root,
    s.id,
    Survey.parse({
      id: 'FEEDBACK',
      title: 'Feedback',
      kind: 'participant_feedback',
      createdAt: NOW,
      updatedAt: NOW,
      sections: [{ id: 's', questions: [{ id: 'q1', type: 'rating', text: 'Organized' }] }],
    }),
  )
  return { root, scenarioId: s.id }
}

let n = 0
const entry = (kind: string, over: Partial<SessionLogEntry>): SessionLogEntry =>
  ({
    i: ++n,
    at: '2026-10-28T14:03:41.000Z',
    kind,
    actor: { kind: 'system' },
    data: {},
    ...over,
  }) as SessionLogEntry

const open = entry('survey.open', {
  ref: { surveyId: DELIVERY },
  data: { survey: 'FEEDBACK', targets: ['all'] },
})
const response = (id: string, rating: number) =>
  entry('survey.response', {
    actor: { kind: 'client' },
    ref: { surveyId: DELIVERY },
    data: { responseId: id, answers: { q1: rating } },
  })

describe('rebuildSurveyResponses', () => {
  it('puts back responses the file lost, once, with the minute and no sender', async () => {
    const { root, scenarioId } = await setup()
    const log = [open, response('lr-aaaaaaaaaaaa', 4), response('lr-bbbbbbbbbbbb', 5)]
    // The first made it into the file before the crash; the second did not.
    await store.appendResponse(root, scenarioId, {
      id: 'lr-aaaaaaaaaaaa',
      surveyId: 'FEEDBACK',
      deliveryId: DELIVERY,
      channel: 'live',
      at: '2026-10-28T14:03:00.000Z',
      answers: { q1: 4 },
      otherText: {},
    })
    expect(await rebuildSurveyResponses(root, scenarioId, log, 'live')).toBe(1)
    const stored = await store.readResponses(root, scenarioId, 'FEEDBACK')
    expect(stored.map((r) => [r.id, r.answers.q1]).sort()).toEqual([
      ['lr-aaaaaaaaaaaa', 4],
      ['lr-bbbbbbbbbbbb', 5],
    ])
    expect(stored.find((r) => r.id === 'lr-bbbbbbbbbbbb')).toMatchObject({
      channel: 'live',
      deliveryId: DELIVERY,
      at: '2026-10-28T14:03:00.000Z',
    })
    expect(await rebuildSurveyResponses(root, scenarioId, log, 'live')).toBe(0)
  })

  it('skips responses for a survey that is gone or an opening the log does not hold', async () => {
    const { root, scenarioId } = await setup()
    await store.deleteSurvey(root, scenarioId, 'FEEDBACK')
    expect(
      await rebuildSurveyResponses(
        root,
        scenarioId,
        [open, response('lr-cccccccccccc', 3)],
        'live',
      ),
    ).toBe(0)
    expect(
      await rebuildSurveyResponses(root, scenarioId, [response('lr-dddddddddddd', 3)], 'qr'),
    ).toBe(0)
  })
})
