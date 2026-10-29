import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { fixtureModel, hseepFixtureModel, withoutEvaluation } =
  await import('../../../../tests/fixtures/export/model')
const { hseepBlocks, headingsOf, textOf, scheduleRows, acronymRows, FILL_IN } = await import('.')
const { NO_QUESTIONS_YET, WITHHELD_NARRATIVE } = await import('./sitman')
const { NO_EEGS_YET } = await import('./handbook')
const { handbookParts } = await import('./handbook-sections')

const h2s = (blocks: ReturnType<typeof hseepBlocks>) =>
  headingsOf(blocks)
    .filter((h) => h.level === 2)
    .map((h) => h.text)

describe('Exercise Plan (ExPlan)', () => {
  it('follows the HSEEP 2020 section order with appendices A to D', () => {
    expect(h2s(hseepBlocks(hseepFixtureModel(), 'explan'))).toEqual([
      'Exercise Overview',
      'General Information',
      'Exercise Logistics',
      'Post-Exercise and Evaluation Activities',
      'Participant Information and Guidance',
      'Appendix A: Exercise Schedule',
      'Appendix B: Exercise Participants',
      'Appendix C: Communications Plan',
      'Appendix D: Acronyms',
    ])
  })

  it('reads every exercise detail from scenario.conduct', () => {
    const text = textOf(hseepBlocks(hseepFixtureModel(), 'explan'))
    expect(text).toContain('Exercise Name: NCIA 2027 Data Integrity Tabletop Exercise')
    expect(text).toContain('Exercise Dates: March 4, 2027, 08:30–13:30')
    expect(text).toContain('Sponsor: North Coast Regional Airport Authority')
    expect(text).toContain('Dana Whitfield · North Coast Regional Airport Authority · 555-0142')
    expect(text).toContain('NCIA Administration Building, Emergency Operations Center, Room 210')
    expect(text).toContain('Radio channel 4 (Ops Tac) | Player radio traffic')
    expect(text).toContain('AODB | Airport Operational Database')
  })

  it('prints blank details as blanks (fill-in lines), never invented values', () => {
    const blocks = hseepBlocks(withoutEvaluation(fixtureModel()), 'explan')
    const facts = blocks.find((b) => b.kind === 'facts')
    if (facts?.kind !== 'facts') throw new Error('no facts table')
    const value = (label: string) => facts.rows.find((r) => r.label === label)?.value
    expect(value('Exercise Name')).toBe('Flight to Nowhere')
    for (const label of [
      'Exercise Dates',
      'Sponsor',
      'Point of Contact',
      'Mission Area(s)',
      'Core Capabilities',
    ])
      expect(value(label), label).toBe('')
    const participants = blocks.find(
      (b) => b.kind === 'table' && b.caption === 'Exercise participants',
    )
    expect(participants).toMatchObject({ rows: [['', '']], fillBlanks: true })
  })

  it('shows mission areas and Core Capabilities from the evaluation guides (#421)', () => {
    const text = textOf(hseepBlocks(fixtureModel(), 'explan'))
    expect(text).toContain(
      'Core Capabilities: Public Information and Warning, Operational Coordination, Infrastructure Systems, Cybersecurity',
    )
    expect(text).toMatch(/Mission Area\(s\): \S/)
    expect(text).toMatch(/Decision Making: .* \| Operational Coordination, Infrastructure Systems/)
  })

  it('carries no inject detail, so players may read it', () => {
    const model = hseepFixtureModel()
    const text = textOf(hseepBlocks(model, 'explan'))
    for (const row of model.scenario.msel) expect(text, row.id).not.toContain(row.event)
  })
})

describe('Situation Manual (SitMan)', () => {
  it('has one module per phase between general information and the appendices', () => {
    const model = hseepFixtureModel()
    expect(h2s(hseepBlocks(model, 'sitman'))).toEqual([
      'Exercise Overview',
      'General Information',
      'Module 1: The Glitch',
      'Module 2: The Crisis',
      'Module 3: Manual Mode',
      'Module 4: Recovery & Verification',
      'Appendix A: Exercise Schedule',
      'Appendix B: Exercise Participants',
      'Appendix C: Acronyms',
    ])
    const text = textOf(hseepBlocks(model, 'sitman'))
    expect(text).toContain('Time window: 1:00–2:00 (10:00–11:00)')
    expect(text).toContain('Ops: who has the authority to silence the PA')
    expect(text).toContain('(Objective: Decision Making)')
  })

  it('player edition gives module 1 in full and withholds later narratives', () => {
    const model = hseepFixtureModel()
    const text = textOf(hseepBlocks(model, 'sitman_player'))
    const modules = model.scenario.sitman!.modules
    expect(text).toContain(modules[0]!.narrativeMd)
    for (const m of modules.slice(1)) {
      expect(text).not.toContain(m.narrativeMd)
      for (const k of m.keyIssues) expect(text).not.toContain(k)
      for (const q of m.discussionQuestions) expect(text).toContain(q.text)
    }
    expect(text.split(WITHHELD_NARRATIVE).length - 1).toBe(modules.length - 1)
  })

  it('without the sitman stage: phase goals as narrative and a not-generated note', () => {
    const model = fixtureModel()
    const blocks = hseepBlocks(model, 'sitman')
    const text = textOf(blocks)
    for (const p of model.scenario.phases) expect(text).toContain(p.goal)
    expect(text.split(NO_QUESTIONS_YET).length - 1).toBe(model.scenario.phases.length)
    expect(text).toContain('no-fault learning environment')
  })
})

describe('Controller and Evaluator Handbook (HSEEP)', () => {
  it('follows the HSEEP order and places the handbook.md sections under it', () => {
    const blocks = hseepBlocks(fixtureModel(), 'handbook_hseep')
    expect(h2s(blocks)).toEqual([
      'Exercise Overview',
      'General Information',
      'Controller Instructions',
      'Evaluator Instructions',
      'Appendix A: Exercise Schedule',
      'Appendix B: MSEL Summary',
      'Appendix C: Exercise Evaluation Guides',
      'Appendix D: Communications Directory',
      'Appendix E: Acronyms',
    ])
    const h3s = headingsOf(blocks).map((h) => h.text)
    expect(h3s.indexOf('Room Setup and Logistics')).toBeGreaterThan(
      h3s.indexOf('Controller Instructions'),
    )
    expect(h3s.indexOf('Grading Rubric')).toBeGreaterThan(h3s.indexOf('Evaluator Instructions'))
    const text = textOf(blocks)
    expect(text).toContain('Head Table: Incident Commander')
    expect(text).toContain('Metric 1: Operational Coordination')
    expect(text).not.toContain(NO_EEGS_YET)
  })

  it('EEG appendix and MSEL summary carry the guides; fill-ins without them (#421)', () => {
    const model = fixtureModel()
    const task = model.scenario.evaluation.eegs[0]!.criticalTasks[0]!
    const blocks = hseepBlocks(model, 'handbook_hseep')
    const text = textOf(blocks)
    expect(headingsOf(blocks).map((h) => h.text)).toContain('Public Information and Warning')
    expect(text).toContain(`${task.task} | ${task.rowIds.join(', ')}`)
    expect(text).toContain('Met: the critical task was performed')
    const summary = blocks.find((b) => b.kind === 'table' && b.caption === 'MSEL summary')
    if (summary?.kind !== 'table') throw new Error('no MSEL summary')
    expect(summary.rows.find((r) => r[1] === task.rowIds[0])![6]).toContain(
      'Public Information and Warning',
    )
    const bare = textOf(hseepBlocks(withoutEvaluation(fixtureModel()), 'handbook_hseep'))
    expect(bare.split(NO_EEGS_YET).length - 1).toBe(2)
    expect(bare).toContain('P: Performed without challenges')
  })

  it('MSEL summary has one row per MSEL row', () => {
    const model = fixtureModel()
    const summary = hseepBlocks(model, 'handbook_hseep').find(
      (b) => b.kind === 'table' && b.caption === 'MSEL summary',
    )
    if (summary?.kind !== 'table') throw new Error('no MSEL summary')
    expect(summary.header).toEqual([
      'Time',
      'ID',
      'From',
      'To',
      'Inject',
      'Expected Action',
      'Capability',
    ])
    expect(summary.rows.map((r) => r[1])).toEqual(model.scenario.msel.map((r) => r.id))
  })

  it('shows EEGs from any evaluation data the model carries', () => {
    const model = fixtureModel({
      evaluation: {
        missionAreas: ['Response'],
        objectiveCapabilities: { 'obj-decision': ['Operational Coordination'] },
        eegs: [
          {
            capability: 'Operational Coordination',
            objectiveIds: ['obj-decision'],
            criticalTasks: [{ id: 'CT-1', text: 'Decide to take FIDS offline', rowIds: ['I-09'] }],
          },
        ],
        ratingScale: [],
      },
    })
    const blocks = hseepBlocks(model, 'handbook_hseep')
    const text = textOf(blocks)
    expect(text).not.toContain(NO_EEGS_YET)
    expect(text).toContain('Decide to take FIDS offline | I-09')
    expect(textOf(hseepBlocks(model, 'explan'))).toContain('Mission Area(s): Response')
  })

  it('splits marked and unmarked handbooks into the same parts', () => {
    const marked = [
      '# Controller / Evaluator (C/E) Handbook',
      '<!-- section:room -->\n### 2. Room Setup & Logistics\n\nU-shape tables.\n<!-- /section:room -->',
      '<!-- section:rules -->\n### 3. Rules of Play\n\nYou are the SimCell.\n<!-- /section:rules -->',
    ].join('\n\n')
    expect(handbookParts(marked)).toMatchObject({
      room: 'U-shape tables.',
      rules: 'You are the SimCell.',
    })
    const plain =
      '## Title\n\n### 2. Room Setup & Logistics\n\nU-shape.\n\n### Extra Notes\n\nKeep it.'
    expect(handbookParts(plain)).toMatchObject({
      room: 'U-shape.',
      other: [{ heading: 'Extra Notes', body: 'Keep it.' }],
    })
  })
})

describe('shared appendices', () => {
  it('schedule: modules, STARTEX, time jumps and ENDEX with the scenario clock', () => {
    const rows = scheduleRows(fixtureModel())
    expect(rows).toContainEqual(['0:00', '09:00', 'Module 1: The Glitch begins'])
    expect(rows).toContainEqual(['0:00', '09:00', 'STARTEX'])
    expect(rows).toContainEqual(['1:00', '10:00', 'Time jump (controller announcement)'])
    expect(rows).toContainEqual(['3:45', '12:45', 'ENDEX'])
    expect(rows.at(-2)).toEqual(['', '', 'Hot wash'])
  })

  it('acronyms: the designer list wins; otherwise HSEEP terms and role abbreviations', () => {
    const own = acronymRows(hseepFixtureModel()).map((r) => r[0])
    expect(own).toEqual(['AODB', 'FIDS', 'PIO', 'TIRP'])
    const seeded = acronymRows(fixtureModel()).map((r) => r[0])
    expect(seeded).toEqual(expect.arrayContaining(['HSEEP', 'MSEL', 'SimCell', 'ASC']))
  })

  it('the fill-in line is a visible blank', () => {
    expect(FILL_IN).toMatch(/^_{10,}$/)
  })
})
