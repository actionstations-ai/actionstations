// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { FacilityFactsFile } from '@shared/ipc/project'
import type { LintWarning } from '@shared/schemas'
import FactsPage from './FactsPage'
import { FakeIpcError, mockTtx, projectUrl, renderAt, type Handlers } from '../documents/test-utils'
import { describeCount } from './use-facility-lint'

const ROUTE = '/p/:projectKey/facts'
const SOURCE = { documentId: 'aep', documentTitle: 'Airport Emergency Plan', section: '2.2 Scope' }

function view(over: Partial<FacilityFactsFile> = {}): FacilityFactsFile {
  return {
    path: 'facility-facts.md',
    markdown: '# Facility facts',
    edited: false,
    revision: 'rev1',
    historyCount: 0,
    categories: [
      {
        id: 'runways',
        label: 'Runways',
        entries: ['5/23', '1/19'],
        extracted: ['5/23', '1/19'],
        sources: { '5/23': SOURCE },
        linted: true,
      },
      {
        id: 'pump-stations',
        label: 'Pump stations',
        entries: ['PS-4'],
        extracted: [],
        sources: {},
        linted: false,
      },
    ],
    ...over,
  }
}

const unknownId = (rowId: string): LintWarning => ({
  code: 'FACILITY_UNKNOWN_ID',
  severity: 'warning',
  message: `Row ${rowId} names Runway 9`,
  source: 'lint',
  rowId,
})

function setup(extra: Handlers = {}) {
  let current = view()
  let warnings = [unknownId('I-01'), unknownId('I-02')]
  const ttx = mockTtx({
    'project:facility-facts': () => current,
    'project:facility-facts-save': (req: { categories: FacilityFactsFile['categories'] }) => {
      current = view({
        edited: true,
        revision: 'rev2',
        historyCount: 1,
        categories: current.categories.map((c) => ({
          ...c,
          entries: req.categories.find((r) => r.id === c.id)?.entries ?? c.entries,
        })),
      })
      warnings = [unknownId('I-02')]
      return current
    },
    'project:facility-facts-reset': () => (current = view({ revision: 'rev3', historyCount: 2 })),
    'scenarios:list': () => [
      {
        id: 'S1',
        title: 'Flight to Nowhere',
        status: 'draft',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      { id: 'S2', title: 'Old drill', status: 'archived', updatedAt: '2026-10-01T00:00:00.000Z' },
    ],
    'scenarios:lint': () => warnings,
    ...extra,
  })
  renderAt(projectUrl('facts'), ROUTE, FactsPage)
  return ttx
}

const section = async (name: string) => screen.findByRole('region', { name })

afterEach(() => cleanup())

describe('FactsPage', () => {
  it('shows every category from the file with origin badges, sources and the lint baseline', async () => {
    const ttx = setup()
    const runways = await section('Runways')
    expect(within(runways).getByRole('textbox', { name: 'Runways entry 1' })).toHaveProperty(
      'value',
      '5/23',
    )
    expect(within(runways).getAllByText('From documents')).toHaveLength(2)
    expect(within(runways).getByText('Found in Airport Emergency Plan › 2.2 Scope')).toBeTruthy()
    expect(within(runways).getByText('Checked by lint')).toBeTruthy()
    const pumps = await section('Pump stations')
    expect(within(pumps).getByText('Added by you')).toBeTruthy()
    expect(within(pumps).getByText(/not linted/)).toBeTruthy()
    expect(
      await screen.findByText(/2 unknown-identifier warnings across 1 scenario\./),
    ).toBeTruthy()
    expect(ttx.calls('scenarios:lint')).toEqual([
      { projectPath: expect.any(String), scenarioId: 'S1' },
    ])
  })

  it('adds pasted lines (skipping duplicates), saves, and reports the lint change', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    const runways = await section('Runways')
    const add = within(runways).getByRole('textbox', { name: 'Add to Runways' })
    await user.click(add)
    await user.paste('9/27\n5/23\n- 18/36')
    await user.keyboard('{Enter}')
    expect(within(runways).getAllByText('Added by you')).toHaveLength(2)
    expect(screen.getByText('Unsaved changes')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /^Save/ }))
    await waitFor(() => expect(ttx.calls('project:facility-facts-save')).toHaveLength(1))
    const req = ttx.calls('project:facility-facts-save')[0] as {
      revision: string
      categories: { id: string; entries: string[] }[]
    }
    expect(req.revision).toBe('rev1')
    expect(req.categories.find((c) => c.id === 'runways')?.entries).toEqual([
      '5/23',
      '1/19',
      '9/27',
      '18/36',
    ])
    expect(
      await screen.findByText(/1 unknown-identifier warning across 1 scenario \(1 fewer/),
    ).toBeTruthy()
    expect(screen.getByText('Edited by you')).toBeTruthy()
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  it('lists a removed extracted entry with Restore, and Discard returns to the file', async () => {
    setup()
    const user = userEvent.setup()
    const runways = await section('Runways')
    await user.click(within(runways).getByRole('button', { name: 'Remove 1/19 from Runways' }))
    const removed = within(runways).getByRole('list', { name: 'Runways removed from the list' })
    expect(within(removed).getByText('1/19')).toBeTruthy()
    await user.click(within(removed).getByRole('button', { name: 'Restore 1/19 to Runways' }))
    expect(within(runways).queryByRole('list', { name: /removed from the list/ })).toBeNull()

    await user.clear(within(runways).getByRole('textbox', { name: 'Runways entry 1' }))
    await user.click(screen.getByRole('button', { name: /Discard changes/ }))
    expect(within(runways).getByRole('textbox', { name: 'Runways entry 1' })).toHaveProperty(
      'value',
      '5/23',
    )
  })

  it('keeps edits and offers Reload when the file changed on disk (CONFLICT)', async () => {
    setup({
      'project:facility-facts-save': () => {
        throw new FakeIpcError('CONFLICT', 'facility-facts.md changed on disk')
      },
    })
    const user = userEvent.setup()
    const pumps = await section('Pump stations')
    await user.type(
      within(pumps).getByRole('textbox', { name: 'Add to Pump stations' }),
      'PS-7{Enter}',
    )
    await user.keyboard('{Control>}s{/Control}')
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringMatching(/changed since this page loaded/),
    )
    expect(within(pumps).getByRole('textbox', { name: 'Pump stations entry 2' })).toHaveProperty(
      'value',
      'PS-7',
    )
    await user.click(screen.getByRole('button', { name: 'Reload the file' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(within(pumps).queryByRole('textbox', { name: 'Pump stations entry 2' })).toBeNull()
  })

  it('resets to the extracted facts after confirming', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await section('Runways')
    await user.click(screen.getByRole('button', { name: /Reset to extracted facts/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Reset to the extracted facts?' })
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(ttx.calls('project:facility-facts-reset')).toHaveLength(1))
    expect(await screen.findByText(/2 earlier versions kept/)).toBeTruthy()
  })

  it('adds a category for another kind of identifier', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await section('Runways')
    await user.type(screen.getByRole('textbox', { name: 'Category name' }), 'Lift stations{Enter}')
    const lifts = await section('Lift stations')
    await user.type(
      within(lifts).getByRole('textbox', { name: 'Add to Lift stations' }),
      'LS-1{Enter}',
    )
    await user.click(screen.getByRole('button', { name: /^Save/ }))
    await waitFor(() => expect(ttx.calls('project:facility-facts-save')).toHaveLength(1))
    const req = ttx.calls('project:facility-facts-save')[0] as {
      categories: { id: string; label: string; entries: string[] }[]
    }
    expect(req.categories.at(-1)).toEqual({
      id: 'lift-stations',
      label: 'Lift stations',
      entries: ['LS-1'],
    })
  })
})

describe('describeCount', () => {
  const count = (warnings: number, scenarios = 2) => ({ scenarios, warnings, flagged: [] })
  it('states the count and the change from the baseline', () => {
    expect(describeCount(undefined, count(0, 0))).toBe('No scenarios to check yet.')
    expect(describeCount(count(3), count(3))).toBe(
      '3 unknown-identifier warnings across 2 scenarios.',
    )
    expect(describeCount(count(3), count(5))).toMatch(/2 more than when you opened this page: 3/)
  })
})
