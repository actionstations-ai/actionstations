// The space weather toolkit on the shared wiring (spec 0448, spec 0468): every capability it
// names has code, its field lint rules run on injects, and each template's sample data passes
// the rules that read it.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

const { ToolkitSchema } = await import('@shared/toolkits')
const { fieldLintIssues, fieldLintRuleIds } = await import('../lint-rules')
const { unknownCapabilityWarnings } = await import('../capabilities')

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/space_weather.json'), 'utf8')),
)

describe('capabilities', () => {
  it('has code for every lint rule the toolkit names', () => {
    for (const id of toolkit.lintRules) expect(fieldLintRuleIds(), id).toContain(id)
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })
})

describe('lint rules on injects', () => {
  const preview = (type: string): Record<string, unknown> =>
    (
      JSON.parse(readFileSync(resolve(`templates/injects/${type}/preview.json`), 'utf8')) as {
        fields: Record<string, unknown>
      }
    ).fields

  it('accepts the sample data of every template the toolkit adds', () => {
    for (const type of toolkit.injectTypes)
      expect(fieldLintIssues(type, preview(type)), type).toEqual([])
  })
  it('flags a watch coded as an alert and a local issue time', () => {
    const fields = { ...preview('swpc_message'), productKind: 'ALERT', issueTime: '1058 AM EST' }
    const messages = fieldLintIssues('swpc_message', fields).map((i) => i.message)
    expect(messages.some((m) => /watch code/.test(m))).toBe(true)
    expect(messages.some((m) => /UTC as the products write it/.test(m))).toBe(true)
  })
  it('flags a Kp and G level that disagree in a situation report', () => {
    const issues = fieldLintIssues('sitrep', { summary: 'Kp 6 (G3) conditions continue.' })
    expect(issues[0]?.message).toMatch(/Kp 6 is G2, not G3/)
  })
  it('flags a CME discussion with a window of an hour', () => {
    const fields = preview('swpc_cme_discussion')
    const narrow = {
      ...fields,
      arrival: {
        ...(fields.arrival as object),
        earliest: '2026 Nov 06 1930 UTC',
        latest: '2026 Nov 06 2030 UTC',
      },
    }
    expect(fieldLintIssues('swpc_cme_discussion', narrow)[0]?.message).toMatch(/uncertain by hours/)
  })
  it('flags an ICAO advisory with a wrong DTG', () => {
    const fields = { ...preview('icao_space_weather_advisory'), dtg: '2026-11-05' }
    expect(fieldLintIssues('icao_space_weather_advisory', fields)[0]?.message).toMatch(/DTG/)
  })
})
