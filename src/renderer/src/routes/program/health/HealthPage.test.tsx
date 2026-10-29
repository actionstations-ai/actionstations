// @vitest-environment happy-dom
// The program health dashboard (#438): panels are tables with captions, matrix cells carry their
// count as text and an aria-label, columns sort, the filter round-trips through the URL, and the
// exercise list disables "Open scenario" for a project that is not on this computer.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { computeHealth } from '@shared/program/health'
import { Program, ProjectSnapshot, Schedule } from '@shared/schemas'
import { mockTtx, renderAt } from '../../documents/test-utils'
import HealthPage from './HealthPage'
import { choiceFromQuery, filterFromChoice } from './use-health-filter'

afterEach(cleanup)

const PROGRAM_PATH = '/Volumes/Share/County.asprogram'
const T = '2026-01-01T00:00:00.000Z'

const program = Program.parse({
  id: 'prog1',
  name: 'County Program',
  createdAt: T,
  updatedAt: T,
  appVersion: '0.8.0',
  cycle: { startYear: 2026, years: 1 },
  projects: [
    { projectId: 'a', name: 'Airport', path: '/p/a', linkedAt: T },
    { projectId: 'b', name: 'Transit', path: '/p/b', linkedAt: T },
  ],
})

const scenario = (id: string, over = {}) => ({
  scenarioId: id,
  title: `Scenario ${id}`,
  status: 'ready' as const,
  exercisedAt: '2026-05-10T15:00:00.000Z',
  coreCapabilities: ['operational_coordination' as const],
  planSections: [],
  aarPresent: false,
  ...over,
})

const snap = (id: string, name: string, reachable: boolean, scenarios: unknown[]) =>
  ProjectSnapshot.parse({
    projectId: id,
    name,
    orgName: '',
    orgType: '',
    takenAt: '2026-10-20T00:00:00.000Z',
    reachable,
    documents: [
      { id: 'd1', title: 'Emergency Plan', shortName: 'EP', kind: 'plan', sections: ['1 Intro'] },
    ],
    scenarios,
  })

const snapshots = [
  snap('a', 'Airport', true, [scenario('s1')]),
  snap('b', 'Transit', false, [scenario('s2'), scenario('s3', { coreCapabilities: [] })]),
]

const open = {
  path: PROGRAM_PATH,
  program,
  schedule: { formatVersion: 1, exercises: [] },
  scheduleRevision: 'new',
  reachable: { a: true, b: false },
  projectPaths: { a: '/p/a' },
}

const NOW = new Date('2026-10-28T12:00:00.000Z')

function ttx() {
  const seen: unknown[] = []
  const bridge = mockTtx({
    'settings:get': () => ({ program: { activePath: PROGRAM_PATH, recent: [] } }) as never,
    'program:get': () => open as never,
    'program:snapshots': () => snapshots,
    'program:health': ((req: { filter?: object }) => {
      seen.push(req.filter)
      return computeHealth(
        { program, schedule: Schedule.parse({}), snapshots, actions: [] },
        req.filter ?? {},
        NOW,
      )
    }) as never,
  } as never)
  return { bridge, seen }
}

const renderPage = (path = '/program/health') => renderAt(path, '/program/health', HealthPage)

describe('Program health page', () => {
  it('shows the setup card and nothing else before a program is chosen', async () => {
    mockTtx({ 'settings:get': () => ({ program: { recent: [] } }) as never })
    renderPage()
    expect(await screen.findByText('No exercise program yet')).toBeTruthy()
    expect(screen.queryByText('Core Capabilities by quarter')).toBeNull()
  })

  it('renders every panel as a table with a caption', async () => {
    ttx()
    renderPage()
    await screen.findByRole('heading', { name: 'Core Capabilities by quarter' })
    expect(screen.getByText('No corrective action is overdue.')).toBeTruthy()
    for (const caption of [
      'Core Capabilities against the quarters of the cycle',
      'Plan sections, to three levels, with how often exercises cited them',
      'Exercises, planned exercises and drill runs by quarter',
    ])
      expect(
        screen.queryByRole('table', { name: caption }) ?? screen.queryByText(caption),
      ).toBeTruthy()
    expect(screen.getByRole('img', { name: /Age of open corrective actions/ })).toBeTruthy()
  })

  it('gives each matrix cell its count as text and an aria-label', async () => {
    ttx()
    renderPage()
    const cell = await screen.findByRole('button', {
      name: 'Operational Coordination, 2026 Q2, 2 exercises',
    })
    expect(cell.textContent).toBe('2')
  })

  it('sorts a column and announces the order', async () => {
    ttx()
    renderPage()
    const table = await screen.findByRole('table', {
      name: 'Core Capabilities against the quarters of the cycle',
    })
    const status = within(table).getByRole('columnheader', { name: /Status/ })
    expect(status.getAttribute('aria-sort')).toBe('none')
    fireEvent.click(within(status).getByRole('button'))
    expect(status.getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(within(status).getByRole('button'))
    expect(status.getAttribute('aria-sort')).toBe('descending')
  })

  it('lists the exercises behind a cell and disables Open scenario for an unreachable project', async () => {
    ttx()
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Operational Coordination, 2026 Q2, 2 exercises' }),
    )
    const dialog = await screen.findByRole('dialog')
    const reachable = within(dialog).getByText('Scenario s1').closest('li')!
    const unreachable = within(dialog).getByText('Scenario s2').closest('li')!
    expect(within(reachable).getByRole('button', { name: 'Open scenario' })).toHaveProperty(
      'disabled',
      false,
    )
    expect(
      within(unreachable).getByRole('button', { name: 'Not on this computer' }),
    ).toHaveProperty('disabled', true)
  })

  it('shows the notice for exercises that predate capability mapping', async () => {
    ttx()
    renderPage()
    expect((await screen.findByText(/predates Core Capability mapping/)).textContent).toContain(
      '1 exercise',
    )
  })

  it('flags an unreachable project in the data freshness line', async () => {
    ttx()
    renderPage()
    expect(await screen.findByText(/Transit \(2026-10-20, not on this computer\)/)).toBeTruthy()
    expect(screen.getAllByText('Out of date').length).toBeGreaterThan(0)
  })

  it('reads the filter from the URL and asks main for it', async () => {
    const { seen } = ttx()
    renderPage('/program/health?project=a&year=2026&area=response&stale=12')
    await waitFor(() => expect(seen.length).toBeGreaterThan(0))
    expect(seen.at(-1)).toEqual({
      projectIds: ['a'],
      years: [2026],
      missionAreas: ['response'],
      staleAfterMonths: 12,
    })
  })
})

describe('filter in the URL', () => {
  it('round-trips and ignores malformed values', () => {
    const choice = choiceFromQuery(
      new URLSearchParams('project=a&year=2026&area=response&doc=k&stale=24'),
    )
    expect(filterFromChoice(choice)).toEqual({
      projectIds: ['a'],
      years: [2026],
      missionAreas: ['response'],
      documentKeys: ['k'],
      staleAfterMonths: 24,
    })
    expect(
      filterFromChoice(choiceFromQuery(new URLSearchParams('year=abc&area=nope&stale=0'))),
    ).toEqual({})
  })
})
