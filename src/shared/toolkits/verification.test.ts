// Verification tasks (spec 0458 FR-7): clue costs, the credential wording, verdict scoring, and
// that the toolkit's decision forms fit the live-play form schema.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DecisionForm as LiveForm } from '../schemas/decisions'
import { ToolkitSchema } from './schema'
import {
  CREDENTIAL_RESULT,
  CREDENTIAL_RULE,
  DEFAULT_CLUE_COST_MIN,
  requestClue,
  verdictIsCorrect,
  VerificationTask,
} from './verification'

const task = VerificationTask.parse({
  id: 'plant-fire-video',
  title: 'Viewer video of a plant fire',
  subject: 'video',
  description: 'A 20 second clip said to show a fire at the Halyard plant.',
  groundTruth: 'misattributed',
  credentialStatus: 'absent',
  clues: [
    { kind: 'reverse_image', costMin: 6, text: 'An earlier copy appears in a 2022 post.' },
    { kind: 'metadata', text: 'Creation date stripped by the platform.' },
  ],
})

describe('requestClue', () => {
  it('returns the authored text and its cost, or the default cost of the kind', () => {
    expect(requestClue(task, 'reverse_image')).toMatchObject({ costMin: 6, text: /2022/ })
    expect(requestClue(task, 'metadata').costMin).toBe(DEFAULT_CLUE_COST_MIN.metadata)
  })

  it('treats a check with no authored clue as a result that still costs time', () => {
    const r = requestClue(task, 'geolocation')
    expect(r.costMin).toBe(DEFAULT_CLUE_COST_MIN.geolocation)
    expect(r.text).toMatch(/still a result/)
  })

  it('words the credential check from the status and shows the rule', () => {
    for (const status of ['present_valid', 'present_invalid', 'absent'] as const) {
      const r = requestClue({ ...task, credentialStatus: status }, 'credential_check')
      expect(r.text).toBe(CREDENTIAL_RESULT[status])
      expect(r.rule).toBe(CREDENTIAL_RULE)
    }
    expect(CREDENTIAL_RESULT.absent).toMatch(/proves nothing/)
    expect(CREDENTIAL_RESULT.present_valid).toMatch(/not that the content is true/)
  })
})

describe('task schema and verdicts', () => {
  it('refuses two clues of one kind', () => {
    const dup = { ...task, clues: [task.clues[0], task.clues[0]] }
    expect(VerificationTask.safeParse(dup).success).toBe(false)
  })

  it('scores verdicts against the hidden ground truth', () => {
    expect(verdictIsCorrect('authentic', 'Verified')).toBe(true)
    expect(verdictIsCorrect('authentic', 'False')).toBe(false)
    expect(verdictIsCorrect('manipulated', 'False')).toBe(true)
    expect(verdictIsCorrect('manipulated', 'Hold')).toBe(true)
    expect(verdictIsCorrect('manipulated', 'Verified')).toBe(false)
    expect(verdictIsCorrect('unverifiable', 'Unverified')).toBe(true)
    expect(verdictIsCorrect('satire', 'Verified')).toBe(false)
  })
})

describe('media_environment decision forms in live play', () => {
  const toolkit = ToolkitSchema.parse(
    JSON.parse(readFileSync(resolve('packs/toolkits/media_environment.json'), 'utf8')),
  )
  const option = (c: string) => ({
    id: c
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, ''),
    label: c,
  })
  const live = (f: (typeof toolkit.decisionForms)[number]) => ({
    id: f.id,
    title: f.label,
    description: f.description.slice(0, 300),
    fields: f.fields.map((x) =>
      x.kind === 'choice'
        ? {
            id: x.id,
            label: x.label,
            type: 'choice',
            required: x.required,
            options: x.choices.map(option),
          }
        : {
            id: x.id,
            label: x.label,
            type: x.kind === 'area' ? 'text' : x.kind,
            required: x.required,
          },
    ),
  })

  it('every form fits the live-play form schema once converted', () => {
    for (const f of toolkit.decisionForms) {
      const parsed = LiveForm.safeParse(live(f))
      expect(
        parsed.success,
        `${f.id}: ${parsed.success ? '' : parsed.error.issues[0]?.message}`,
      ).toBe(true)
    }
  })

  it('has a form to request each check and the forms the metrics read', () => {
    const ids = toolkit.decisionForms.map((f) => f.id)
    for (const id of [
      'request_clue',
      'hold_or_publish',
      'respond_to_reporter',
      'issue_correction',
      'issue_holding_statement',
    ])
      expect(ids).toContain(id)
    const clue = toolkit.decisionForms.find((f) => f.id === 'request_clue')!
    const kinds = clue.fields.find((f) => f.id === 'clue_kind')!.choices
    expect(kinds).toHaveLength(7)
  })

  it('names every metric it configures', () => {
    expect(toolkit.metrics.map((m) => m.id)).toEqual([
      'holding_statement_time',
      'message_consistency',
      'statement_accuracy',
      'corrections',
      'reporter_handling',
      'verification',
    ])
  })
})
