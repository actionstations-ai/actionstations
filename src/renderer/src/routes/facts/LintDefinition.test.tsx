// @vitest-environment happy-dom
// Editing a category's lint definition on the facts screen (#180).
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveProfile, type DomainProfileOverrides } from '@shared/domains'
import type { FacilityFactsFile } from '@shared/ipc/project'
import { Project, type LintWarning } from '@shared/schemas'
import FactsPage from './FactsPage'
import { mockTtx, projectUrl, renderAt } from '../documents/test-utils'

const ROUTE = '/p/:projectKey/facts'
const now = '2026-10-21T12:00:00.000Z'

const project = (overrides?: DomainProfileOverrides) =>
  Project.parse({
    id: 'p1',
    name: 'Northfield Regional',
    orgName: 'NRAA',
    orgType: 'airport',
    createdAt: now,
    updatedAt: now,
    appVersion: '0.0.1',
    ...(overrides ? { domainProfileOverrides: overrides } : {}),
  })

const view = (edited = false): FacilityFactsFile => ({
  path: 'facility-facts.md',
  markdown: '# Facility facts',
  edited,
  revision: 'rev1',
  historyCount: 0,
  categories: [
    {
      id: 'gates',
      label: 'Gates',
      entries: ['A1–A8'],
      extracted: ['A1–A8'],
      sources: {},
      linted: true,
    },
    { id: 'hosts', label: 'Hosts', entries: [], extracted: [], sources: {}, linted: false },
  ],
})

/** Rows of the one scenario; a row counts when the gate noun names an id the list lacks. */
const ROWS = ['Gate 99 is jammed open.', 'Jet Gate 40 lost power.']

const warningsFor = (noun: string): LintWarning[] =>
  ROWS.filter((text) => new RegExp(String.raw`\b(?:${noun})\s+\d`, 'i').test(text)).map(
    (_t, i) => ({
      code: 'FACILITY_UNKNOWN_ID',
      severity: 'warning',
      message: `Row I-0${i + 1} names an unknown gate`,
      source: 'lint',
      rowId: `I-0${i + 1}`,
    }),
  )

function setup(opts: { edited?: boolean } = {}) {
  let stored = project({ outsideParties: ['County OEM'] })
  const nounNow = () =>
    resolveProfile('airport', stored.domainProfileOverrides).factCategories.find(
      (c) => c.id === 'gates',
    )!.noun!
  const ttx = mockTtx({
    'project:get': () => ({ path: '/p', project: stored }),
    'project:update': (req: {
      patch: { domainProfileOverrides: DomainProfileOverrides | null }
    }) => {
      stored = project(req.patch.domainProfileOverrides ?? undefined)
      return { path: '/p', project: stored }
    },
    'project:facility-facts': () => view(opts.edited),
    'scenarios:list': () => [{ id: 'S1', title: 'Jet bridge', status: 'draft', updatedAt: now }],
    'scenarios:lint': () => warningsFor(nounNow()),
  })
  renderAt(projectUrl('facts'), ROUTE, FactsPage)
  return ttx
}

const gates = () => screen.findByRole('region', { name: 'Gates' })

afterEach(() => cleanup())

describe('lint definition editor', () => {
  it('tightens a noun, writes the whole category list, and the scenario check drops', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    expect(
      await screen.findByText(/2 unknown-identifier warnings across 1 scenario\./),
    ).toBeTruthy()
    const section = await gates()
    expect(within(section).queryByRole('region', { name: /Lint definition/ })).toBeNull()

    await user.click(await within(section).findByRole('button', { name: 'Edit lint definition' }))
    const noun = within(section).getByRole('textbox', { name: 'Noun' })
    await waitFor(() => expect(document.activeElement).toBe(noun))
    expect(noun).toHaveProperty('value', 'Gates?')
    await user.clear(noun)
    await user.type(noun, 'Jet Gates?{Enter}')

    await waitFor(() => expect(ttx.calls('project:update')).toHaveLength(1))
    const { patch } = ttx.calls('project:update')[0] as {
      patch: { domainProfileOverrides: DomainProfileOverrides }
    }
    const airport = resolveProfile('airport').factCategories
    expect(patch.domainProfileOverrides.outsideParties).toEqual(['County OEM'])
    expect(patch.domainProfileOverrides.factCategories?.map((c) => c.id)).toEqual(
      airport.map((c) => c.id),
    )
    expect(
      patch.domainProfileOverrides.factCategories?.find((c) => c.id === 'gates'),
    ).toMatchObject({ noun: 'Jet Gates?', idShape: 'alnum', lint: true, complete: true })
    expect(
      await screen.findByText(/1 unknown-identifier warning across 1 scenario \(1 fewer/),
    ).toBeTruthy()
    expect(within(section).getByText('Changed for this project')).toBeTruthy()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(section).getByRole('button', { name: 'Edit lint definition' }),
      ),
    )
  })

  it('refuses an unsafe noun with an announced error and focus on the field', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    const section = await gates()
    await user.click(await within(section).findByRole('button', { name: 'Edit lint definition' }))
    const noun = within(section).getByRole('textbox', { name: 'Noun' })
    await user.clear(noun)
    await user.type(noun, '(?:G+)+')
    await user.click(within(section).getByRole('button', { name: 'Save definition' }))
    const alert = await within(section).findByRole('alert')
    expect(alert.textContent).toMatch(/nested quantifiers/)
    expect(noun.getAttribute('aria-invalid')).toBe('true')
    expect(noun.getAttribute('aria-describedby')).toContain(alert.id)
    expect(document.activeElement).toBe(noun)
    expect(ttx.calls('project:update')).toHaveLength(0)

    await user.keyboard('{Escape}')
    expect(within(section).queryByRole('form')).toBeNull()
  })

  it('needs a context with a generic noun', async () => {
    setup()
    const user = userEvent.setup()
    const section = await gates()
    await user.click(await within(section).findByRole('button', { name: 'Edit lint definition' }))
    await user.type(
      within(section).getByRole('textbox', { name: 'Generic noun (optional)' }),
      'Doors?{Enter}',
    )
    expect((await within(section).findByRole('alert')).textContent).toMatch(/needs a context/)
    expect(document.activeElement).toBe(within(section).getByRole('textbox', { name: 'Context' }))
  })

  it('says where the extraction goes when facility-facts.md has edits', async () => {
    setup({ edited: true })
    const user = userEvent.setup()
    const section = await gates()
    await user.click(await within(section).findByRole('button', { name: 'Edit lint definition' }))
    expect(within(section).getByText(/goes to facility-facts\.generated\.md/)).toBeTruthy()
  })

  it('waits for unsaved entry edits, and offers no editor for built-in categories the domain lacks', async () => {
    setup()
    const user = userEvent.setup()
    const section = await gates()
    expect(
      within(await screen.findByRole('region', { name: 'Hosts' })).queryByRole('button', {
        name: 'Edit lint definition',
      }),
    ).toBeNull()
    await user.type(within(section).getByRole('textbox', { name: 'Add to Gates' }), 'B1{Enter}')
    await user.click(await within(section).findByRole('button', { name: 'Edit lint definition' }))
    expect(
      within(section).getByText(/Save or discard your changes to the entries first/),
    ).toBeTruthy()
    expect(within(section).getByRole('button', { name: 'Save definition' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('puts the domain definition back and drops the override list', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    const section = await gates()
    await user.click(await within(section).findByRole('button', { name: 'Edit lint definition' }))
    const noun = within(section).getByRole('textbox', { name: 'Noun' })
    await user.clear(noun)
    await user.type(noun, 'Jet Gates?{Enter}')
    await within(section).findByText('Changed for this project')
    await user.click(await within(section).findByRole('button', { name: 'Edit lint definition' }))
    await user.click(within(section).getByRole('button', { name: 'Use the domain’s definition' }))
    await waitFor(() => expect(ttx.calls('project:update')).toHaveLength(2))
    const { patch } = ttx.calls('project:update')[1] as {
      patch: { domainProfileOverrides: DomainProfileOverrides }
    }
    expect(patch.domainProfileOverrides).toEqual({ outsideParties: ['County OEM'] })
    await waitFor(() => expect(within(section).queryByText('Changed for this project')).toBeNull())
  })
})

describe('lint definition for a category the user added (#350)', () => {
  const PUMPS = { id: 'pump-stations', label: 'Pump stations' }
  const ROWS_350 = ['Pump Station 7 trips offline.', 'Crews reset Pump Station 2 by hand.']

  function setupUserCategory() {
    let stored = project({ outsideParties: ['County OEM'] })
    const pumps = () =>
      resolveProfile('airport', stored.domainProfileOverrides).factCategories.find(
        (c) => c.id === PUMPS.id,
      )
    // A row counts when the defined noun names a pump station the list (1, 2) lacks.
    const warnings = (): LintWarning[] => {
      const noun = pumps()?.noun
      if (!noun) return []
      return ROWS_350.flatMap((text, i) => {
        const id = new RegExp(String.raw`\b(?:${noun})\s+(\d+)`, 'i').exec(text)?.[1]
        return id && !['1', '2'].includes(id)
          ? [
              {
                code: 'FACILITY_UNKNOWN_ID',
                severity: 'warning',
                message: `Row I-0${i + 1} names an unknown pump station`,
                source: 'lint',
                rowId: `I-0${i + 1}`,
              } satisfies LintWarning,
            ]
          : []
      })
    }
    const base = view()
    const ttx = mockTtx({
      'project:get': () => ({ path: '/p', project: stored }),
      'project:update': (req: {
        patch: { domainProfileOverrides: DomainProfileOverrides | null }
      }) => {
        stored = project(req.patch.domainProfileOverrides ?? undefined)
        return { path: '/p', project: stored }
      },
      'project:facility-facts': () => ({
        ...base,
        edited: true,
        categories: [
          ...base.categories,
          {
            ...PUMPS,
            entries: ['1', '2'],
            extracted: [],
            sources: {},
            linted: !!pumps(),
            definable: !pumps(),
          },
        ],
      }),
      'scenarios:list': () => [{ id: 'S1', title: 'Storm', status: 'draft', updatedAt: now }],
      'scenarios:lint': warnings,
    })
    renderAt(projectUrl('facts'), ROUTE, FactsPage)
    return ttx
  }

  it('defines a noun from the editor, and the Scenario check gains then loses the warning', async () => {
    const ttx = setupUserCategory()
    const user = userEvent.setup()
    expect(
      await screen.findByText(/0 unknown-identifier warnings across 1 scenario\./),
    ).toBeTruthy()
    const section = await screen.findByRole('region', { name: 'Pump stations' })
    expect(within(section).getByText(/No lint definition/)).toBeTruthy()

    await user.click(within(section).getByRole('button', { name: 'Define for lint' }))
    const noun = within(section).getByRole('textbox', { name: 'Noun' })
    await waitFor(() => expect(document.activeElement).toBe(noun))
    expect(noun).toHaveProperty('value', '')
    await user.click(within(section).getByRole('button', { name: 'Save definition' }))
    expect((await within(section).findByRole('alert')).textContent).toMatch(/Give a noun/)
    expect(ttx.calls('project:update')).toHaveLength(0)

    await user.selectOptions(
      within(section).getByRole('combobox', { name: 'Identifier shape' }),
      'number',
    )
    await user.type(noun, 'Pump Stations?{Enter}')
    await waitFor(() => expect(ttx.calls('project:update')).toHaveLength(1))
    const { patch } = ttx.calls('project:update')[0] as {
      patch: { domainProfileOverrides: DomainProfileOverrides }
    }
    const airport = resolveProfile('airport').factCategories
    expect(patch.domainProfileOverrides.outsideParties).toEqual(['County OEM'])
    expect(patch.domainProfileOverrides.factCategories?.map((c) => c.id)).toEqual([
      ...airport.map((c) => c.id),
      'pump-stations',
    ])
    expect(patch.domainProfileOverrides.factCategories?.at(-1)).toMatchObject({
      ...PUMPS,
      noun: 'Pump Stations?',
      idShape: 'number',
      lint: true,
    })
    expect(
      await screen.findByText(/1 unknown-identifier warning across 1 scenario \(1 more/),
    ).toBeTruthy()
    expect(within(section).getByText('Defined for this project')).toBeTruthy()

    await user.click(within(section).getByRole('button', { name: 'Edit lint definition' }))
    await user.click(within(section).getByRole('button', { name: 'Remove the lint definition' }))
    await waitFor(() => expect(ttx.calls('project:update')).toHaveLength(2))
    const removed = ttx.calls('project:update')[1] as {
      patch: { domainProfileOverrides: DomainProfileOverrides }
    }
    expect(removed.patch.domainProfileOverrides).toEqual({ outsideParties: ['County OEM'] })
    expect(
      await screen.findByText(/0 unknown-identifier warnings across 1 scenario\./),
    ).toBeTruthy()
    expect(await within(section).findByRole('button', { name: 'Define for lint' })).toBeTruthy()
  })
})
