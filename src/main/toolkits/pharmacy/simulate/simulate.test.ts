// The pharmacy simulation models (spec 0463 FR-8, #904, #905): days on hand is on hand over usage,
// an allocation moves the stockout, the cold chain curve crosses the range where the physics of
// the model says it does, the divergent user stands out and the generators write labeled,
// deterministic, valid datasets that the metrics can read as ground truth.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SeriesFile, TextFile } from '@shared/schemas/case-data'
import { generatorIds } from '../../../case-data/generators'
import { readGroundTruth } from '../../../evaluation/metrics/inputs'
import { runColdChain, ColdChainParams } from './coldchain'
import { DiversionParams, runDiversion } from './diversion'
import { PHARMACY_GENERATORS } from './generators'
import { QueueParams, runQueue } from './queue'
import { ShortageParams, runShortage } from './shortage'

const shortage = (over: object = {}) => ShortageParams.parse(over)

describe('shortage model', () => {
  it('runs out on day on-hand over usage and says days on hand each day', () => {
    const run = runShortage(shortage())
    expect(run.stockoutDay).toBe(4)
    expect(run.days[0]).toMatchObject({ stock: 1840, daysOnHand: 4, projectedStockoutDay: 4 })
    expect(run.days[2]).toMatchObject({ stock: 920, daysOnHand: 2 })
    expect(run.days[5]).toMatchObject({ stock: 0, served: 0, unmet: 460 })
  })

  it('moves the stockout later when the allocation lowers what is served', () => {
    expect(
      runShortage(shortage({ allocationChanges: [{ day: 0, percent: 50 }] })).stockoutDay,
    ).toBe(8)
    const late = runShortage(shortage({ allocationChanges: [{ day: 2, percent: 50 }] }))
    expect(late.stockoutDay).toBe(6)
    expect(late.days[2]!.projectedStockoutDay).toBe(6)
    expect(late.days[0]!.projectedStockoutDay).toBe(4)
  })

  it('counts unmet doses: restricting early raises them while stock lasts, and a delivery lowers the rest', () => {
    const none = runShortage(shortage({ horizonDays: 10 }))
    const half = runShortage(
      shortage({ horizonDays: 10, allocationChanges: [{ day: 0, percent: 50 }] }),
    )
    expect(none.totalServed).toBe(1840)
    expect(half.totalServed).toBe(1840)
    const resupplied = runShortage(
      shortage({ horizonDays: 10, deliveries: [{ day: 5, quantity: 2300 }] }),
    )
    expect(resupplied.totalUnmet).toBeLessThan(none.totalUnmet)
  })
})

describe('queue model', () => {
  const base = QueueParams.parse({
    arrivalsPerHour: 24,
    staff: 1,
    serviceMinutes: 4,
    targetMinutes: 20,
  })

  it('is the same morning for the same seed and a different one for another', () => {
    expect(runQueue(base)).toEqual(runQueue(base))
    expect(runQueue({ ...base, seed: 99 }).points).not.toEqual(runQueue(base).points)
  })

  it('grows an old queue under a surge and shrinks it when staff are added', () => {
    const surge = QueueParams.parse({
      ...base,
      surges: [{ fromMinute: 30, toMinute: 120, arrivalsPerHour: 40 }],
    })
    const slow = runQueue(surge)
    const helped = runQueue({ ...surge, staffChanges: [{ atMinute: 60, staff: 3 }] })
    expect(slow.firstOverTarget).toBeDefined()
    expect(slow.peak.oldestMinutes).toBeGreaterThan(helped.peak.oldestMinutes)
    expect(helped.points.at(-1)!.count).toBeLessThan(slow.points.at(-1)!.count)
  })

  it('stays within target with enough staff', () => {
    expect(runQueue({ ...base, staff: 4 }).firstOverTarget).toBeUndefined()
  })
})

describe('cold chain model', () => {
  const run = runColdChain(ColdChainParams.parse({}))

  it('holds the setpoint, then leaves the range about an hour after the failure', () => {
    expect(run.probe.filter((x) => x.minute < 240).every((x) => x.tempC >= 2 && x.tempC <= 8)).toBe(
      true,
    )
    // 21 - 16.8 * exp(-t / 240) reaches 8 C at t = 240 * ln(16.8 / 13), about 61 minutes.
    expect(run.firstOutOfRange).toBeGreaterThanOrEqual(290)
    expect(run.firstOutOfRange).toBeLessThanOrEqual(320)
  })

  it('reads viability from the fictional table: the narrow product is lost, the tolerant one is kept', () => {
    const by = Object.fromEntries(run.viability.map((v) => [v.lot, v]))
    expect(by['EX-B-1187']!.usable).toBe(false)
    expect(by['EX-A-4410']!.usable).toBe(true)
    expect(by['EX-C-9021']!.usable).toBe(false)
    expect(by['EX-A-4410']!.minutesAboveMax).toBeGreaterThan(60)
  })

  it('recovers when cooling is restored and then loses nothing the table allows', () => {
    const restored = runColdChain(ColdChainParams.parse({ restoreMinute: 330 }))
    expect(restored.maxC).toBeLessThan(run.maxC)
    expect(restored.probe.at(-1)!.tempC).toBeLessThan(8)
    expect(restored.viability.find((v) => v.lot === 'EX-A-4410')!.usable).toBe(true)
  })

  it('reports minutes outside the range that match the series', () => {
    expect(run.minutesOutside).toBeGreaterThan(100)
    expect(run.maxC).toBeGreaterThan(12)
  })
})

describe('diversion model', () => {
  const p = DiversionParams.parse({})
  const run = runDiversion(p)

  it('makes the divergent user stand out at about the stated multiple, bunched in the small hours', () => {
    const user = run.users[0]!
    expect(user.divergent).toBe(true)
    expect(user.total / run.peerMedianTotal).toBeGreaterThan(2)
    expect(user.total / run.peerMedianTotal).toBeLessThan(2.8)
    const night = user.byHour.slice(1, 6).reduce((a, b) => a + b, 0)
    expect(night / user.total).toBeGreaterThan(0.5)
    for (const peer of run.users.slice(1)) expect(peer.total).toBeLessThan(user.total)
  })

  it('splits the excess into what the float assignment explains and what nothing explains', () => {
    const excess = run.users[0]!.total - run.peerMedianTotal
    expect(run.explainedByFloat + run.unexplained).toBe(excess)
    expect(run.explainedByFloat).toBeGreaterThan(0)
    expect(run.unexplained).toBeGreaterThan(0)
  })

  it('is deterministic for a seed', () => {
    expect(runDiversion(p)).toEqual(run)
    expect(runDiversion({ ...p, seed: 5 }).users[0]!.byHour).not.toEqual(run.users[0]!.byHour)
  })
})

describe('pharmacy generators', () => {
  it('registers four generators through the shared module', async () => {
    await import('../register-generators')
    expect(generatorIds()).toEqual(
      expect.arrayContaining([
        'pharmacy-shortage',
        'pharmacy-queue',
        'pharmacy-cold-chain',
        'pharmacy-diversion',
      ]),
    )
  })

  it.each(PHARMACY_GENERATORS.map((g) => [g.id, g] as const))(
    '%s is deterministic and writes valid, labeled datasets',
    (_id, g) => {
      const a = g.generate(g.params.parse({}) as never)
      const b = g.generate(g.params.parse({}) as never)
      expect(a).toEqual(b)
      expect(a.length).toBeGreaterThanOrEqual(2)
      for (const d of a) {
        expect(d.label.toLowerCase(), d.id).toMatch(/simulated/)
        const parsed =
          d.kind === 'series' ? SeriesFile.safeParse(d.data) : TextFile.safeParse(d.data)
        expect(parsed.success, `${d.id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true)
      }
    },
  )

  it('writes events that the ground-truth reader accepts, with the model parameters inside', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pharmacy-gt-'))
    const g = PHARMACY_GENERATORS.find((x) => x.id === 'pharmacy-shortage')!
    const data = g
      .generate(g.params.parse({}) as never)
      .find((d) => d.id === 'pharmacy-shortage-events')!
    writeFileSync(join(dir, 'events.json'), JSON.stringify(data.data))
    const events = await readGroundTruth(dir, 'events.json')
    expect(events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['shortage_model', 'shortage_day', 'stockout']),
    )
    const model = events.find((e) => e.kind === 'shortage_model')!
    expect(ShortageParams.parse((model.attrs as { params: unknown }).params).onHand).toBe(1840)
    expect(events.find((e) => e.kind === 'stockout')!.attrs.day).toBe(4)
  })

  it('writes the cold chain viability table as fictional exercise content', () => {
    const g = PHARMACY_GENERATORS.find((x) => x.id === 'pharmacy-cold-chain')!
    const table = g
      .generate(g.params.parse({}) as never)
      .find((d) => d.id === 'pharmacy-cold-viability')!
    const text = JSON.stringify(table.data)
    expect(text).toContain('EXERCISE ONLY. Fictional product and lot.')
    expect(text).toContain('2 to 8 °C (36 to 46 °F)')
  })

  it('labels diversion data as fictional and presumed innocent', () => {
    const g = PHARMACY_GENERATORS.find((x) => x.id === 'pharmacy-diversion')!
    const data = g
      .generate(g.params.parse({}) as never)
      .find((d) => d.id === 'pharmacy-usage-by-user')!
    expect(JSON.stringify(data.data)).toContain('Fictional user code; presumed innocent.')
  })
})
