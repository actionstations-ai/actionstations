// The education documents (spec 0452 FR-13, FR-16): each is written from a case, runs or records,
// validates against its template schema, composes into a page and says what it must (the scale
// note, the hours note, the content notice).
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EducationRecord, type CaseStudy, type CaseStudyRun } from '@shared/schemas'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => resolve('.'),
    getPath: () => tmpdir(),
    on: () => undefined,
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const { validateFields } = await import('../render/templates')
const { composeDocument } = await import('../render/compose')
const { draftFromTrajectory } = await import('./from-trajectory')
const docs = await import('./documents')
const store = await import('./store')
const run = await import('./run')
const edu = await import('./education')
const { buildDocument } = await import('./export')

const study: CaseStudy = {
  ...draftFromTrajectory({
    id: 'sep',
    kind: 'sepsis',
    seed: 3,
    contentNotice: 'This case includes the death of a patient.',
  }),
}

const record = (over: Partial<EducationRecord> = {}): EducationRecord =>
  EducationRecord.parse({
    id: 'r1',
    title: 'Sepsis after surgery',
    caseId: 'sep',
    date: '2026-11-04',
    hours: 3,
    facilitator: 'A. Brooks',
    participants: 12,
    objectives: ['Recognize cues'],
    cornerstones: {
      prebrief: { done: true, by: 'A. Brooks', at: '2026-11-04T09:00:00.000Z' },
      facilitation: { done: true, by: 'A. Brooks', at: '2026-11-04T10:00:00.000Z' },
      professional_integrity: {},
      debrief: { done: true, by: 'A. Brooks', at: '2026-11-04T11:00:00.000Z' },
    },
    debriefCheckIn: true,
    createdAt: '2026-11-04T08:00:00.000Z',
    updatedAt: '2026-11-04T08:00:00.000Z',
    ...over,
  })

const compose = (type: string, fields: Record<string, unknown>) => {
  expect(validateFields(type, fields), `${type} fields`).toEqual([])
  return composeDocument({ type, fields }).html
}

describe('documents written from a case', () => {
  it('prebrief has objectives, ground rules, the content notice and the notes', () => {
    const f = docs.prebriefFields(study)
    const html = compose('simulation_prebrief', f)
    expect(html).toContain('safe place to be wrong')
    expect(html).toContain('stays in the simulation')
    expect(html).toContain('death of a patient')
    expect(html).toContain('not NCLEX')
    expect(html).toContain('Your instructor can see your answers')
  })

  it('facilitation guide has one cue card per stage', () => {
    const f = docs.facilitationFields(study)
    expect((f.cueCards as unknown[]).length).toBe(study.stages.length)
    const html = compose('facilitation_guide', f)
    expect(html).toContain('First assessment')
    expect(html).toContain('If stuck')
  })

  it('debrief guide has the phases and the check-in, and the feedback form is a form', () => {
    const f = docs.debriefFields(study)
    expect((f.phases as unknown[]).length).toBe(5)
    const html = compose('debrief_guide', f)
    expect(html).toContain('how is everyone doing')
    expect(html).toContain('Content notice')
    expect(compose('learner_feedback_form', docs.feedbackFields(study))).toContain(
      'Your instructor can see your answers',
    )
  })
})

describe('documents written from runs and records', () => {
  let root: string
  let finished: CaseStudyRun
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'edu-'))
    await store.saveCaseStudy(root, study)
    await store.reviewCaseStudy(root, 'sep', { by: 'R', note: '' })
    const { id } = await run.startRun(root, {
      caseId: 'sep',
      mode: 'individual',
      learner: 'Student A',
      acknowledged: true,
    })
    let view = await run.playView(root, id)
    while (!view.finished) {
      const stage = study.stages.find((s) => s.id === view.stage.id)!
      for (const p of stage.prompts) {
        const response =
          p.type === 'rationale'
            ? 'the trend points to infection'
            : p.type === 'rank_hypotheses'
              ? p.key.order
              : p.type === 'select_cues'
                ? p.key.relevant
                : p.type === 'evaluate_outcome'
                  ? [p.options[0]!.id]
                  : Object.entries(p.key.credit)
                      .filter(([, c]) => c > 0)
                      .map(([i]) => i)
        await run.submitAnswer(root, { runId: id, promptId: p.id, response })
      }
      await run.advance(root, id)
      view = await run.playView(root, id)
    }
    finished = view.run
  })
  afterEach(() => rm(root, { recursive: true, force: true }))

  it('learner report shows the six steps, the decisions and the scale note', () => {
    const f = docs.learnerReportFields(study, finished)
    expect((f.steps as unknown[]).length).toBe(6)
    expect((f.decisions as { rationale: string }[]).every((d) => d.rationale.length > 0)).toBe(true)
    expect(f.learner).toBe('Student A')
    const html = compose('learner_report', f)
    expect(html).toContain('Profile across the six steps')
    expect(html).toContain('not NCLEX')
  })

  it('learner report prints 0 percent as 0 and not as n/a', () => {
    const zero = { ...finished, answers: finished.answers.map((a) => ({ ...a, score: 0 })) }
    const html = compose('learner_report', docs.learnerReportFields(study, zero))
    expect(html).toMatch(/<strong\s*>0%<\/strong\s*>/)
  })

  it('facilitator summary counts finished runs, never preview runs, and lists the hardest questions', async () => {
    const f1 = docs.facilitatorSummaryFields(study, [finished])
    expect(f1.runs).toBe(1)
    expect((f1.hardest as unknown[]).length).toBeGreaterThan(0)
    const f2 = docs.facilitatorSummaryFields(study, [
      { ...finished, preview: true },
      { ...finished, finishedAt: undefined },
    ])
    expect(f2.runs).toBe(0)
    expect(compose('facilitator_summary', f1)).toContain('visible to the instructor')
    expect(compose('facilitator_summary', f2)).toContain('0 finished runs')
  })

  it('exports a document through the same builders and refuses a missing id', async () => {
    const built = await buildDocument(root, { kind: 'learner', runId: finished.id })
    expect(built.type).toBe('learner_report')
    await expect(buildDocument(root, { kind: 'learner' })).rejects.toThrow(/run is needed/i)
    await expect(buildDocument(root, { kind: 'prebrief' })).rejects.toThrow(/case study is needed/i)
  })

  it('program record totals the hours, names who did each cornerstone and flags what is missing', async () => {
    await edu.saveEducationRecord(root, record())
    await edu.saveEducationRecord(
      root,
      record({ id: 'r2', date: '2026-10-28', hours: 2.5, title: 'Hypoglycemia on insulin' }),
    )
    const f = docs.programRecordFields(
      await edu.listEducationRecords(root),
      'Cedar Hollow School of Nursing (fictional)',
    )
    expect(f.totalHours).toBe(5.5)
    const sessions = f.sessions as {
      date: string
      prebrief: string
      integrity: string
      checkIn: string
    }[]
    expect(sessions.map((s) => s.date)).toEqual(['2026-10-28', '2026-11-04'])
    expect(sessions[1]!.prebrief).toBe('Done, A. Brooks 2026-11-04')
    expect(sessions[1]!.integrity).toBe('Not recorded')
    const html = compose('program_record', f)
    expect(html).toContain('state board of nursing')
    expect(html).toContain('5.5')
    expect(docs.missingCornerstones(record())).toEqual(['Professional integrity'])
  })
})

describe('education records', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'edu2-'))
  })
  afterEach(() => rm(root, { recursive: true, force: true }))

  it('marks a cornerstone done only with a name, and takes the mark back', async () => {
    await edu.saveEducationRecord(root, record({ cornerstones: record().cornerstones }))
    await expect(
      edu.markCornerstone(root, 'r1', 'professional_integrity', { done: true }),
    ).rejects.toThrow(/who did it/)
    const done = await edu.markCornerstone(root, 'r1', 'professional_integrity', {
      done: true,
      by: ' A. Brooks ',
      note: 'Confidentiality reviewed',
    })
    expect(done.cornerstones.professional_integrity).toMatchObject({
      done: true,
      by: 'A. Brooks',
      note: 'Confidentiality reviewed',
    })
    expect(done.cornerstones.professional_integrity.at).toBeTruthy()
    const undone = await edu.markCornerstone(root, 'r1', 'professional_integrity', { done: false })
    expect(undone.cornerstones.professional_integrity).toEqual({ done: false })
  })

  it('rejects an impossible record', () => {
    expect(EducationRecord.safeParse({ ...record(), hours: 30 }).success).toBe(false)
    expect(EducationRecord.safeParse({ ...record(), date: 'yesterday' }).success).toBe(false)
  })
})
