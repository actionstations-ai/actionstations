// The AAR/IP of the Scenario 3 fixture (#419) is the quality bar for the aar stage: a
// hand-written facilitator record (notes on I-06, I-09 and I-12, three strengths, three
// improvements, two decisions) and a hand-written stage output, mapped and rendered, must equal
// the golden document; every plan section it cites exists in the NCIA plans; and nothing from a
// named live session's display names reaches the record block the prompt is built from.
//   UPDATE_GOLDENS=1 pnpm test -- tests/content/aar-scenario-3.test.ts   rewrites the golden.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FacilitatorState } from '../../src/shared/ipc/facilitator'
import { AarOutput, Scenario } from '../../src/shared/schemas'
import { aarStatus } from '../../src/shared/schemas/aar'
import { recordBlock } from '../../src/main/aar/condense'
import { assembleAar } from '../../src/main/aar/draft'
import { renderAarMarkdown } from '../../src/main/aar/markdown'
import { applyAar, scenarioCitations } from '../../src/main/aar/mapper'
import { assembleRecord } from '../../src/main/aar/record'
import { parseLog } from '../../src/main/aar/sources/live-log'

const ROOT = resolve(__dirname, '../..')
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8')
const GOLDEN = 'tests/fixtures/aar/scenario-3.aar.md'

const scenario = Scenario.parse(JSON.parse(read('tests/fixtures/scenarios/scenario-3.json')))
const facilitator = FacilitatorState.parse(JSON.parse(read('tests/fixtures/aar/scenario-3.facilitator.json')))
const output = AarOutput.parse(JSON.parse(read('tests/fixtures/aar/scenario-3.aar-output.json')))
const live = parseLog(read('tests/fixtures/live/session-scenario-3.jsonl'))

const PLANS: Record<string, string> = {
  tirp: 'reference/ncia/terminal-incident-response-plan-TIRP.md',
  asp: 'reference/ncia/airport-security-program-ASP.md',
  aep: 'reference/ncia/airport-emergency-plan-AEP.md',
}
const sectionNumber = (headingPath: string): string | undefined =>
  /^(\d+(?:\.\d+)+)\b/.exec(headingPath.split('›').at(-1)!.trim())?.[1]

const NOW = '2026-10-28T18:00:00.000Z'
const run = {
  stage: 'aar' as const,
  startedAt: NOW,
  finishedAt: NOW,
  status: 'ok' as const,
  repairAttempts: 0,
  promptRef: 'aar@default',
}

function draft() {
  const record = assembleRecord(scenario, { facilitator })
  let n = 0
  const applied = applyAar(output, {
    scenario,
    record,
    retrieved: [],
    scenarioCitations: scenarioCitations(scenario),
    previous: null,
    newId: () => `aar-${String(++n).padStart(3, '0')}`,
  })
  const aar = assembleAar(applied, output, { built: { scenario, record }, previous: null }, run, NOW)
  return { record, applied, aar }
}

describe('Scenario 3 AAR/IP', () => {
  it('maps every finding of the hand-written output without dropping anything', () => {
    const { applied } = draft()
    expect(applied.unsupported).toEqual([])
    expect(applied.unknownRefs).toEqual([])
    expect(applied.droppedCitations).toEqual([])
    expect(applied.unknownRoles).toEqual([])
    expect(applied.capabilities.map((c) => c.capability)).toEqual([
      'public_information_and_warning',
      'operational_coordination',
      'infrastructure_systems',
      'cybersecurity',
    ])
    expect(applied.capabilities.every((c) => c.proposedRating && !c.rating)).toBe(true)
  })

  it('renders the golden document, which stays a draft until the ratings are confirmed', () => {
    const { aar } = draft()
    expect(aarStatus(aar)).toBe('draft')
    const md = renderAarMarkdown(aar, scenario, 'North Coast Regional Airport Authority')
    if (process.env.UPDATE_GOLDENS === '1') writeFileSync(resolve(ROOT, GOLDEN), md)
    expect(md).toBe(read(GOLDEN))
    expect(md).toContain('Status: Draft (ratings pending)')
    expect(md.match(/Rating pending/g)?.length).toBeGreaterThanOrEqual(4)
    expect(md).toContain('Evidence: facilitator notes, hot wash items and decision log.')
  })

  it('cites only plan sections that exist in the NCIA plans', () => {
    const { aar } = draft()
    const citations = aar.capabilities.flatMap((c) =>
      [...c.strengths, ...c.areasForImprovement].flatMap((f) => f.citations),
    )
    expect(citations.length).toBeGreaterThan(5)
    for (const c of citations) {
      expect(PLANS[c.documentId], c.headingPath).toBeDefined()
      const section = sectionNumber(c.headingPath)
      expect(section, c.headingPath).toBeDefined()
      expect(read(PLANS[c.documentId]!)).toMatch(
        new RegExp(`(^|[^\\d.])${section!.replace(/\./g, '\\.')}([^\\d]|$)`, 'm'),
      )
    }
  })

  it('gives every corrective action an element and a proposed role, and no owner, contact or date', () => {
    const { aar } = draft()
    const actions = aar.capabilities.flatMap((c) =>
      c.areasForImprovement.flatMap((f) => f.correctiveActions),
    )
    expect(actions.length).toBe(6)
    const roles = new Set(scenario.roles.map((r) => r.id))
    for (const a of actions) {
      expect(roles.has(a.ownerRole!), a.action).toBe(true)
      expect(a.ownerOrganization).toBe('')
      expect(a.poc).toBe('')
      expect(a.dueDate).toBeUndefined()
    }
  })

  it('keeps the named live session out of the prompt record block', () => {
    const record = assembleRecord(scenario, {
      facilitator,
      live: { sessionId: 'run1', skipped: 0, entries: live.entries },
    })
    const block = recordBlock(record, scenario, 'full')
    for (const name of ['Dana Whitfield', 'Marcus Lee', 'Priya Natarajan', 'Tom Okafor'])
      expect(block).not.toContain(name)
    expect(block).toContain('[hw:hw-down-1]')
    expect(block).toContain('[vote:')
  })
})
