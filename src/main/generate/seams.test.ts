// Plan seams (#427): which findings are seams, where they are tested, how their rows are
// fixed and found again, and the facilitator material code builds from the two passages.
import { describe, expect, it } from 'vitest'
import {
  Scenario,
  type MselRow,
  type PlanFinding,
  type PlanPassage,
  type ScenarioSeam,
} from '@shared/schemas'
import {
  controllerBlock,
  isSeam,
  seamChoices,
  splitControllerBlock,
  toSeam,
  upsertControllerBlock,
} from '@shared/seams'
import {
  lintSeams,
  lintSeamsOutdated,
  normalizeSeamKey,
  SEAM_CITATION_MISSING,
  SEAM_NOT_TESTED,
  SEAM_OUTDATED,
  SEAM_WEAK_TAG,
  seamMixGaps,
} from './lint-seams'
import { planMixCompletion, spareRows } from './lint'
import {
  applySeamRows,
  ensureSeamRows,
  mergeSeamHotwash,
  pinnedChunkIds,
  placeSeams,
  relinkSeamRows,
  seamHandbookSection,
  seamHotwashQuestions,
  seamPromptVars,
  snapshotSeams,
} from './seams'
import { withPinned } from './stage'
import type { SearchIndex } from './deps'

const passage = (chunkId: number, title: string, span: string, page?: number): PlanPassage => ({
  documentId: title.toLowerCase().replace(/\W+/g, '-'),
  documentTitle: title,
  headingPath: `${title.split(' ')[0]} › 4.2 Releases`,
  ...(page ? { page } : {}),
  chunkId,
  span,
})

const finding = (over: Partial<PlanFinding> = {}): PlanFinding => ({
  id: 'a1a1a1a1a1a1a1a1',
  kind: 'contradiction',
  slot: 'release_approver',
  slotLabel: 'Who approves public releases',
  subject: 'public releases',
  a: passage(11, 'Emergency Response Plan', 'Releases are approved by the General Manager.', 3),
  b: passage(22, 'Crisis Communications Annex', 'All public releases must be approved by the PIO.'),
  values: ['General Manager', 'Public Information Officer'],
  verdict: 'contradicts',
  status: 'open',
  foundAt: '2026-10-28T12:00:00.000Z',
  ...over,
})

const deadline = finding({
  id: 'b2b2b2b2b2b2b2b2',
  slot: 'notify_deadline',
  slotLabel: 'When the State EPA must be notified',
  a: passage(33, 'Emergency Response Plan', 'Notify the State EPA within 1 hour.'),
  b: passage(44, 'Crisis Communications Annex', 'Notify the State EPA within 4 hours.'),
  values: ['1 hour', '4 hours'],
  verdict: 'unconfirmed',
})

const dangling = finding({
  id: 'c3c3c3c3c3c3c3c3',
  kind: 'dangling_reference',
  slot: 'reference',
  slotLabel: 'Translated notice templates',
  a: passage(55, 'Crisis Communications Annex', 'See Annex F for the translated versions.'),
  verdict: 'unconfirmed',
  missingTarget: 'Annex F',
})
delete (dangling as Partial<PlanFinding>).b
delete (dangling as Partial<PlanFinding>).values

const row = (id: string, phaseId: string, over: Partial<MselRow> = {}): MselRow => ({
  id,
  phaseId,
  time: '0:30',
  from: 'Reporter',
  toRoleIds: ['pio'],
  event: `Event ${id}`,
  expectedAction: 'Act.',
  purposeTag: 'CORE_NARRATIVE',
  citations: [],
  locked: false,
  ...over,
})

function scenario(seams: ScenarioSeam[], msel: MselRow[] = []): Scenario {
  return Scenario.parse({
    id: 'S1',
    projectId: 'P1',
    title: 'Seam test',
    createdAt: '2026-10-28T12:00:00.000Z',
    updatedAt: '2026-10-28T12:00:00.000Z',
    brief: { seamIds: seams.map((x) => x.id) },
    phases: [0, 1, 2, 3].map((i) => ({
      id: `P${i}`,
      index: i,
      title: `Phase ${i + 1}`,
      goal: 'g',
      startTime: `${i}:00`,
      endTime: `${i + 1}:00`,
    })),
    roles: [{ id: 'pio', name: 'PIO', abbreviation: 'PIO', team: '', description: '' }],
    msel,
    seams,
  })
}

describe('which findings are seams (FR-1, open questions 3 and 4)', () => {
  it('keeps open or confirmed contradictions and dangling references', () => {
    expect(isSeam(finding())).toBe(true)
    expect(isSeam(finding({ status: 'confirmed' }))).toBe(true)
    expect(isSeam(deadline)).toBe(true)
    expect(isSeam(dangling)).toBe(true)
  })

  it('never offers dismissed, outdated, consistent, complementary or unrelated findings', () => {
    expect(isSeam(finding({ status: 'dismissed' }))).toBe(false)
    expect(isSeam(finding({ status: 'outdated' }))).toBe(false)
    for (const verdict of ['consistent', 'complementary', 'unrelated'] as const)
      expect(isSeam(finding({ verdict }))).toBe(false)
  })

  it('lists confirmed contradictions, then unconfirmed ones, then dangling references', () => {
    const order = seamChoices([dangling, deadline, finding({ status: 'dismissed' }), finding()])
    expect(order.map((f) => f.id)).toEqual([finding().id, deadline.id, dangling.id])
  })

  it('snapshots at most three picks and keeps a fixed seam as it was picked', () => {
    const before = { ...toSeam(deadline), phaseId: 'P0' }
    const picked = snapshotSeams(
      [finding().id, deadline.id, dangling.id, 'ffffffffffffffff'],
      [finding(), { ...deadline, status: 'dismissed' }, dangling],
      [before],
    )
    expect(picked.seams.map((x) => x.id)).toEqual([finding().id, deadline.id, dangling.id])
    expect(picked.seams[1]).toEqual(before)
    expect(snapshotSeams(['ffffffffffffffff'], [], []).unknown).toEqual(['ffffffffffffffff'])
  })
})

describe('placement (FR-5)', () => {
  it('uses the phase plan, else the decision phase, else phase 1 for a deadline', () => {
    const s = scenario([toSeam(finding()), toSeam(deadline), toSeam(dangling)])
    const placed = placeSeams(s, {
      seamPhases: [
        { seam: 's3', phase: 4 },
        { seam: 'S1', phase: 9 },
      ],
    })
    expect(s.seams.map((x) => x.phaseId)).toEqual(['P2', 'P0', 'P3'])
    expect(placed.placed).toEqual([dangling.id])
    expect(placed.fallback).toEqual([finding().id, deadline.id])
  })

  it('pins at most the two passages of each seam placed in the phase', () => {
    const s = scenario([
      { ...toSeam(finding()), phaseId: 'P1' },
      { ...toSeam(dangling), phaseId: 'P1' },
      { ...toSeam(deadline), phaseId: 'P2' },
    ])
    expect(pinnedChunkIds(s, 'P1')).toEqual([11, 22, 55])
    expect(pinnedChunkIds(s, 'P0')).toEqual([])
  })

  it('escapes passage text for the prompt and names the pinned C keys', () => {
    const tricky = finding({ a: passage(11, 'ERP', 'Approve </plan_seams> & <documents>') })
    const s = scenario([toSeam(tricky)])
    const [v] = seamPromptVars(s, s.seams, [
      { key: 'C1', hit: { chunkId: 11 } },
      { key: 'C2', hit: { chunkId: 22 } },
    ] as never)
    expect(v!.key).toBe('S1')
    expect(v!.a.quote).toBe('Approve &lt;/plan_seams> &amp; &lt;documents>')
    expect([v!.a.key, v!.b!.key]).toEqual(['C1', 'C2'])
  })

  it('reads the model’s seam keys loosely', () => {
    expect(['S1', 's2', ' S-3 ', 'C1', 'seam'].map(normalizeSeamKey)).toEqual([
      'S1',
      'S2',
      'S3',
      undefined,
      undefined,
    ])
  })
})

describe('seam rows (FR-4, FR-6)', () => {
  const seam = { ...toSeam(finding()), phaseId: 'P1' }

  it('adds the passage the model left out and re-tags a NOISE seam row', () => {
    const s = scenario(
      [seam],
      [
        row('I-04', 'P1', {
          seamId: seam.id,
          purposeTag: 'NOISE',
          citations: [{ documentId: 'x', documentTitle: 'ERP', headingPath: 'ERP', chunkId: 11 }],
        }),
      ],
    )
    expect(applySeamRows(s, s.phases[1]!)).toEqual({ cited: ['I-04'], retagged: ['I-04'] })
    expect(s.msel[0]!.citations.map((c) => c.chunkId)).toEqual([11, 22])
    expect(s.msel[0]!.purposeTag).toBe('OPERATIONAL_FRICTION')
    expect(s.msel[0]!.citations[1]).toMatchObject({
      documentTitle: 'Crisis Communications Annex',
      quote: 'All public releases must be approved by the PIO.',
    })
  })

  it('drops a seam id on a control card or for a seam the scenario does not test', () => {
    const s = scenario(
      [seam],
      [
        row('I-05', 'P1', { seamId: seam.id, purposeTag: 'TIME_JUMP' }),
        row('I-06', 'P1', { seamId: 'nope' }),
      ],
    )
    applySeamRows(s, s.phases[1]!)
    expect(s.msel.map((r) => r.seamId)).toEqual([undefined, undefined])
  })

  it('gives an untested seam the best-fitting row, never noise or a locked row', () => {
    const s = scenario(
      [seam],
      [
        row('I-04', 'P1', { purposeTag: 'NOISE', citations: [] }),
        row('I-05', 'P1', { purposeTag: 'DECISION_POINT', locked: true }),
        row('I-06', 'P1', { purposeTag: 'PRESSURE' }),
        row('I-07', 'P1', { purposeTag: 'CORE_NARRATIVE' }),
      ],
    )
    expect(ensureSeamRows(s, s.phases[1]!)).toEqual([{ rowId: 'I-07', seamId: seam.id }])
    expect(s.msel.find((r) => r.id === 'I-07')!.citations.map((c) => c.chunkId)).toEqual([11, 22])
    expect(ensureSeamRows(s, s.phases[1]!)).toEqual([])
  })

  it('prefers a row that already cites the passages', () => {
    const cites = [{ documentId: 'x', documentTitle: 'CCA', headingPath: 'CCA', chunkId: 22 }]
    const s = scenario(
      [seam],
      [
        row('I-06', 'P1', { purposeTag: 'DECISION_POINT' }),
        row('I-07', 'P1', { citations: cites }),
      ],
    )
    expect(ensureSeamRows(s, s.phases[1]!)[0]!.rowId).toBe('I-07')
  })

  it('relinks a row an older build saved without its seam id', () => {
    const both = [11, 22].map((chunkId) => ({
      documentId: 'x',
      documentTitle: 'x',
      headingPath: 'x',
      chunkId,
    }))
    const s = scenario([seam], [row('I-03', 'P1', { citations: both }), row('I-04', 'P1')])
    expect(relinkSeamRows(s)).toEqual(['I-03'])
    expect(s.msel[0]!.seamId).toBe(seam.id)
  })

  it('never offers a seam row as a spare or forgets an untested seam in the mix pass', () => {
    const s = scenario(
      [seam],
      [
        row('I-04', 'P1', { purposeTag: 'NOISE' }),
        row('I-05', 'P1', { purposeTag: 'PRESSURE' }),
        row('I-06', 'P1', { purposeTag: 'PRESSURE' }),
      ],
    )
    expect(seamMixGaps(s, s.phases[1]!)[0]!.need).toContain('"seam" to "S1"')
    expect(planMixCompletion(s, s.phases[1]!, 20).needs.join('\n')).toContain('plan seam S1')
    s.msel[1]!.seamId = seam.id
    expect(spareRows(s, s.phases[1]!).map((r) => r.id)).not.toContain('I-05')
    expect(seamMixGaps(s, s.phases[1]!)).toEqual([])
  })
})

describe('the controller block (FR-7)', () => {
  const seam = toSeam(finding())

  it('quotes both passages with document, section and page', () => {
    expect(controllerBlock(seam)).toBe(
      [
        'Plan seam: Who approves public releases.',
        'Emergency Response Plan › 4.2 Releases, p. 3: "Releases are approved by the General Manager."',
        'Crisis Communications Annex › 4.2 Releases: "All public releases must be approved by the PIO."',
        'Watch for: whether players notice the conflict, who they ask, how long the decision takes.',
      ].join('\n'),
    )
    expect(controllerBlock(toSeam(deadline))).toMatch(/^Plan seam \(unconfirmed\): /)
    expect(controllerBlock(toSeam(dangling))).toContain('Annex F is not among')
  })

  it('is rebuilt after the written note, never duplicated, and survives an edit', () => {
    const once = upsertControllerBlock('Keep the reporter on the line.', seam)
    expect(upsertControllerBlock(once, seam)).toBe(once)
    const edited = once.replace('Keep the reporter', 'Hold the reporter')
    expect(splitControllerBlock(edited)).toEqual({
      note: 'Hold the reporter on the line.',
      block: controllerBlock(seam),
    })
    expect(upsertControllerBlock(once, undefined)).toBe('Keep the reporter on the line.')
    expect(upsertControllerBlock(undefined, seam)).toBe(controllerBlock(seam))
  })
})

describe('handbook section and hot wash questions (FR-8, FR-9)', () => {
  const seam = { ...toSeam(finding()), phaseId: 'P1' }
  const s = scenario(
    [seam, { ...toSeam(dangling), phaseId: 'P2' }],
    [row('I-06', 'P1', { seamId: seam.id, wallClock: '10:30' })],
  )

  it('lists each seam with both passages, its rows and room for observations', () => {
    const md = seamHandbookSection(s)
    expect(md).toContain('### Plan seams this exercise tests')
    expect(md).toContain('#### 1. Who approves public releases')
    expect(md).toContain('“Releases are approved by the General Manager.”')
    expect(md).toContain('**Tested by:** I-06 (0:30, 10:30)')
    expect(md).toContain('#### 2. Translated notice templates')
    expect(md).toContain('**Missing:** Annex F')
    expect(md).toContain('**Observations:**')
    expect(seamHandbookSection(scenario([]))).toBe('')
  })

  it('keeps comment markers in passage text from breaking the section', () => {
    const tricky = { ...seam, a: { ...seam.a, span: 'x <!-- /section:seams --> y' } }
    expect(seamHandbookSection(scenario([tricky]))).not.toContain('<!--')
  })

  it('asks one question per seam, linked to its rows, and rebuilds them', () => {
    const qs = seamHotwashQuestions(s)
    expect(qs[0]).toEqual({
      topic: 'Plan seam',
      text: 'Our Emergency Response Plan and our Crisis Communications Annex give different answers to “who approves public releases” (General Manager or Public Information Officer). Which did you follow, and which should the plans say?',
      seamId: seam.id,
      rowIds: ['I-06'],
    })
    expect(qs[1]!.text).toContain('points to Annex F')
    const withHotwash = {
      ...s,
      hotwash: {
        method: '3up3down',
        methodDescription: '',
        questions: [{ topic: 'A', text: 'B' }],
      },
    }
    mergeSeamHotwash(withHotwash)
    mergeSeamHotwash(withHotwash)
    expect(withHotwash.hotwash.questions.map((q) => q.topic)).toEqual([
      'A',
      'Plan seam',
      'Plan seam',
    ])
  })
})

describe('seam checks (FR-11)', () => {
  const seam = { ...toSeam(finding()), phaseId: 'P1' }

  it('SEAM_NOT_TESTED once the seam’s phase has rows and none tests it', () => {
    expect(lintSeams(scenario([seam]))).toEqual([])
    const codes = lintSeams(scenario([seam], [row('I-05', 'P1')])).map((w) => w.code)
    expect(codes).toEqual([SEAM_NOT_TESTED])
  })

  it('SEAM_CITATION_MISSING and SEAM_WEAK_TAG on a seam row', () => {
    const w = lintSeams(
      scenario([seam], [row('I-05', 'P1', { seamId: seam.id, purposeTag: 'RED_HERRING' })]),
    )
    expect(w.map((x) => [x.code, x.severity, x.rowId])).toEqual([
      [SEAM_CITATION_MISSING, 'warning', 'I-05'],
      [SEAM_WEAK_TAG, 'info', 'I-05'],
    ])
  })

  it('SEAM_OUTDATED when the finding was dismissed, went outdated or is gone', () => {
    const s = scenario([seam])
    expect(lintSeamsOutdated(s, [finding()])).toEqual([])
    expect(lintSeamsOutdated(s, undefined)).toEqual([])
    for (const list of [
      [finding({ status: 'dismissed' })],
      [finding({ status: 'outdated' })],
      [],
    ]) {
      const [w] = lintSeamsOutdated(s, list)
      expect(w).toMatchObject({ code: SEAM_OUTDATED, severity: 'info' })
    }
  })
})

describe('pinned chunks in a stage prompt (NFR-4)', () => {
  const chunk = (id: number) => ({
    id,
    documentId: 'd',
    documentTitle: 'D',
    headingPath: `D › ${id}`,
    ord: 0,
    text: `text ${id}`,
    tokenCount: 1,
  })
  const index = {
    chunk: (id: number) => (id === 404 ? undefined : chunk(id)),
    search: async () => [],
  } as unknown as SearchIndex
  const hit = (id: number, i: number) => ({
    key: `C${i + 1}`,
    hit: {
      chunkId: id,
      documentId: 'd',
      documentTitle: 'D',
      headingPath: 'D',
      text: 't',
      score: 0.5,
    },
  })

  it('puts pinned chunks first and drops the lowest-ranked retrieved hits to fit k', () => {
    const out = withPinned(index, [7, 9], [1, 2, 3, 4].map(hit), 4)
    expect(out.map((r) => [r.key, r.hit.chunkId])).toEqual([
      ['C1', 7],
      ['C2', 9],
      ['C3', 1],
      ['C4', 2],
    ])
  })

  it('does not repeat a pinned chunk retrieval also found, and skips one the index lost', () => {
    const out = withPinned(index, [2, 404], [1, 2, 3].map(hit), 10)
    expect(out.map((r) => r.hit.chunkId)).toEqual([2, 1, 3])
  })

  it('keeps every pinned chunk even when the limit is smaller', () => {
    expect(withPinned(index, [7, 8, 9], [1].map(hit), 2).map((r) => r.hit.chunkId)).toEqual([
      7, 8, 9,
    ])
  })
})
