// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import type { CoverageView, LiveSessionStatus } from '@shared/schemas/live'
import { queryClient } from '../../../lib/query'
import { mockTtx, PROJECT } from '../../documents/test-utils'
import { LiveEvaluators } from './LiveEvaluators'
import { LiveObservations } from './LiveObservations'

afterEach(cleanup)

const RUNNING = {
  session: { id: 'c2Vzc2lvbi1pZC0wMDAwMDA', scenarioId: 'scn-1' },
  connected: 2,
} as unknown as LiveSessionStatus

const VIEW: CoverageView = {
  showExpected: true,
  evaluators: [
    {
      clientRef: 'aaaaaaaa',
      label: 'Evaluator 1',
      online: true,
      watch: { roleIds: [], capabilities: [] },
      observations: 2,
    },
    {
      clientRef: 'bbbbbbbb',
      label: 'Evaluator 2',
      online: true,
      watch: { roleIds: ['pio'], capabilities: [] },
      observations: 0,
    },
  ],
  tasks: [
    { id: 'T-01', capability: 'operational_communications', text: 'Notify the airlines' },
    { id: 'T-02', capability: 'cybersecurity', text: 'Isolate the VLAN' },
    { id: 'I-03_expected', capability: 'expected-actions', text: 'Open the checklist' },
  ],
  cells: [
    { taskId: 'T-01', clientRef: 'aaaaaaaa', rating: 'met' },
    { taskId: 'T-02', clientRef: 'aaaaaaaa', rating: 'partial' },
  ],
  latest: [
    {
      observationId: 'live-aaaaaaaa-x',
      clientRef: 'aaaaaaaa',
      label: 'Evaluator 1',
      taskId: 'T-02',
      rating: 'partial',
      note: 'Left BHS on the same segment',
      exerciseTime: '1:12',
      at: 2,
    },
    {
      observationId: 'live-aaaaaaaa-y',
      clientRef: 'aaaaaaaa',
      label: 'Evaluator 1',
      taskId: 'T-01',
      rating: 'met',
      note: 'Airlines told at 1:09',
      exerciseTime: '1:09',
      at: 1,
    },
  ],
  covered: 2,
  observations: 2,
}

function mount(ui: React.ReactNode, status: LiveSessionStatus = RUNNING) {
  queryClient.clear()
  const ttx = mockTtx({
    'live:session-status': () => status,
    'live:eval-coverage': () => VIEW,
    'evaluation:get': () => ({
      formatVersion: 1,
      updatedAt: '2026-10-28T10:00:00.000Z',
      observations: [
        {
          id: 'f1',
          at: '2026-10-28T10:00:00.000Z',
          rating: 'not_met',
          note: '',
          taskId: 'T-03',
          source: 'facilitate',
        },
      ],
    }),
    'live:eval-ask': () => undefined,
    'live:eval-watch': () => undefined,
    'live:eval-show-expected': () => undefined,
  })
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
  return ttx
}

describe('LiveObservations', () => {
  it('renders nothing while no session runs', async () => {
    const ttx = mount(<LiveObservations projectPath={PROJECT} scenarioId="scn-1" />, {
      connected: 0,
    })
    await waitFor(() => expect(ttx.calls('live:session-status').length).toBeGreaterThan(0))
    expect(screen.queryByRole('heading', { name: 'Live observations' })).toBeNull()
  })

  it('shows coverage, a matrix with words and icons, and the latest observations', async () => {
    mount(<LiveObservations projectPath={PROJECT} scenarioId="scn-1" />)
    expect(await screen.findByRole('heading', { name: 'Live observations' })).toBeTruthy()
    const status = (await screen.findAllByRole('status'))[0]!
    expect(status.textContent?.replace(/\s+/g, ' ')).toBe(
      'Coverage 2 of 3 tasks · 2 of 2 evaluators connected · 2 observations',
    )
    const table = screen.getByRole('table')
    const row = within(table).getByRole('row', { name: /T-01/ })
    expect(within(row).getByText('Met')).toBeTruthy()
    expect(within(row).getByLabelText('No rating yet')).toBeTruthy()
    expect(screen.getByText(/Left BHS on the same segment/)).toBeTruthy()
  })

  it('filters the latest observations by evaluator and by capability', async () => {
    mount(<LiveObservations projectPath={PROJECT} scenarioId="scn-1" />)
    await screen.findByText(/Left BHS/)
    fireEvent.change(screen.getAllByLabelText('Capability')[0]!, {
      target: { value: 'cybersecurity' },
    })
    expect(screen.queryByText(/Airlines told at 1:09/)).toBeNull()
    expect(screen.getByText(/Left BHS/)).toBeTruthy()
    fireEvent.change(screen.getAllByLabelText('Evaluator').at(-1)!, {
      target: { value: 'bbbbbbbb' },
    })
    expect(screen.getByText('No observations match.')).toBeTruthy()
  })

  it('asks one evaluator to watch for a task nobody rated', async () => {
    const ttx = mount(<LiveObservations projectPath={PROJECT} scenarioId="scn-1" />)
    await screen.findByText(/Coverage/)
    fireEvent.change(screen.getAllByLabelText('Evaluator')[0]!, { target: { value: 'bbbbbbbb' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask to watch' }))
    await waitFor(() => expect(ttx.calls('live:eval-ask')).toHaveLength(1))
    expect(ttx.calls('live:eval-ask')[0]).toMatchObject({
      clientRef: 'bbbbbbbb',
      text: 'Please watch for I-03_expected (Open the checklist) at the next inject.',
    })
  })

  it('lists recorded observations with their source', async () => {
    mount(<LiveObservations projectPath={PROJECT} scenarioId="scn-1" />)
    expect(await screen.findByText('Facilitator')).toBeTruthy()
  })
})

describe('LiveEvaluators', () => {
  const roles = [
    { id: 'pio', name: 'Public Information Officer' },
    { id: 'it', name: 'IT Director' },
  ]

  it('saves a watch list for one evaluator', async () => {
    const ttx = mount(<LiveEvaluators projectPath={PROJECT} scenarioId="scn-1" roles={roles} />)
    const summary = await screen.findByText(/Evaluator 1 · connected · watching everything/)
    fireEvent.click(summary)
    const details = summary.closest('details')!
    fireEvent.click(within(details).getByLabelText('IT Director'))
    fireEvent.click(within(details).getByLabelText('Cybersecurity'))
    fireEvent.click(within(details).getByRole('button', { name: 'Save watch list' }))
    await waitFor(() => expect(ttx.calls('live:eval-watch')).toHaveLength(1))
    expect(ttx.calls('live:eval-watch')[0]).toMatchObject({
      clientRef: 'aaaaaaaa',
      watch: { roleIds: ['it'], capabilities: ['cybersecurity'] },
    })
  })

  it('turns expected actions for evaluators off', async () => {
    const ttx = mount(<LiveEvaluators projectPath={PROJECT} scenarioId="scn-1" roles={roles} />)
    const box = await screen.findByLabelText(/Show expected actions to evaluators/)
    expect((box as HTMLInputElement).checked).toBe(true)
    fireEvent.click(box)
    await waitFor(() => expect(ttx.calls('live:eval-show-expected')).toHaveLength(1))
    expect(ttx.calls('live:eval-show-expected')[0]).toMatchObject({ on: false })
  })
})
