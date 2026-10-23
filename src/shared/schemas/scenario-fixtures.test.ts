// Every hand-authored scenario fixture (tests/fixtures/scenarios/*.json) parses as a Scenario
// and is internally consistent, so it can seed an example project (#186).
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Scenario } from './scenario'

const DIR = resolve(__dirname, '../../../tests/fixtures/scenarios')
const files = readdirSync(DIR).filter((f) => /^scenario-\d+\.json$/.test(f))

describe.each(files)('%s', (file) => {
  const raw = JSON.parse(readFileSync(join(DIR, file), 'utf8'))
  it('parses as a Scenario', () => {
    const r = Scenario.safeParse(raw)
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues.slice(0, 5), null, 1)).toBe(
      true,
    )
  })
  it('rows reference known phases and roles, with unique ids', () => {
    const s = Scenario.parse(raw)
    const phases = new Set(s.phases.map((p) => p.id))
    const roles = new Set(s.roles.map((r) => r.id))
    expect(s.msel.length).toBeGreaterThan(5)
    expect(new Set(s.msel.map((r) => r.id)).size).toBe(s.msel.length)
    for (const r of s.msel) {
      expect(phases.has(r.phaseId), `${r.id} phase ${r.phaseId}`).toBe(true)
      for (const id of r.toRoleIds) expect(roles.has(id), `${r.id} role ${id}`).toBe(true)
    }
  })
  it('uses the media inquiry slip only for calls from the media (#222)', () => {
    const s = Scenario.parse(raw)
    for (const r of s.msel.filter((x) => x.format === 'media_inquiry_phone_slip'))
      expect(`${r.from} ${r.event}`, r.id).toMatch(/media|news|press|reporter|channel/i)
    if (file === 'scenario-3.json')
      expect(s.msel.find((r) => r.id === 'I-10b')?.format).toBe('phone_call')
  })
})
