// scripts/bench/gold.mjs: the gold-standard MSEL statistics of the benchmark (#434, FR-12).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildGold, GOLD_FILE, goldTag, parseMsel } from '../../scripts/bench/gold.mjs'
import { ROOT } from '../../scripts/bench/corpus.mjs'

const MD = `## Phase 1: Start (Hour 0:00 – 1:00)

| Time | Inject ID | From | To | Event / Message | Expected Action |
|---|---|---|---|---|---|
| 0:00 | START | Facilitator | All | STARTEX. | Begin. |
| 0:20 | I-01 | Helpdesk | IT | Ticket (Noise): soda machine | Ignore. |

## Phase 2: Crisis (Hour 1:00 – 2:00)

| Time | Inject ID | From | To | Event / Message | Expected Action |
|---|---|---|---|---|---|
| 1:00 | I-02 | Facilitator | All | SCENARIO JUMP: it is 10:00 | Regroup. |
| 1:15 | I-03 | PA | All | Announcement | CRITICAL DECISION POINT: silence the PA. |
| 1:30 | END | Facilitator | All | ENDEX | Hot wash. |
`

describe('parseMsel', () => {
  it('reads phases with their hours and rows with their phase', () => {
    const { phases, rows } = parseMsel(MD)
    expect(phases).toEqual([
      { index: 0, title: 'Start', startMin: 0, endMin: 60 },
      { index: 1, title: 'Crisis', startMin: 60, endMin: 120 },
    ])
    expect(rows.map((r) => `${r.id}@${r.phase}`)).toEqual([
      'START@0',
      'I-01@0',
      'I-02@1',
      'I-03@1',
      'END@1',
    ])
  })

  it('tags rows from the markers in the text, then the hand-tagged copy', () => {
    const tags = parseMsel(MD).rows.map((r) => goldTag(r, { 'I-01': 'CLUE' }))
    expect(tags).toEqual(['STARTEX', 'NOISE', 'TIME_JUMP', 'DECISION_POINT', 'ENDEX'])
  })
})

describe('bench/gold/scenario-3.json', () => {
  it('is up to date with reference/scenario-3/msel.md (run node scripts/bench/gold.mjs)', () => {
    const committed = JSON.parse(readFileSync(join(ROOT, GOLD_FILE), 'utf8'))
    expect(committed).toEqual(buildGold())
  })

  it('covers every tag group the rubric checks, with its decision points in the middle phases', () => {
    const gold = buildGold()
    expect(gold.groups.length).toBe(6)
    expect(gold.decisionPhases).toEqual([1, 2])
    expect(gold.durationHours).toBe(4)
  })
})
