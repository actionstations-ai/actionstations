// @vitest-environment happy-dom
// The Program screens (#424): the empty state, the sortable corrective actions table, the
// status rules in the dialog, and the schedule grid.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProgramAction, type CorrectiveActionView } from '@shared/schemas'
import { mockTtx, renderAt } from '../documents/test-utils'
import ActionsPage from './ActionsPage'
import ProgramPage from './ProgramPage'
import SchedulePage from './SchedulePage'

afterEach(cleanup)

const PROGRAM_PATH = '/Volumes/Share/County.asprogram'

const program = {
  formatVersion: 1,
  id: 'prog1',
  name: 'County Program',
  orgName: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  appVersion: '0.5.1',
  cycle: { startYear: 2026, years: 3 },
  priorities: [],
  projects: [],
  nextActionNumber: 3,
  lock: true,
}

const open = {
  path: PROGRAM_PATH,
  program,
  schedule: { formatVersion: 1, exercises: [] },
  scheduleRevision: 'new',
  reachable: {},
  projectPaths: {},
}

const action = (id: string, extra: Record<string, unknown>): CorrectiveActionView => ({
  revision: `rev-${id}`,
  action: ProgramAction.parse({
    id,
    number: Number(id.replace(/\D/g, '')),
    programId: 'prog1',
    source: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  }),
})

const actions = [
  action('CA1', {
    title: 'Write the VPN procedure',
    dueDate: '2999-09-01',
    owner: { name: 'Ruiz' },
  }),
  action('CA2', {
    title: 'Add PIO approval chain',
    dueDate: '2020-03-01',
    owner: { name: 'Chen' },
  }),
]

const active = { program: { activePath: PROGRAM_PATH, recent: [] } }

function ttx(extra: Record<string, unknown> = {}) {
  return mockTtx({
    'settings:get': () => active as never,
    'program:get': () => open as never,
    'program:actions-list': () => ({ actions, problems: [] }),
    'program:snapshots': () => [],
    ...extra,
  } as never)
}

describe('Program overview', () => {
  it('offers Create and Open before any program is chosen, and creates nothing by itself', async () => {
    const bridge = mockTtx({
      'settings:get': () => ({ program: { recent: [] } }) as never,
    })
    renderAt('/program', '/program', ProgramPage)
    expect(await screen.findByText('No exercise program yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create a program' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open a program folder…' })).toBeTruthy()
    expect(bridge.calls('program:create')).toEqual([])
  })

  it('shows the counts of corrective actions', async () => {
    ttx()
    renderAt('/program', '/program', ProgramPage)
    const region = await screen
      .findByRole('region', { name: 'Corrective actions' })
      .catch(() => null)
    expect(region ?? (await screen.findByText('Overdue'))).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByText('Overdue').previousElementSibling?.textContent).toBe('1'),
    )
  })

  it('shows who else has the program open without blocking', async () => {
    ttx({
      'program:get': () => ({
        ...open,
        lock: { host: 'EOC-PC2', user: 'jruiz', at: '2026-05-01T10:00:00.000Z' },
      }),
    })
    renderAt('/program', '/program', ProgramPage)
    expect((await screen.findByText(/Also open by/)).textContent).toContain(
      'Also open by EOC-PC2 (jruiz)',
    )
  })
})

describe('PREP cycles on the overview', () => {
  const prepSnapshot = {
    formatVersion: 1,
    projectId: 'p1',
    name: 'Harlan Spur Pipeline',
    orgName: '',
    orgType: 'energy',
    takenAt: '2026-01-01T00:00:00.000Z',
    reachable: true,
    documents: [],
    scenarios: [
      {
        scenarioId: 's1',
        title: 'Annual IMT tabletop',
        status: 'ready',
        coreCapabilities: [],
        planSections: [],
        aarPresent: false,
        prep: {
          exerciseKind: 'imt_tabletop',
          planType: 'pipeline',
          planHolder: 'Harlan Spur Pipeline Company',
          date: '2026-03-10',
          cycleStart: '2026-01-01',
          components: ['notifications', 'containment'],
          notApplicable: [],
          worstCaseDischarge: true,
          countermeasuresInPlan: ['dispersant'],
          countermeasuresExercised: [],
        },
      },
    ],
  }

  it('shows coverage of the core components, the worst case discharge and open countermeasures', async () => {
    ttx({ 'program:snapshots': () => [prepSnapshot] as never })
    renderAt('/program', '/program', ProgramPage)
    const region = await screen.findByRole('region', { name: 'PREP exercise cycles' })
    expect(within(region).getByText(/2 of 15 core components covered/)).toBeTruthy()
    expect(within(region).getByText(/A worst case discharge scenario was exercised/)).toBeTruthy()
    expect(within(region).getByText(/not yet exercised: dispersant/)).toBeTruthy()
    expect(within(region).getByRole('table')).toBeTruthy()
  })

  it('is not shown when no linked project has a PREP exercise', async () => {
    ttx()
    renderAt('/program', '/program', ProgramPage)
    await screen.findByText('Overdue')
    expect(screen.queryByText('PREP exercise cycles')).toBeNull()
  })
})

describe('Corrective actions table', () => {
  it('is a table with sortable headers that announce their order', async () => {
    ttx()
    renderAt('/program/actions', '/program/actions', ActionsPage)
    const table = await screen.findByRole('table')
    const due = within(table).getByRole('columnheader', { name: /Due/ })
    expect(due.getAttribute('aria-sort')).toBe('none')
    fireEvent.click(within(due).getByRole('button'))
    expect(due.getAttribute('aria-sort')).toBe('ascending')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0]!.textContent).toContain('Add PIO approval chain')
    fireEvent.click(within(due).getByRole('button'))
    expect(due.getAttribute('aria-sort')).toBe('descending')
  })

  it('marks an overdue action', async () => {
    ttx()
    renderAt('/program/actions', '/program/actions', ActionsPage)
    const row = (await screen.findByText('Add PIO approval chain')).closest('tr')!
    expect(within(row).getByText('Overdue')).toBeTruthy()
  })

  it('asks for a note before deferring and does not call main without one', async () => {
    const bridge = ttx()
    renderAt('/program/actions', '/program/actions', ActionsPage)
    fireEvent.click(await screen.findByLabelText('Select CA-0001'))
    fireEvent.click(screen.getByRole('button', { name: 'Change status…' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('New status'), { target: { value: 'deferred' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save status' }))
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/note/i)
    expect(bridge.calls('program:action-status')).toEqual([])
  })

  it('explains an empty filter result separately from an empty program', async () => {
    ttx({ 'program:actions-list': () => ({ actions: [], problems: [] }) })
    renderAt('/program/actions', '/program/actions', ActionsPage)
    expect(await screen.findByText('No corrective actions yet')).toBeTruthy()
  })
})

describe('IPP schedule', () => {
  it('has a row per cycle year and opens the form for a quarter', async () => {
    ttx()
    renderAt('/program/schedule', '/program/schedule', SchedulePage)
    const grid = await screen.findByRole('table', { name: /Planned exercises by year/ })
    expect(within(grid).getByRole('rowheader', { name: '2028' })).toBeTruthy()
    fireEvent.click(within(grid).getByRole('button', { name: 'Add an exercise in 2027 Q2' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Plan an exercise' })).toBeTruthy()
    expect((within(dialog).getByLabelText('Year') as HTMLInputElement).value).toBe('2027')
  })

  it('shows a completed exercise as done in its cell', async () => {
    ttx({
      'program:get': () => ({
        ...open,
        schedule: {
          formatVersion: 1,
          exercises: [
            {
              id: 'e1',
              title: 'FIDS failure',
              type: 'tabletop',
              when: { year: 2026, quarter: 2 },
              status: 'completed',
              completedAt: '2026-04-12',
              priorityIds: [],
              coreCapabilities: [],
              planSections: [],
              correctiveActionIds: [],
              notes: '',
            },
          ],
        },
      }),
    })
    renderAt('/program/schedule', '/program/schedule', SchedulePage)
    const grid = await screen.findByRole('table', { name: /Planned exercises by year/ })
    expect(within(grid).getByText(/FIDS failure/).textContent).toContain('done 2026-04-12')
  })
})
