// Notification clocks met (#1137): each clock of the configured regulation scored from what the
// facilitator recorded in Facilitate, and the HIPAA breach clocks read end to end from a
// facilitator state through the clock maths the Facilitate strip uses.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Regulation } from '@shared/schemas/compliance'
import { FacilitatorState } from '@shared/ipc/facilitator'
import { regulationClocks } from '../../compliance/clock-measure'
import { computeNotificationClocks, type ClockRecord } from './notification-clocks'
import { runMetric } from './registry'

const HIPAA = Regulation.parse(
  JSON.parse(readFileSync(resolve('packs/regulations/hipaa_breach.json'), 'utf8')),
)
const START = new Date('2026-03-02T08:00:00Z')

const clock = (id: string, status: ClockRecord['status'], extra: Partial<ClockRecord> = {}) => ({
  id,
  label: id,
  recipient: id,
  status,
  waitingFor: [],
  ...extra,
})

describe('notification clocks met', () => {
  it('counts each clock by its outcome', () => {
    const out = computeNotificationClocks(
      [
        {
          regulationId: 'hipaa_breach',
          label: 'HIPAA',
          citation: '45 CFR 164.404',
          clocks: [
            clock('individuals', 'met'),
            clock('hhs', 'overdue'),
            clock('media', 'running'),
            clock('state', 'waived'),
            clock('other', 'missed'),
          ],
        },
      ],
      { regulation: 'hipaa_breach' },
    )
    expect(out.data).toMatchObject({ met: 1, missed: 2, open: 1, waived: 1, notStarted: 0 })
    expect(out.summary.find((s) => s.label.startsWith('Share met'))?.value).toBe('0.333')
    expect(out.caveats.some((c) => c.includes('ran past the end of the exercise'))).toBe(true)
  })

  it('says which trigger was never fired when no clock started', () => {
    const out = computeNotificationClocks(
      [
        {
          regulationId: 'hipaa_breach',
          label: 'HIPAA',
          citation: '45 CFR 164.404',
          clocks: [clock('individuals', 'waiting', { waitingFor: ['Breach discovered'] })],
        },
      ],
      { regulation: 'hipaa_breach' },
    )
    expect(out.data).toMatchObject({ notStarted: 1 })
    expect(out.caveats[0]).toContain('Breach discovered')
  })

  it('is skipped with a reason when the regulation is not available', () => {
    expect(() =>
      runMetric({ id: 'notification_clocks_met', config: { regulation: 'nope' } }, { clocks: [] }),
    ).toThrow(/not available/)
  })

  it('reads the HIPAA breach clocks from the facilitator record', () => {
    // The breach is discovered 30 minutes in. The notice to individuals is filed at 2:00 and the
    // media clock waived; HHS is still running when the exercise stops at 3:00.
    const state = FacilitatorState.parse({
      elapsedMin: 180,
      compliance: {
        fired: [
          {
            id: 'f1',
            regulationId: 'hipaa_breach',
            triggerId: 'breach_discovered',
            exerciseMin: 30,
            scenarioAt: '2026-03-02T08:30',
            by: 'manual',
          },
        ],
        clocks: {
          'hipaa_breach:individuals': { status: 'met', exerciseMin: 120, note: 'Letters mailed' },
          'hipaa_breach:media': { status: 'waived', note: 'Fewer than 500 residents' },
        },
      },
    })
    const regs = regulationClocks(HIPAA, state, START)
    const byId = Object.fromEntries(regs.clocks.map((c) => [c.id, c]))
    expect(byId.individuals).toMatchObject({
      status: 'met',
      startedAt: '2026-03-02T08:30',
      dueAt: '2026-05-01T08:30',
      closedAt: '2026-03-02T10:00',
      note: 'Letters mailed',
    })
    expect(byId.hhs).toMatchObject({ status: 'running', dueAt: '2026-05-01T08:30' })
    expect(byId.media).toMatchObject({ status: 'waived' })
    const out = runMetric(
      { id: 'notification_clocks_met', config: { regulation: 'hipaa_breach' } },
      { clocks: [regs] },
    )
    expect(out.data).toMatchObject({ met: 1, missed: 0, open: 1, waived: 1, notStarted: 0 })
  })

  it('shows every clock waiting for its trigger before the breach is discovered', () => {
    const regs = regulationClocks(HIPAA, FacilitatorState.parse({ elapsedMin: 60 }), START)
    expect(regs.clocks.map((c) => [c.status, c.waitingFor])).toEqual([
      ['waiting', ['Breach discovered']],
      ['waiting', ['Breach discovered']],
      ['waiting', ['Breach discovered']],
    ])
  })
})
