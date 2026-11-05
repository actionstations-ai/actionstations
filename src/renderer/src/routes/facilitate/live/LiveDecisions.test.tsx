// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WARNING_FORM } from '@shared/decisions/fixtures'
import type { FacilitatorState } from '@shared/ipc/facilitator'
import type { DecisionRecord } from '@shared/schemas/decisions'
import type { Scenario } from '@shared/schemas/scenario'
import { queryClient } from '../../../lib/query'
import { mockTtx, PROJECT } from '../../documents/test-utils'
import { LiveDecisionsSection } from './LiveDecisions'

const scenario = {
  id: 'scn-1',
  roles: [
    { id: 'pio', name: 'PIO', team: 'Communications' },
    { id: 'ops', name: 'Operations', team: 'Operations' },
  ],
} as unknown as Scenario

const record = (over: Partial<DecisionRecord> = {}): DecisionRecord => ({
  id: 'dec-1',
  time: '2026-11-04T10:30:00.000Z',
  exerciseTime: '0:45',
  kind: 'warning',
  formId: 'issue-warning',
  title: 'Issue a warning',
  area: { id: 'harbor', name: 'Harbor' },
  fields: { level: 'warning' },
  seat: { kind: 'player', roleId: 'pio', label: 'PIO' },
  source: 'device',
  ...over,
})

function mount(opts: {
  forms?: unknown[]
  live?: DecisionRecord[]
  running?: boolean
  saved?: DecisionRecord[]
  handlers?: Record<string, (r: never) => unknown>
}) {
  const ttx = mockTtx({
    'live:session-status': () =>
      opts.running
        ? { session: { id: 'x', startedAt: '2026-11-04T10:00:00.000Z' }, connected: 1 }
        : { connected: 0 },
    'live:decision-forms': () => opts.forms ?? [WARNING_FORM],
    'live:decisions': () => opts.live ?? [],
    ...opts.handlers,
  } as never)
  queryClient.clear()
  const update = vi.fn()
  const state = { decisionRecords: opts.saved } as unknown as FacilitatorState
  render(
    <QueryClientProvider client={queryClient}>
      <LiveDecisionsSection
        projectPath={PROJECT}
        scenario={scenario}
        state={state}
        update={update}
      />
    </QueryClientProvider>,
  )
  return { ttx, update }
}

afterEach(() => cleanup())

describe('LiveDecisionsSection', () => {
  it('is not shown when the scenario has no forms and nothing was recorded', async () => {
    const { ttx } = mount({ forms: [] })
    await waitFor(() => expect(ttx.calls('live:decision-forms')).toHaveLength(1))
    expect(screen.queryByRole('heading', { name: 'Decisions' })).toBeNull()
  })

  it('lists decisions from devices with their time, role and where they came from', async () => {
    mount({ running: true, live: [record()] })
    const row = (await screen.findByText('From a device')).closest('li')!
    expect(row.textContent).toContain('Issue a warning')
    expect(row.textContent).toContain('Warning · Harbor')
    expect(row.textContent).toContain('at 0:45')
    expect(row.textContent).toContain('PIO')
  })

  it('records a decision with no devices and keeps it in the facilitator file', async () => {
    const made = record({
      id: 'dec-9',
      source: 'facilitator',
      seat: { kind: 'facilitator', roleId: 'ops', label: 'Operations' },
    })
    const { ttx, update } = mount({ handlers: { 'live:decision-record': () => made } })
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText(/^Level/), 'warning')
    await user.selectOptions(screen.getByLabelText(/^Area/), 'harbor')
    await user.type(screen.getByLabelText(/Effective at/), '1:30')
    await user.selectOptions(screen.getByLabelText(/Made by/), 'ops')
    await user.click(screen.getByRole('button', { name: 'Record decision' }))
    await waitFor(() => expect(ttx.calls('live:decision-record')).toHaveLength(1))
    expect(ttx.calls('live:decision-record')[0]).toMatchObject({
      formId: 'issue-warning',
      fields: { level: 'warning', effective: '1:30' },
      area: { areaId: 'harbor' },
      roleId: 'ops',
    })
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const next = (update.mock.calls[0]![0] as (s: FacilitatorState) => FacilitatorState)({
      decisionRecords: [],
    } as unknown as FacilitatorState)
    expect(next.decisionRecords).toEqual([made])
  })

  it('shows what is missing and sends nothing', async () => {
    const { ttx } = mount({})
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Record decision' }))
    expect(screen.getAllByRole('alert')[0]!.textContent).toBe('2 answers need a look.')
    expect(screen.getByText('Level is required')).toBeTruthy()
    expect(screen.getByText('Area is required')).toBeTruthy()
    expect(ttx.calls('live:decision-record')).toHaveLength(0)
  })

  it('does not list a decision twice when the log and the file both hold it', async () => {
    mount({ running: true, live: [record()], saved: [record()] })
    await screen.findByText('From a device')
    expect(screen.getAllByText('Issue a warning').length).toBe(1)
  })

  it('has no axe violations', async () => {
    mount({ running: true, live: [record()] })
    await screen.findByText('From a device')
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
  })
})
