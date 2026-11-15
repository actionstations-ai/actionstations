// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ClinicalDowntimeView } from '@shared/ipc/toolkits'
import { ClinicalDowntimeCard } from './ClinicalDowntime'
import { CD } from './clinical-downtime-strings'

const view: ClinicalDowntimeView = {
  label: 'Simulated data (exercise)',
  start: '2026-11-12T02:00:00.000Z',
  recoveryAt: '2026-11-12T06:00:00.000Z',
  figures: [{ label: 'Results waiting at recovery', before: 800, now: 1200 }],
  fired: [
    {
      ruleId: 'ehr_before_lab_interface',
      label: 'EHR opened to clinicians before the lab interface',
      explanation: 'Results are missed and tests ordered again.',
      overridden: false,
    },
  ],
  units: [
    { unit: '4 West', done: 30, remaining: 10, reported: true },
    { unit: 'ICU', done: 0, remaining: 600, reported: false },
  ],
  percent: 5,
  closed: false,
  discrepancies: [
    { id: 'D1', threshold: 10, text: 'Registration reports two records.', due: true },
    { id: 'D2', threshold: 45, text: 'A result belongs to the next bed.', due: false },
  ],
}

afterEach(cleanup)

describe('ClinicalDowntimeCard', () => {
  it('shows the figures before and after, the fired rule, back-entry and the discrepancies', () => {
    render(<ClinicalDowntimeCard view={view} live={false} />)
    expect(screen.getByRole('heading', { name: CD.heading })).toBeTruthy()
    expect(screen.getByRole('row', { name: /Results waiting at recovery 800 1200/ })).toBeTruthy()
    expect(screen.getByText('EHR opened to clinicians before the lab interface')).toBeTruthy()
    expect(screen.getByText(CD.applied)).toBeTruthy()
    expect(screen.getByText(/ICU: 0 done, 600 remaining \(simulated paper count\)/)).toBeTruthy()
    expect(screen.getByText(CD.dueReadOut)).toBeTruthy()
    expect(screen.getByText(CD.notYet(45))).toBeTruthy()
  })

  it('shows what the back-entry policy enters and scans for the downtime length', () => {
    render(
      <ClinicalDowntimeCard
        view={{
          ...view,
          backEntryScope: {
            durationHours: 24,
            fullBackEntryHours: 8,
            full: false,
            always: ['Active orders, entered as coded orders'],
            enter: ['The last administration of each active medication'],
            scan: ['The rest of the paper record'],
            reconcile: ['Medications: a pharmacist verifies every active paper order'],
          },
        }}
        live={false}
      />,
    )
    expect(screen.getByText(CD.scopePartial(24, 8))).toBeTruthy()
    expect(screen.getByText(CD.scanned)).toBeTruthy()
    expect(screen.getByText('The rest of the paper record')).toBeTruthy()
    expect(screen.getByText(CD.checks)).toBeTruthy()
  })

  it('leaves the back-entry policy out for a view without one', () => {
    render(<ClinicalDowntimeCard view={view} live={false} />)
    expect(screen.queryByText(CD.alwaysEntered)).toBeNull()
  })

  it('says a due discrepancy went to the players when devices are connected', () => {
    render(<ClinicalDowntimeCard view={{ ...view, closed: true }} live />)
    expect(screen.getByText(CD.dueSent)).toBeTruthy()
    expect(screen.getByText(CD.closed)).toBeTruthy()
  })
})
