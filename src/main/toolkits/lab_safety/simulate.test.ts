// The lab simulations (#873): the same parameters give the same data, the alarm series agrees with
// itself (alarm time, call-out, acknowledgment, warming curve), most inventory discrepancies are
// records problems, every dataset says simulated, and the follow-up list feeds the contact reach
// metric the epidemiology toolkit already ships.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.1',
    getPath: () => tmpdir(),
    isPackaged: false,
    getAppPath: () => resolve('.'),
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const { runAlarm, AlarmParams } = await import('./simulate/alarm')
const { runInventory, RECORDS_CAUSES } = await import('./simulate/inventory')
const { runAccessLog, runBackupStatus } = await import('./simulate/access')
const { runFollowup } = await import('./simulate/followup')
const { runGenerator, generatorIds } = await import('../../case-data/generators')
const { caseDir } = await import('../../case-data/store')
const { readGroundTruth, readModeledSeries } = await import('../../evaluation/metrics/inputs')
const { runMetric } = await import('../../evaluation/metrics/registry')
const { registerEpidemiologyMetrics } = await import('../epidemiology/register')
await import('./register-generators')

const min = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000

describe('alarm series', () => {
  const run = runAlarm({ seed: 4, acknowledgeAfterMin: 95, calloutDelayMin: 20 })
  const at = (kind: string) => run.events.find((e) => e.kind === kind)?.time

  it('is the same for the same parameters and different for another seed', () => {
    expect(runAlarm({ seed: 4, acknowledgeAfterMin: 95, calloutDelayMin: 20 })).toEqual(run)
    expect(runAlarm({ seed: 5 }).points).not.toEqual(run.points)
  })

  it('sounds when the threshold is first crossed and after the failure begins', () => {
    const alarm = at('alarm_sounded')!
    const first = run.points.find((p) => p.time >= at('failure_started')! && p.c >= -65)!
    expect(alarm).toBe(first.time)
    expect(
      run.points
        .filter((p) => p.time < alarm && p.time >= at('failure_started')!)
        .every((p) => p.c < -65),
    ).toBe(true)
  })

  it('places the call-out and the acknowledgment by the parameters', () => {
    expect(min(at('alarm_sounded')!, at('call_out')!)).toBe(20)
    expect(min(at('alarm_sounded')!, at('acknowledged')!)).toBe(95)
  })

  it('warms toward room temperature and never above it', () => {
    const temps = run.points.map((p) => p.c)
    expect(Math.max(...temps)).toBeLessThanOrEqual(22.2)
    const late = run.points.filter((p) => p.time > at('failure_started')!)
    for (let i = 5; i < late.length; i++)
      expect(late[i]!.c).toBeGreaterThanOrEqual(late[i - 5]!.c - 0.4)
  })

  it('reaches the designer limit after the alarm, and the warming time constant sets when', () => {
    const slow = runAlarm({ warmingTimeConstantHours: 30 })
    const fast = runAlarm({ warmingTimeConstantHours: 5 })
    const lim = (r: typeof run) => r.events.find((e) => e.kind === 'limit_reached')!.time
    expect(lim(fast) < lim(slow)).toBe(true)
    expect(lim(run) > at('alarm_sounded')!).toBe(true)
  })

  it('writes no alarm when the alarm fails, and the limit is still reached', () => {
    const failed = runAlarm({ alarmFails: true })
    expect(failed.events.map((e) => e.kind)).toEqual(['failure_started', 'limit_reached'])
  })

  it('recovers when the door is closed and the alarm clears', () => {
    const door = runAlarm({ failure: 'door_ajar' })
    expect(door.events.some((e) => e.kind === 'restored')).toBe(true)
    expect(door.events.some((e) => e.kind === 'limit_reached')).toBe(false)
  })

  it('refuses thresholds that are out of order', () => {
    expect(() => AlarmParams.parse({ alarmThresholdC: -90 })).toThrow()
    expect(() => AlarmParams.parse({ limitC: -70 })).toThrow()
  })

  it('registers a fictional sample register with the irreplaceable share asked for', () => {
    const r = runAlarm({ sampleCount: 20, irreplaceableFraction: 0.25 })
    expect(r.samples.filter((s) => s.value === 'irreplaceable')).toHaveLength(5)
  })
})

describe('inventory discrepancy', () => {
  it('finds the number of discrepancies asked for and every one has a cause', () => {
    const r = runInventory({ seed: 2, discrepancies: 3 })
    const off = r.rows.filter((x) => x.observed !== x.expected)
    expect(off).toHaveLength(3)
    for (const x of off) expect(x.cause).not.toBe('')
    expect(r.rows.filter((x) => x.observed === x.expected).every((x) => x.cause === '')).toBe(true)
  })

  it('draws a records cause in most discrepancies, as the program reports', () => {
    const causes = Array.from(
      { length: 300 },
      (_, i) => runInventory({ seed: i + 1 }).rows.find((x) => x.cause)!.cause,
    )
    const records = causes.filter((c) => (RECORDS_CAUSES as readonly string[]).includes(c)).length
    expect(records / causes.length).toBeGreaterThan(0.8)
    expect(records).toBeLessThan(causes.length)
  })

  it('lets the designer force a cause and names no agent', () => {
    const r = runInventory({ discrepancies: 2, cause: 'unaccounted' })
    expect(r.rows.filter((x) => x.cause).every((x) => x.cause === 'unaccounted')).toBe(true)
    expect(JSON.stringify(r)).toMatch(/Registered item INV-/)
  })
})

describe('access log and backup status', () => {
  it('lists staff entries and exits inside hours and flags the anomalies asked for', () => {
    const rows = runAccessLog({
      seed: 3,
      anomalies: ['after_hours_entry', 'forced_open', 'denied'],
    })
    expect(rows.some((r) => r.event === 'forced_open' && r.afterHours)).toBe(true)
    expect(rows.some((r) => r.event === 'denied')).toBe(true)
    expect(rows.filter((r) => r.afterHours && r.event === 'entry')).toHaveLength(1)
    expect([...rows].sort((a, b) => a.time.localeCompare(b.time))).toEqual(rows)
  })

  it('shows hours since the last backup rising for the failing system only', () => {
    const systems = runBackupStatus({ seed: 1, hours: 72, failsAtHour: 20 })
    const last = (name: string) => systems.find((s) => s.zone === name)!.points.at(-1)!.hours
    expect(last('Instrument computer B')).toBeGreaterThan(48)
    expect(last('Study database')).toBeLessThan(24)
  })
})

describe('exposure follow-up', () => {
  it('lists the people in the room as close and the people nearby as not', () => {
    const list = runFollowup({ seed: 1, inRoom: 3, adjacent: 5 })
    expect(list.filter((c) => c.close)).toHaveLength(3)
    expect(list.filter((c) => !c.close)).toHaveLength(5)
    expect(new Set(list.map((c) => c.code)).size).toBe(8)
  })
})

describe('generators through the case-data framework', () => {
  const root = mkdtempSync(join(tmpdir(), 'ttx-lab-sim-'))
  const run = (id: string, params: unknown = {}) =>
    runGenerator(root, 's', id, params, { maxMbPerScenario: 500 })

  it('registers all five ids once, even after a second import', async () => {
    const { registerLabGenerators } = await import('./register-generators')
    registerLabGenerators()
    for (const id of [
      'lab-alarm-event',
      'lab-inventory-discrepancy',
      'lab-access-log',
      'lab-backup-status',
      'lab-exposure-followup',
    ])
      expect(generatorIds().filter((g) => g === id)).toHaveLength(1)
  })

  it('labels every dataset simulated and records origin simulated', async () => {
    for (const id of [
      'lab-alarm-event',
      'lab-inventory-discrepancy',
      'lab-access-log',
      'lab-backup-status',
      'lab-exposure-followup',
    ]) {
      const m = await run(id)
      for (const d of m.datasets.filter((x) => x.label))
        expect(d.label.toLowerCase(), `${id}/${d.id}`).toContain('simulated')
    }
  })

  it('writes the series the threshold metric reads and the events the timing metric reads', async () => {
    const m = await run('lab-alarm-event', { seed: 4 })
    const viability = m.datasets.find((d) => d.id === 'lab-alarm-viability')!
    const series = await readModeledSeries(caseDir(root, 's'), viability.file!)
    expect(series.map((s) => s.zone)).toEqual(['Freezer 3'])
    const crossing = series[0]!.points.find((p) => p.value >= 0)!.time
    const early = new Date(Date.parse(crossing) - 3_600_000).toISOString()
    const r = runMetric(
      {
        id: 'threshold_timing',
        config: { actionKind: 'move_samples_to_backup', threshold: 0, clearanceMin: 0 },
      },
      {
        series,
        decisions: [
          { id: 'd', time: early, kind: 'move_samples_to_backup', area: 'Freezer 3', fields: {} },
        ],
      },
    )
    expect(
      (r.data as { zones: Record<string, { status: string }> }).zones['Freezer 3']!.status,
    ).toBe('on_time')
    const events = await readGroundTruth(
      caseDir(root, 's'),
      m.datasets.find((d) => d.id === 'lab-alarm-events')!.file!,
    )
    expect(events.map((e) => e.kind)).toContain('alarm_sounded')
  })

  it('scores a laboratory follow-up with the epidemiology contact reach metric', async () => {
    registerEpidemiologyMetrics()
    const m = await run('lab-exposure-followup', { seed: 2, inRoom: 4, adjacent: 4 })
    const events = await readGroundTruth(
      caseDir(root, 's'),
      m.datasets.find((d) => d.id === 'lab-exposure-contact-events')!.file!,
    )
    expect(events).toHaveLength(8)
    expect(events.every((e) => e.kind === 'contact_listed')).toBe(true)
  })
})
