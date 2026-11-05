// The pharmacy toolkit on the shared wiring (spec 0448, spec 0463): every capability it names has
// code, its lint rules run on injects of its types and reuse the clinical dose check, and its
// forms and metrics are tested where they are added.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

await import('../../render/figures')
const { ToolkitSchema } = await import('@shared/toolkits')
const { fieldLintIssues, fieldLintRuleIds } = await import('../lint-rules')
const { unknownCapabilityWarnings } = await import('../capabilities')

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/pharmacy.json'), 'utf8')),
)
const preview = (type: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(resolve(`templates/injects/${type}/preview.json`), 'utf8')) as {
      fields: Record<string, unknown>
    }
  ).fields
const messages = (type: string, fields: Record<string, unknown>) =>
  fieldLintIssues(type, fields).map((i) => i.message)

describe('code the toolkit names exists', () => {
  it('has no figure kind, connector, metric or lint rule the app lacks', () => {
    expect(fieldLintRuleIds()).toEqual(expect.arrayContaining(toolkit.lintRules))
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })
})

describe('field lint rules on injects', () => {
  it('flags an NDC of the wrong shape on a shortage board', () => {
    const fields = preview('pharmacy_shortage_board')
    const rows = (fields.rows as Record<string, unknown>[]).map((r, i) =>
      i === 0 ? { ...r, ndc: '9999804120' } : r,
    )
    expect(messages('pharmacy_shortage_board', { ...fields, rows }).join('\n')).toMatch(
      /no hyphens/,
    )
  })

  it('flags days on hand that are not on hand over usage', () => {
    const fields = preview('pharmacy_shortage_board')
    const rows = (fields.rows as Record<string, unknown>[]).map((r, i) =>
      i === 0 ? { ...r, daysOnHand: 9 } : r,
    )
    expect(messages('pharmacy_shortage_board', { ...fields, rows }).join('\n')).toMatch(
      /4 days, not 9/,
    )
  })

  it('flags a temperature pair in prose and a range label that disagrees with the numbers', () => {
    const fields = {
      ...preview('pharmacy_excursion_report'),
      cause: 'The unit reached 12 °C (40 °F).',
    }
    expect(messages('pharmacy_excursion_report', fields).join('\n')).toMatch(/12 °C is 54 °F/)
    const label = { ...preview('pharmacy_temperature_log'), rangeLabel: '2 to 10 °C (36 to 50 °F)' }
    expect(messages('pharmacy_temperature_log', label).join('\n')).toMatch(
      /range fields are 2 to 8/,
    )
  })

  it('flags an excursion that states no time outside the range', () => {
    const fields = { ...preview('pharmacy_excursion_report'), minutesOutside: 0 }
    expect(messages('pharmacy_excursion_report', fields).join('\n')).toMatch(/0 minutes/)
  })

  it('reuses the clinical dose check on a proposed substitute dose', () => {
    const fields = {
      ...preview('pharmacy_substitution_checklist'),
      proposedDose: { drug: 'Heparin', dose: '90,000 units', route: 'Subcutaneous' },
    }
    expect(messages('pharmacy_substitution_checklist', fields).join('\n')).toMatch(
      /above a plausible single adult dose/,
    )
    const ok = {
      ...preview('pharmacy_substitution_checklist'),
      proposedDose: { drug: 'Heparin', dose: '5,000 units', route: 'Subcutaneous' },
    }
    expect(messages('pharmacy_substitution_checklist', ok)).toEqual([])
  })

  it('flags concentrations stated in different units on a substitution', () => {
    const fields = preview('pharmacy_substitution_checklist')
    const checks = (fields.checks as Record<string, unknown>[]).map((c, i) =>
      i === 0 ? { ...c, from: '154 mEq/L sodium', to: '13 mg per bag' } : c,
    )
    expect(messages('pharmacy_substitution_checklist', { ...fields, checks }).join('\n')).toMatch(
      /same unit/,
    )
  })

  it('flags a queue marked within target when its oldest item is past the target', () => {
    const fields = preview('pharmacy_queue_report')
    const queues = (fields.queues as Record<string, unknown>[]).map((q, i) =>
      i === 1 ? { ...q, status: 'Within target' } : q,
    )
    expect(messages('pharmacy_queue_report', { ...fields, queues }).join('\n')).toMatch(
      /over target/,
    )
  })

  it('flags a recall lot that does not balance', () => {
    const fields = preview('pharmacy_recall_notice')
    const lots = (fields.lots as Record<string, unknown>[]).map((l, i) =>
      i === 0 ? { ...l, dispensed: 300 } : l,
    )
    expect(messages('pharmacy_recall_notice', { ...fields, lots }).join('\n')).toMatch(
      /not the 600 received/,
    )
  })

  it('flags wrong due dates and the wrong clock words on a loss notice', () => {
    const fields = {
      ...preview('pharmacy_loss_notice'),
      noticeDueBy: '2026-11-20',
      circumstances: 'Form 106 is due within one business day.',
    }
    const out = messages('pharmacy_loss_notice', fields).join('\n')
    expect(out).toMatch(/due 2026-11-06/)
    expect(out).toMatch(/Form 106 is filed electronically within 45 days/)
  })

  it('accepts every preview and an absent structured field', () => {
    for (const type of toolkit.injectTypes) expect(messages(type, preview(type)), type).toEqual([])
    expect(fieldLintIssues('pharmacy_shortage_board', {})).toEqual([])
    expect(fieldLintIssues('email', { body: 'No numbers here.' })).toEqual([])
  })
})
