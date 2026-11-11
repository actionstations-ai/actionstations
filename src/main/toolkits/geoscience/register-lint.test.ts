// The earth science lint rules as field lint rules, and the check that every capability the four
// toolkits name exists in the app (so pack details never say "names things this app lacks").
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')

const { ToolkitSchema } = await import('@shared/toolkits')
const { fieldLintIssues, fieldLintRuleIds } = await import('../lint-rules')
const { unknownCapabilityWarnings } = await import('../capabilities')
const { registerGeoscienceToolkits } = await import('./register')

const toolkit = (id: string) =>
  ToolkitSchema.parse(
    JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', '..', '..', 'packs', 'toolkits', `${id}.json`),
        'utf8',
      ),
    ),
  )
const messages = (type: string, fields: Record<string, unknown>) =>
  fieldLintIssues(type, fields).map((i) => i.message)

describe('earth science field lint rules', () => {
  it('registers every rule the four toolkits name', () => {
    for (const id of ['seismic', 'volcanic', 'tsunami', 'debris_flow'])
      for (const r of toolkit(id).lintRules) expect(fieldLintRuleIds(), `${id}: ${r}`).toContain(r)
  })

  it('names no capability the app lacks', () => {
    registerGeoscienceToolkits()
    for (const id of ['seismic', 'volcanic', 'tsunami', 'debris_flow'])
      expect(unknownCapabilityWarnings(toolkit(id)), id).toEqual([])
  })

  it('catches magnitude and intensity swapped in a summary field', () => {
    expect(
      messages('earthquake_event_summary', { notes: 'A magnitude VII earthquake struck at dawn.' }),
    ).toHaveLength(1)
    expect(
      messages('earthquake_event_summary', {
        notes: 'The M 6.8 earthquake reached intensity VII.',
      }),
    ).toEqual([])
  })

  it('catches a wrong alert level and color code pair in the fields and in the text', () => {
    expect(messages('volcano_alert_badge', { alertLevel: 'WATCH', colorCode: 'RED' })[0]).toMatch(
      /pairs with .*ORANGE/,
    )
    expect(messages('volcano_alert_badge', { alertLevel: 'WATCH', colorCode: 'ORANGE' })).toEqual(
      [],
    )
    expect(messages('volcano_alert_badge', { alertLevel: 'WARNING', colorCode: 'ORANGE' })).toEqual(
      [],
    )
    expect(
      messages('press_release', {
        text: 'The observatory raised the volcano to WARNING / YELLOW today.',
      }),
    ).toHaveLength(1)
  })

  it('checks the date-time group, position and notice number of a VONA', () => {
    const good = { dtg: '20261105/1815Z', psn: 'N4652 W12145', noticeNumber: '2026/147' }
    expect(messages('vona', good)).toEqual([])
    expect(messages('vona', { ...good, dtg: '2026-11-05 18:15' })).toHaveLength(1)
    expect(messages('vona', { ...good, psn: '46.87 N, 121.76 W' })).toHaveLength(1)
  })

  it('catches a tsunami watch marked as sent by wireless alert', () => {
    expect(
      messages('tsunami_message', { level: 'Tsunami Watch', wirelessAlertSent: true })[0],
    ).toMatch(/not sent as a Wireless Emergency Alert/)
    expect(
      messages('tsunami_message', { level: 'Tsunami Warning', wirelessAlertSent: true }),
    ).toEqual([])
  })

  it('catches early warning times the physics cannot give, with the path of the field', () => {
    const issues = fieldLintIssues('eew_action_log', {
      note: 'Hollis Point, 10 km away, had 8 seconds of warning.',
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.path).toBe('fields.note')
  })

  it('leaves types a rule does not read alone', () => {
    expect(messages('lahar_warning', { detection: 'A magnitude VII earthquake.' })).toEqual([])
  })
})
