// Case study drafts, the schema, the review gate and import (spec 0452 FR-9, NFR-2).
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CaseStudy, CJMM_STEPS } from '@shared/schemas'
import { redact, scanIdentifiers } from '../../shared/clinical/identifiers'
import { TRAJECTORY_KINDS } from '../toolkits/clinical/trajectory'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir(), on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { renderFigure } = await import('../render/figures')
const { draftFromTrajectory } = await import('./from-trajectory')
const store = await import('./store')

const draft = (kind: (typeof TRAJECTORY_KINDS)[number] = 'sepsis', seed = 3) =>
  draftFromTrajectory({ id: `case-${kind}-${seed}`, kind, seed, startLabel: '07:40' })

describe('draftFromTrajectory', () => {
  it.each(TRAJECTORY_KINDS)('%s makes a valid draft with all six steps', (kind) => {
    const c = draft(kind)
    expect(() => CaseStudy.parse(c)).not.toThrow()
    expect(c.origin).toBe('generated')
    expect(c.status).toBe('draft')
    const steps = new Set(c.stages.flatMap((s) => s.prompts.map((p) => p.step)))
    for (const step of CJMM_STEPS) expect(steps.has(step), `${kind} ${step}`).toBe(true)
  })

  it('is the same for a seed and different for another', () => {
    const strip = (c: CaseStudy) => ({ ...c, createdAt: '', updatedAt: '' })
    expect(strip(draft('sepsis', 3))).toEqual(strip(draft('sepsis', 3)))
    expect(draft('sepsis', 3).patient.name).not.toBe(draft('sepsis', 4).patient.name)
  })

  it('follows the dossier arc and branches on the action stage', () => {
    const c = draft()
    expect(c.stages.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5_good', 's5_poor', 's6'])
    const branch = c.stages[3]!.prompts[0]!.branch
    expect(branch).toEqual({ threshold: 0.7, passTo: 's5_good', failTo: 's5_poor' })
  })

  it('shows only data that exists at the stage', () => {
    const c = draft()
    const lastMinute = (stageId: string): number => {
      const fig = c.stages.find((s) => s.id === stageId)!.data.figures.monitor!
      const pts = (fig.data as { parameters: { points: { x: number }[] }[] }).parameters[0]!.points
      return Math.max(...pts.map((p) => p.x))
    }
    expect(lastMinute('s2')).toBeLessThan(lastMinute('s3'))
    expect(c.stages[0]!.data.figures).toEqual({})
  })

  it('draws every figure it carries and labels the patient simulated', () => {
    for (const kind of TRAJECTORY_KINDS) {
      const c = draft(kind)
      expect(c.patient.simulated).toBe(true)
      expect(c.patient.mrn).toMatch(/^SIM-/)
      for (const stage of c.stages)
        for (const fig of Object.values(stage.data.figures))
          expect(() => renderFigure(fig as never), `${kind} ${stage.id}`).not.toThrow()
    }
  })

  it('tells the learner nothing about the answers before they choose', () => {
    const c = draft()
    for (const s of c.stages) expect(s.narrative).not.toMatch(/sepsis|infection spreading/i)
  })

  it('the good and poor stories end differently', () => {
    const c = draft()
    const text = (id: string) => c.stages.find((s) => s.id === id)!.prompts[0]!.rationale
    expect(text('s5_good')).toMatch(/falling score/)
    expect(text('s5_poor')).toMatch(/rising score/)
  })
})

describe('identifiers', () => {
  it('finds numbers, emails, dates of birth, addresses and links', () => {
    const text =
      'MRN 4471823 for Jane. DOB: 04/12/1951. Call 555-201-3344 or jane@example.org. Lives at 410 Maple Street. ' +
      'SSN 123-45-6789. See https://portal.example.org/chart/1'
    expect(scanIdentifiers(text).map((h) => h.kind)).toEqual(
      expect.arrayContaining([
        'record_number',
        'date_of_birth',
        'phone',
        'email',
        'street_address',
        'ssn',
        'url',
      ]),
    )
  })

  it('leaves simulated record numbers and ordinary clinical numbers alone', () => {
    expect(
      scanIdentifiers('MRN SIM-004217. BP 82/50, heart rate 126, lactate 4.8 at 10:40.'),
    ).toEqual([])
  })

  it('redacts what it finds', () => {
    expect(redact('Call 555-201-3344 or jane@example.org')).toBe(
      'Call [removed phone] or [removed email]',
    )
  })
})

describe('store: review gate and import', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'casestudy-'))
  })
  afterEach(() => rm(root, { recursive: true, force: true }))

  it('keeps a generated case a draft until the author reviews it', async () => {
    const saved = await store.saveCaseStudy(root, draft())
    expect(saved.status).toBe('draft')
    const reviewed = await store.reviewCaseStudy(root, saved.id, {
      by: 'Prof. Lindqvist',
      note: 'Checked cues and keys',
    })
    expect(reviewed.status).toBe('reviewed')
    expect(reviewed.review?.by).toBe('Prof. Lindqvist')
    await expect(store.reviewCaseStudy(root, saved.id, { by: ' ', note: '' })).rejects.toThrow(
      /name/,
    )
  })

  it('sends a reviewed case back to draft when its content is edited', async () => {
    const saved = await store.saveCaseStudy(root, draft())
    const reviewed = await store.reviewCaseStudy(root, saved.id, { by: 'A. Brooks', note: '' })
    const unchanged = await store.saveCaseStudy(root, reviewed)
    expect(unchanged.status).toBe('reviewed')
    const edited = await store.saveCaseStudy(root, { ...reviewed, title: 'A new title' })
    expect(edited.status).toBe('draft')
    expect(edited.review).toBeUndefined()
  })

  it('lists cases with their counts', async () => {
    await store.saveCaseStudy(root, draft())
    const [item] = (await store.listCaseStudies(root)).map(store.listItem)
    expect(item).toMatchObject({ origin: 'generated', status: 'draft', stages: 7 })
    expect(item!.prompts).toBeGreaterThan(7)
  })

  it('stops an import with identifiers until the author redacts or acknowledges', async () => {
    const base = draft()
    const withId = JSON.stringify({
      ...base,
      patient: { ...base.patient, summary: 'Call the family at 555-201-3344. MRN 4471823.' },
    })
    const stopped = await store.importCaseStudy(root, withId, {})
    expect(stopped.saved).toBe(false)
    expect(stopped.hits.map((h) => h.kind)).toEqual(
      expect.arrayContaining(['phone', 'record_number']),
    )
    expect(await store.listCaseStudies(root)).toHaveLength(0)

    const redacted = await store.importCaseStudy(root, withId, { redact: true })
    expect(redacted.saved).toBe(true)
    expect(redacted.case!.patient.summary).toContain('[removed phone]')
    expect(redacted.case!.origin).toBe('imported')
    expect(redacted.case!.status).toBe('draft')
    expect(redacted.case!.id).not.toBe(base.id)
  })

  it('imports a clean case as a draft with a new id and refuses invalid JSON or schema', async () => {
    const ok = await store.importCaseStudy(root, JSON.stringify(draft()), {})
    expect(ok.saved).toBe(true)
    await expect(store.importCaseStudy(root, '{nope', {})).rejects.toThrow(/JSON/)
    await expect(store.importCaseStudy(root, JSON.stringify({ title: 'x' }), {})).rejects.toThrow(
      /not valid/,
    )
  })

  it('a reviewed import still arrives as a draft', async () => {
    const reviewed = {
      ...draft(),
      status: 'reviewed',
      review: { by: 'Someone', at: '2026-11-04T10:00:00.000Z', note: '' },
    }
    const r = await store.importCaseStudy(root, JSON.stringify(reviewed), {})
    expect(r.case!.status).toBe('draft')
    expect(r.case!.review).toBeUndefined()
  })
})

describe('CaseStudy schema checks', () => {
  it('refuses a key that names an unknown option, a branch to nowhere and a reviewed case without a record', () => {
    const c = JSON.parse(JSON.stringify(draft())) as CaseStudy
    const p = c.stages[0]!.prompts[0]!
    if (p.type !== 'select_cues') throw new Error('expected select_cues')
    p.key.relevant.push('nope')
    expect(CaseStudy.safeParse(c).success).toBe(false)
    p.key.relevant.pop()
    c.stages[3]!.prompts[0]!.branch = { threshold: 0.5, passTo: 'missing' }
    expect(CaseStudy.safeParse(c).success).toBe(false)
    c.stages[3]!.prompts[0]!.branch = { threshold: 0.7, passTo: 's5_good', failTo: 's5_poor' }
    expect(CaseStudy.safeParse({ ...c, status: 'reviewed' }).success).toBe(false)
  })
})
