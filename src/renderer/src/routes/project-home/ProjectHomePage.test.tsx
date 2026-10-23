// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Project } from '@shared/schemas'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import {
  PROJECT,
  makeDoc,
  mockTtx,
  projectUrl,
  renderAt,
  type Handlers,
} from '../documents/test-utils'
import ProjectHomePage from './ProjectHomePage'

const scenario = Scenario.parse(fixture)

function project(over: Partial<Project> = {}): Project {
  return Project.parse({
    id: 'p1',
    name: 'North Coast International Airport',
    orgName: 'North Coast Regional Airport Authority',
    createdAt: '2026-10-21T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
    appVersion: '0.2.0',
    ...over,
  })
}

const facts = {
  path: 'facility-facts.md',
  markdown: '',
  edited: false,
  categories: [
    { id: 'runways', label: 'Runways', entries: ['5/23', '1/19'], extracted: [], linted: true },
  ],
  revision: 'r1',
  historyCount: 0,
}

function setup(p: Project, extra: Handlers = {}) {
  const ttx = mockTtx({
    'project:get': () => ({ path: PROJECT, project: p }),
    'project:facility-facts': () => facts as never,
    'scenarios:get': () => scenario,
    'injects:list': () => [],
    'scenarios:lint': () => [],
    ...extra,
  })
  renderAt(projectUrl(''), '/p/:projectKey', ProjectHomePage)
  return ttx
}

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('ProjectHomePage', () => {
  it('starts a new project at "Add your documents" with settings collapsed', async () => {
    setup(project())
    const list = await screen.findByRole('region', { name: 'Get this exercise ready' })
    expect(
      within(list).getByRole('heading', { name: /^Add your documents\s+\(next step\)/ }),
    ).toBeTruthy()
    expect(
      within(list).getByRole('heading', { name: /^Generate a scenario\s+\(to do\)/ }),
    ).toBeTruthy()
    const next = within(list).getByRole('link', { name: /^Next: Import documents/ })
    expect(next.getAttribute('href')).toBe(projectUrl('documents'))
    const summary = screen.getByText('Project settings', { selector: 'summary *' })
    expect(summary.closest('details')!.open).toBe(false)
    expect(screen.getByText(/No scenarios yet/)).toBeTruthy()
  })

  it('follows the latest scenario: documents and facts done, injects next', async () => {
    const ttx = setup(
      project({
        documents: [makeDoc()],
        scenarios: [
          {
            id: 'scenario-3',
            title: 'Flight to Nowhere',
            status: 'ready',
            updatedAt: scenario.updatedAt,
          },
        ],
      }),
    )
    const list = await screen.findByRole('region', { name: 'Get this exercise ready' })
    expect(
      await within(list).findByRole('heading', { name: /^Write the injects\s+\(next step\)/ }),
    ).toBeTruthy()
    expect(
      within(list).getByRole('heading', { name: /^Add your documents\s+\(done\)/ }),
    ).toBeTruthy()
    expect(
      within(list).getByRole('heading', { name: /^Check the facility facts\s+\(done\)/ }),
    ).toBeTruthy()
    expect(within(list).getByText(/^2 facts found/)).toBeTruthy()
    expect(
      await within(list).findByText('0 of 24 events in “Flight to Nowhere” have an inject.'),
    ).toBeTruthy()
    expect(
      within(list)
        .getByRole('link', { name: /^Next: Write injects/ })
        .getAttribute('href'),
    ).toBe(projectUrl('scenarios/scenario-3?tab=injects'))
    expect(ttx.calls('project:facility-facts')[0]).toEqual({ path: PROJECT })

    const scenarios = screen.getByRole('region', { name: 'Scenarios' })
    const item = within(scenarios).getByRole('link', { name: 'Flight to Nowhere' }).closest('li')!
    // The live status, not the stored "ready".
    expect(await within(item).findByText('Draft')).toBeTruthy()
    expect(await within(item).findByText('24 events · 0/24 injects · 0/24 rendered')).toBeTruthy()
  })

  it('does not read facility facts before any document is indexed', async () => {
    const ttx = setup(project({ documents: [makeDoc({ status: 'parsing' })] }))
    await screen.findByRole('region', { name: 'Get this exercise ready' })
    expect(ttx.calls('project:facility-facts')).toHaveLength(0)
  })

  it('remembers that the settings section was opened', async () => {
    setup(project())
    const user = userEvent.setup()
    const summary = (
      await screen.findByText('Project settings', { selector: 'summary *' })
    ).closest('summary')!
    await user.click(summary)
    expect(summary.closest('details')!.open).toBe(true)
    expect(screen.getByLabelText('Organization name')).toBeTruthy()
    expect(localStorage.getItem('ttx.overview.settingsOpen')).toBe('1')
  })
})
