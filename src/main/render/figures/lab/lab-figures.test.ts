// The lab figure kinds (#873): registered beside the generic ones, valid accessible SVG, the same
// bytes twice, a text summary and data table that agree with the drawing, flags in words and
// symbols as well as color, and bad data refused.
import { describe, expect, it } from 'vitest'
import {
  accessDataFromRows,
  inventoryDataFromRun,
  registerDataFromAlarm,
  trendDataFromAlarm,
} from '../../../toolkits/lab_safety/figure-data'
import { runAccessLog } from '../../../toolkits/lab_safety/simulate/access'
import { AlarmParams, runAlarm } from '../../../toolkits/lab_safety/simulate/alarm'
import { runInventory } from '../../../toolkits/lab_safety/simulate/inventory'
import { listFigureKinds, renderFigure } from '../index'
import { LAB_FIGURE_KINDS } from './index'

const alarmParams = AlarmParams.parse({ seed: 4, acknowledgeAfterMin: 95 })
const alarm = runAlarm({ seed: 4, acknowledgeAfterMin: 95 })
const inventory = runInventory({ seed: 2, discrepancies: 2 })
const access = runAccessLog({ seed: 3, anomalies: ['after_hours_entry', 'forced_open'] })

const FIXTURES: Record<string, unknown> = {
  lab_notification_clock_board: {
    title: 'Notification clocks',
    rows: [
      {
        notification: 'Immediate notice',
        recipient: 'CDC or APHIS',
        rule: 'Immediately',
        due: 'Wed 21 Oct 2026 10:15',
        status: 'made',
        made: 'Wed 21 Oct 2026 09:40, 35 m early',
      },
      {
        notification: 'Form 3',
        recipient: 'CDC or APHIS',
        rule: 'Within 7 calendar days',
        due: '',
        status: 'not_started',
      },
    ],
  },
  lab_temperature_alarm_trend: trendDataFromAlarm(alarm, alarmParams),
  lab_inventory_reconciliation: inventoryDataFromRun(
    inventory,
    'Marston State University (fictional)',
  ),
  lab_sample_loss_register: registerDataFromAlarm(alarm, 'Freezer 3', {
    atRisk: true,
    moved: [alarm.samples[0]!.sample],
  }),
  lab_access_log: accessDataFromRows(access, 'Room 118, door 1'),
}

describe('lab figure kinds', () => {
  it('register beside the generic kinds', () => {
    const kinds = listFigureKinds()
    for (const k of LAB_FIGURE_KINDS) expect(kinds).toContain(k.kind)
    expect(kinds).toContain('status_board')
    expect(LAB_FIGURE_KINDS.map((k) => k.kind).sort()).toEqual(Object.keys(FIXTURES).sort())
  })

  it.each(Object.entries(FIXTURES))(
    '%s: accessible, deterministic, summary and table present',
    (kind, data) => {
      const a = renderFigure({ kind, data })
      const b = renderFigure({ kind, data })
      expect(a.svg).toBe(b.svg)
      expect(a.svg).toMatch(/^<svg [^>]*role="img"[^>]*aria-labelledby=/)
      expect(a.svg).toMatch(/<title [^>]*>[^<]+<\/title><desc [^>]*>[^<]+<\/desc>/)
      expect(a.summary.length).toBeGreaterThan(40)
      expect(a.table!.rows.length).toBeGreaterThan(0)
      for (const row of a.table!.rows) expect(row).toHaveLength(a.table!.columns.length)
      expect(a.svg).not.toMatch(/<image|href=/)
    },
  )

  it('the inventory figure flags exactly the discrepancy rows in words and a symbol', () => {
    const out = renderFigure({
      kind: 'lab_inventory_reconciliation',
      data: FIXTURES.lab_inventory_reconciliation,
    })
    const off = inventory.rows.filter((r) => r.observed !== r.expected)
    expect(out.svg.match(/Discrepancy/g)).toHaveLength(off.length)
    expect(out.summary).toContain(`${off.length} with a discrepancy`)
    expect(out.table!.rows.filter((r) => r[5] === 'Discrepancy')).toHaveLength(off.length)
  })

  it('the sample register states how many irreplaceable samples are at risk', () => {
    const out = renderFigure({
      kind: 'lab_sample_loss_register',
      data: FIXTURES.lab_sample_loss_register,
    })
    const irreplaceable = alarm.samples.filter((s) => s.value === 'irreplaceable').length
    const moved = alarm.samples[0]!.value === 'irreplaceable' ? 1 : 0
    expect(out.summary).toContain(
      `${irreplaceable - moved} irreplaceable samples are at risk or lost`,
    )
    expect(out.svg).toContain('Moved to backup')
  })

  it('the trend names the set point, threshold, limit and the alarm times', () => {
    const out = renderFigure({
      kind: 'lab_temperature_alarm_trend',
      data: FIXTURES.lab_temperature_alarm_trend,
    })
    expect(out.summary).toMatch(/set point -80 °C, alarm threshold -65 °C, designer limit -50 °C/)
    expect(out.summary).toMatch(/Alarm sounded at 2026-10-25 00:10/)
    expect(out.summary).toMatch(/alarm acknowledged at/)
  })

  it('the access log flags the forced door and the after-hours entry', () => {
    const out = renderFigure({ kind: 'lab_access_log', data: FIXTURES.lab_access_log })
    expect(out.svg).toContain('Door forced')
    expect(out.svg).toContain('After hours')
    expect(out.summary).toMatch(/2 flagged/)
  })

  it('refuses bad data with the kind named', () => {
    expect(() =>
      renderFigure({ kind: 'lab_inventory_reconciliation', data: { rows: [] } }),
    ).toThrow(/lab_inventory_reconciliation/)
    expect(() =>
      renderFigure({
        kind: 'lab_access_log',
        data: { rows: [{ time: 't', person: 'p', event: 'teleport' }] },
      }),
    ).toThrow()
    expect(() =>
      renderFigure({
        kind: 'lab_temperature_alarm_trend',
        data: { unit: 'x', setPointC: 1, alarmThresholdC: 2, points: [] },
      }),
    ).toThrow()
  })
})
