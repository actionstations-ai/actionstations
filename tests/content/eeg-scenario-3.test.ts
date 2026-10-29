// The hand-written evaluation guides of the Scenario 3 fixture (#421) are the quality bar for
// the eeg stage: every critical task cites a section that exists in the NCIA plans the scenario
// was built from, every objective has a capability, and both decision rows (I-06, I-09) are
// linked by at least one task.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isCoreCapability } from '../../src/shared/core-capabilities'
import { Scenario } from '../../src/shared/schemas'

const ROOT = resolve(__dirname, '../..')
const scenario = Scenario.parse(
  JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/scenarios/scenario-3.json'), 'utf8')),
)
const PLANS: Record<string, string> = {
  tirp: 'reference/ncia/terminal-incident-response-plan-TIRP.md',
  asp: 'reference/ncia/airport-security-program-ASP.md',
  aep: 'reference/ncia/airport-emergency-plan-AEP.md',
}
const planText = (documentId: string): string =>
  readFileSync(resolve(ROOT, PLANS[documentId]!), 'utf8')

/** "TIRP › Section 13 › 13.6 Scenario C…" → "13.6"; "… › 1.4.5 Use of …" → "1.4.5". */
const sectionNumber = (headingPath: string): string | undefined =>
  /^(\d+(?:\.\d+)+)\b/.exec(headingPath.split('›').at(-1)!.trim())?.[1]

const tasks = scenario.evaluation.eegs.flatMap((e) => e.criticalTasks)

describe('Scenario 3 evaluation guides', () => {
  it('has four EEGs on the capabilities the scenario exercises, with 3 to 8 tasks each', () => {
    expect(scenario.evaluation.eegs.map((e) => e.capability).sort()).toEqual([
      'cybersecurity',
      'infrastructure_systems',
      'operational_coordination',
      'public_information_and_warning',
    ])
    for (const e of scenario.evaluation.eegs) {
      expect(e.criticalTasks.length, e.capability).toBeGreaterThanOrEqual(3)
      expect(e.criticalTasks.length, e.capability).toBeLessThanOrEqual(8)
      expect(e.target.length).toBeGreaterThan(40)
      expect(isCoreCapability(e.capability)).toBe(true)
    }
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length)
  })

  it('maps every objective to at least one capability that has an EEG', () => {
    const withEeg = new Set(scenario.evaluation.eegs.map((e) => e.capability))
    for (const o of scenario.objectives) {
      const caps = scenario.evaluation.objectiveCapabilities.filter((p) => p.objectiveId === o.id)
      expect(caps.length, o.name).toBeGreaterThan(0)
      for (const c of caps) expect(withEeg.has(c.capability), c.capability).toBe(true)
    }
  })

  it('cites only sections present in the NCIA plans, with the quote taken from the plan', () => {
    for (const t of tasks) {
      const { documentId, headingPath, quote } = t.citation
      expect(PLANS[documentId], `${t.id} cites ${documentId}`).toBeDefined()
      const text = planText(documentId)
      const section = sectionNumber(headingPath)
      expect(section, `${t.id}: ${headingPath}`).toBeDefined()
      expect(text, `${t.id}: ${section} not in ${documentId}`).toMatch(
        new RegExp(`(^|[^\\d.])${section!.replace(/\./g, '\\.')}([^\\d]|$)`, 'm'),
      )
      if (quote) expect(text.includes(quote.slice(0, 60)), `${t.id} quote`).toBe(true)
    }
  })

  it('links the decision rows and only rows that exist, to roles that exist', () => {
    const rows = new Set(scenario.msel.map((r) => r.id))
    const roles = new Set(scenario.roles.map((r) => r.id))
    for (const t of tasks) {
      expect(t.rowIds.length, t.id).toBeGreaterThan(0)
      for (const id of t.rowIds) expect(rows.has(id), `${t.id} → ${id}`).toBe(true)
      if (t.expectedBy) expect(roles.has(t.expectedBy), `${t.id} by ${t.expectedBy}`).toBe(true)
    }
    for (const decision of ['I-06', 'I-09'])
      expect(
        tasks.some((t) => t.rowIds.includes(decision)),
        decision,
      ).toBe(true)
  })
})
