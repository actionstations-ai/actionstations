// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { FacilitatorState } from '@shared/ipc'
import { parseLocal } from '@shared/compliance/scenario-time'
import { Regulation, sessionOf } from '@shared/schemas/compliance'
import { MselRow } from '@shared/schemas/scenario'
import circiaRaw from '../../../../../packs/regulations/circia.json'
import secRaw from '../../../../../packs/regulations/sec_8k_105.json'
import { fireRowTriggers, fireTrigger, parseScenarioInput, unfireRow } from './compliance'
import { RegulatoryClocks } from './RegulatoryClocks'

const circia = Regulation.parse(circiaRaw)
const sec = Regulation.parse(secRaw)
const start = { at: parseLocal('2026-03-12T09:00'), source: 'brief' as const }
const base: FacilitatorState = {
  elapsedMin: 0,
  delivered: {},
  notes: {},
  generalNotes: '',
  hotwash: [],
  decisions: [],
}

/** Render the strip around a state that updates like the real store. */
function setup(initial: FacilitatorState, minutes: number) {
  let state = initial
  const view = (m: number) => (
    <RegulatoryClocks
      regulations={[circia, sec]}
      state={state}
      update={(fn) => {
        state = fn(state)
        utils.rerender(view(m))
      }}
      minutes={m}
      start={start}
    />
  )
  const utils = render(view(minutes))
  return { state: () => state, at: (m: number) => utils.rerender(view(m)) }
}

const fired = fireTrigger(
  base,
  {
    regulationId: 'circia',
    triggerId: 'covered_incident',
    exerciseMin: 12,
    by: 'row',
    rowId: 'I-03',
  },
  start.at,
)

afterEach(() => cleanup())

describe('RegulatoryClocks', () => {
  it('says no clock runs until a trigger fires, and lists the regulations not started', () => {
    setup(base, 0)
    expect(screen.getByText(/No clock running/)).toBeTruthy()
    expect(
      screen.getByText(/Not started: CIRCIA \(proposed\), SEC Form 8-K Item 1.05/),
    ).toBeTruthy()
    expect(screen.getByText(/not legal advice/)).toBeTruthy()
  })

  it('shows a running clock with its deadline, time left and status in words', () => {
    setup(fired, 60)
    const clock = screen.getByTestId('clock-circia:incident_report')
    expect(clock.textContent).toContain('CIRCIA (proposed)')
    expect(clock.textContent).toContain('→ CISA')
    expect(clock.textContent).toContain('Running')
    expect(clock.textContent).toContain('Due Sun 15 Mar 09:12 · 71 h 12 m left')
    const ransom = screen.getByTestId('clock-circia:ransom_report')
    expect(ransom.textContent).toContain('waiting for "Ransom payment made"')
  })

  it('announces status changes politely, not the countdown', () => {
    const ui = setup(fired, 60)
    const live = screen.getByRole('status')
    expect(live.getAttribute('aria-live')).toBe('polite')
    ui.at(61)
    expect(live.textContent).toBe('')
    ui.at(60 * 56)
    expect(live.textContent).toBe('CIRCIA (proposed), Covered cyber incident report: due soon')
    ui.at(60 * 80)
    expect(live.textContent).toBe('CIRCIA (proposed), Covered cyber incident report: overdue')
  })

  it('records a filing from the keyboard', async () => {
    const user = userEvent.setup()
    const ui = setup(fired, 120)
    const clock = screen.getByTestId('clock-circia:incident_report')
    await user.click(within(clock).getByRole('button', { name: 'Filed…' }))
    const input = within(clock).getByLabelText('Filed at (scenario time)')
    expect(document.activeElement).toBe(input)
    await user.keyboard('10:30{Enter}')
    expect(sessionOf(ui.state()).clocks['circia:incident_report']).toMatchObject({
      status: 'met',
      exerciseMin: 90,
      scenarioAt: '2026-03-12T10:30',
    })
    expect(screen.getByTestId('clock-circia:incident_report').textContent).toContain('Met')
  })

  it('needs a reason to waive a clock', async () => {
    const user = userEvent.setup()
    const ui = setup(fired, 120)
    const clock = screen.getByTestId('clock-circia:incident_report')
    await user.click(within(clock).getByRole('button', { name: 'Waive…' }))
    await user.click(within(clock).getByRole('button', { name: 'Waive' }))
    expect(within(clock).getByRole('alert').textContent).toBe('Say why the clock is waived')
    await user.type(within(clock).getByLabelText('Reason'), 'Not a covered entity{Enter}')
    expect(sessionOf(ui.state()).clocks['circia:incident_report']).toMatchObject({
      status: 'waived',
      note: 'Not a covered entity',
    })
  })

  it('fires a trigger by hand at a typed scenario time', async () => {
    const user = userEvent.setup()
    const ui = setup(base, 100)
    await user.selectOptions(screen.getByLabelText('Trigger'), 'sec_8k_105:materiality_determined')
    await user.type(screen.getByLabelText(/At \(scenario time/), '10:40')
    await user.click(screen.getByRole('button', { name: 'Fire trigger' }))
    expect(sessionOf(ui.state()).fired).toEqual([
      expect.objectContaining({
        regulationId: 'sec_8k_105',
        triggerId: 'materiality_determined',
        exerciseMin: 100,
        scenarioAt: '2026-03-12T10:40',
        by: 'manual',
      }),
    ])
    expect(screen.getByTestId('clock-sec_8k_105:form_8k').textContent).toContain(
      'Due Wed 18 Mar 10:40',
    )
  })

  it('toggles a clock onto the presentation screen', async () => {
    const user = userEvent.setup()
    const ui = setup(fired, 60)
    await user.click(
      screen.getByRole('checkbox', {
        name: /^Show on screen\s*: CIRCIA \(proposed\) Covered cyber incident report$/,
      }),
    )
    expect(sessionOf(ui.state()).onScreen).toEqual(['circia:incident_report'])
  })
})

describe('row delivery', () => {
  const row = MselRow.parse({
    id: 'I-07',
    phaseId: 'P1',
    time: '1:00',
    from: 'SimCell',
    event: 'Ransomware confirmed',
    expectedAction: '',
    purposeTag: 'CORE_NARRATIVE',
    triggers: [
      { regulationId: 'circia', triggerId: 'covered_incident' },
      { regulationId: 'gdpr_art33', triggerId: 'aware' },
    ],
  })

  it('fires only the triggers of enabled regulations, once per row, and undo takes them back', () => {
    const on = new Set(['circia'])
    const first = fireRowTriggers(base, row, on, 60, start.at)
    expect(first.fired).toEqual([{ regulationId: 'circia', triggerId: 'covered_incident' }])
    expect(fireRowTriggers(first.state, row, on, 70, start.at).fired).toEqual([])
    expect(sessionOf(unfireRow(first.state, 'I-07')).fired).toEqual([])
  })

  it('parses typed scenario times', () => {
    const now = parseLocal('2026-03-12T11:00')
    expect(parseScenarioInput('9:05', now)?.toISOString()).toBe('2026-03-12T09:05:00.000Z')
    expect(parseScenarioInput('2026-03-13 08:00', now)?.toISOString()).toBe(
      '2026-03-13T08:00:00.000Z',
    )
    expect(parseScenarioInput('later', now)).toBeUndefined()
  })
})
