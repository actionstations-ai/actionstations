// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FacilitatorState } from '@shared/ipc'
import type { Scenario } from '@shared/schemas/scenario'
import { DeviceHotwash, HotwashCapture } from './HotWashCapture'

afterEach(cleanup)

const scenario = { objectives: [], msel: [] } as unknown as Scenario
const entry = (id: string, kind: 'strength' | 'improvement' | 'other', text: string) => ({
  id,
  kind,
  text,
  at: '2026-10-29T15:00:00.000Z',
})

const state = (hotwash: ReturnType<typeof entry>[]) =>
  ({
    hotwash,
    notes: {},
    generalNotes: '',
    decisions: [],
    delivered: {},
    elapsedMin: 0,
  }) as unknown as FacilitatorState

const props = (hotwash: ReturnType<typeof entry>[]) => ({
  scenario,
  state: state(hotwash),
  update: vi.fn(),
  exerciseTime: '1:20',
})

describe('hot wash items from devices', () => {
  it('lists promoted device items under From devices, apart from the facilitator list', () => {
    const p = props([
      entry('hw-own1', 'strength', 'Facilitator note'),
      entry('dev-abc', 'improvement', 'Two incident numbers (3 contributions)'),
    ])
    render(
      <>
        <HotwashCapture {...p} />
        <DeviceHotwash {...p} />
      </>,
    )
    const devices = screen.getByRole('region', { name: 'From devices: To improve' })
    expect(within(devices).getByDisplayValue(/Two incident numbers/)).toBeTruthy()
    const own = screen.getByRole('region', { name: 'Went well' })
    expect(within(own).getByDisplayValue('Facilitator note')).toBeTruthy()
    expect(screen.queryAllByDisplayValue(/Two incident numbers/)).toHaveLength(1)
  })

  it('points at the board when nothing is promoted yet', () => {
    render(<DeviceHotwash {...props([])} />)
    expect(screen.getByText(/Nothing promoted from devices yet/)).toBeTruthy()
  })
})
