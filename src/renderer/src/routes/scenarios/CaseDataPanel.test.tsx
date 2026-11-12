// @vitest-environment happy-dom
// The Case data tab (#1139): the scenario's datasets with their labels, the sources its toolkits
// name, and a fetch that shows the size, archive and terms before anything is requested.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CaseFetchPlan, type ConnectorInfo, type GeneratorInfo } from '@shared/ipc/case-data'
import { CaseDataset } from '@shared/schemas/case-data'
import { Scenario } from '@shared/schemas'
import { ToolkitSchema } from '@shared/toolkits'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../documents/test-utils'
import { CaseDataPanel } from './CaseDataPanel'

afterEach(cleanup)

const PATH = '/tmp/p.asproj'
const now = '2027-03-04T10:00:00.000Z'
const scenario = Scenario.parse({
  id: 'S1',
  projectId: 'P1',
  title: 'Quake',
  createdAt: now,
  updatedAt: now,
  brief: {},
})
const source = { layer: 'bundled', packId: 'p', packName: 'Pack', packVersion: '1.0.0' } as const
const toolkits = {
  toolkits: [
    {
      toolkit: ToolkitSchema.parse({
        id: 'humanitarian',
        name: 'Humanitarian',
        description: 'd',
        connectors: ['gdacs-events'],
      }),
      source,
      enabled: true,
    },
    {
      toolkit: ToolkitSchema.parse({
        id: 'spill',
        name: 'Spill',
        description: 'd',
        connectors: ['noaa-esi'],
      }),
      source,
      enabled: false,
    },
  ],
  projectDefault: [],
}
const connectors: ConnectorInfo[] = [
  {
    id: 'gdacs-events',
    label: 'GDACS disaster events for a country and period',
    source: 'GDACS',
    terms: 'Cite GDACS as the source.',
    hosts: ['www.gdacs.org'],
    options: [
      { key: 'location', label: 'Country code', type: 'text', required: true, example: 'TUR' },
    ],
  },
  { id: 'noaa-esi', label: 'Shoreline classes', source: 'NOAA', terms: 't', hosts: ['x.gov'] },
]
const generators: GeneratorInfo[] = [
  {
    id: 'humanitarian-arrivals',
    label: 'Displacement and arrivals at a site',
    description: 'Arrivals and registration at a site, day by day.',
    toolkits: ['humanitarian'],
    inputs: [
      { key: 'startDate', label: 'First day', kind: 'datetime', required: false },
      {
        key: 'days',
        label: 'Days',
        kind: 'number',
        integer: true,
        min: 2,
        max: 120,
        required: false,
      },
    ],
    example: { startDate: '2026-10-13T00:00:00Z', days: 14 },
  },
  {
    id: 'spill-simulation',
    label: 'Oil spill',
    toolkits: ['spill_plume'],
    inputs: [{ key: 'volume', label: 'Volume', kind: 'number', required: true }],
    example: { volume: 4200 },
  },
]
const dataset = CaseDataset.parse({
  id: 'gdacs-timeline',
  kind: 'text',
  label: 'GDACS disaster events, TUR',
  provenance: {
    origin: 'historical',
    source: 'GDACS',
    retrieved: '2026-11-12T00:00:00Z',
    terms: '',
    citation: '',
  },
  range: { start: '2023-02-01T00:00:00Z', end: '2023-03-31T00:00:00Z' },
  bytes: 4096,
})
const plan = CaseFetchPlan.parse({
  estimateId: 'e1',
  connectorId: 'gdacs-events',
  source: 'GDACS',
  terms: 'Cite GDACS as the source.',
  hosts: ['www.gdacs.org'],
  estimate: {
    items: [{ datasetId: 'gdacs-timeline', label: 'Disaster events', kind: 'text', bytes: 2048 }],
    requests: 2,
  },
  totalBytes: 2048,
  roomBytes: 500 * 1024 * 1024,
  exceedsLimit: false,
})

function setup(datasets: CaseDataset[] = []) {
  const ttx = mockTtx({
    'case:get': () => ({
      manifest: { version: 1, datasets },
      bytes: 4096,
      limitBytes: 500 * 1024 * 1024,
    }),
    'toolkits:list': () => toolkits,
    'case:connectors': () => connectors,
    'case:generators': () => generators,
    'case:generate': () => ({ version: 1, datasets: [] }),
    'case:plan-fetch': () => plan,
    'case:fetch': () => ({ version: 1, datasets: [dataset] }),
    'case:remove-dataset': () => ({ version: 1, datasets: [] }),
    'case:time-mapping-save': () => ({ version: 1, datasets }),
  })
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <CaseDataPanel projectPath={PATH} scenario={scenario} />
    </QueryClientProvider>,
  )
  return ttx
}

describe('CaseDataPanel (#1139)', () => {
  it('lists each dataset with its label, source and size, and removes one after a confirm', async () => {
    const ttx = setup([dataset])
    const table = await screen.findByRole('table', { name: /case data in this scenario/i })
    expect(
      within(table).getByText('GDACS disaster events, TUR', { selector: 'strong' }),
    ).toBeTruthy()
    expect(within(table).getByText('Historical')).toBeTruthy()
    expect(within(table).getByText('Retrieved 2026-11-12')).toBeTruthy()
    window.confirm = vi.fn(() => true)
    await userEvent.click(within(table).getByRole('button', { name: /remove gdacs/i }))
    expect(ttx.calls('case:remove-dataset')).toEqual([
      { projectPath: PATH, scenarioId: 'S1', datasetId: 'gdacs-timeline' },
    ])
  })

  it('offers only the sources of the toolkits that are on', async () => {
    setup()
    const select = await screen.findByRole('combobox', { name: /source/i })
    const names = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(names).toEqual(['Choose a source…', 'GDACS disaster events for a country and period'])
  })

  it('asks for the declared options and shows size and terms before fetching', async () => {
    const ttx = setup()
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: /source/i }),
      'gdacs-events',
    )
    await userEvent.click(screen.getByRole('button', { name: /check size and terms/i }))
    expect(screen.getByRole('alert').textContent).toMatch(/Country code is needed/)
    expect(ttx.calls('case:plan-fetch')).toEqual([])
    await userEvent.type(screen.getByRole('textbox', { name: /country code/i }), 'TUR')
    await userEvent.click(screen.getByRole('button', { name: /check size and terms/i }))
    expect(await screen.findByText(/Cite GDACS as the source/)).toBeTruthy()
    expect(screen.getByText(/only www\.gdacs\.org/)).toBeTruthy()
    const planned = ttx.calls('case:plan-fetch')[0] as Record<string, unknown>
    expect(Object.keys(planned).sort()).toEqual([
      'connectorId',
      'projectPath',
      'query',
      'scenarioId',
    ])
    expect((planned.query as { options: unknown }).options).toEqual({ location: 'TUR' })
    expect(ttx.calls('case:fetch')).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: /agree and fetch/i }))
    expect(ttx.calls('case:fetch')).toEqual([
      { projectPath: PATH, scenarioId: 'S1', estimateId: 'e1', consent: true },
    ])
  })

  it('saves the case clock with the start of the data as the default', async () => {
    const ttx = setup([dataset])
    await screen.findByRole('heading', { name: /case clock/i })
    const speed = screen.getByRole('textbox', { name: /speed/i })
    await userEvent.clear(speed)
    await userEvent.type(speed, '4')
    await userEvent.click(screen.getByRole('button', { name: /save case clock/i }))
    expect(ttx.calls('case:time-mapping-save')).toEqual([
      {
        projectPath: PATH,
        scenarioId: 'S1',
        timeMapping: { caseStart: '2023-02-01T00:00:00Z', startOffsetMin: 0, speed: 4, jumps: [] },
      },
    ])
  })

  it('runs a simulation of a toolkit that is on, starting from its example', async () => {
    const ttx = setup()
    const select = await screen.findByRole('combobox', { name: /^simulation/i })
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Choose a simulation…', 'Displacement and arrivals at a site'])
    await userEvent.selectOptions(select, 'humanitarian-arrivals')
    const days = screen.getByRole('textbox', { name: /days/i })
    expect((days as HTMLInputElement).value).toBe('14')
    await userEvent.clear(days)
    await userEvent.type(days, '200')
    await userEvent.click(screen.getByRole('button', { name: /run simulation/i }))
    expect(screen.getByRole('alert').textContent).toMatch(/Days must be at most 120/)
    expect(ttx.calls('case:generate')).toEqual([])
    await userEvent.clear(days)
    await userEvent.type(days, '21')
    await userEvent.click(screen.getByRole('button', { name: /run simulation/i }))
    expect(ttx.calls('case:generate')).toEqual([
      {
        projectPath: PATH,
        scenarioId: 'S1',
        generatorId: 'humanitarian-arrivals',
        params: { startDate: '2026-10-13T00:00:00Z', days: 21 },
      },
    ])
  })

  it('lists every simulation when asked', async () => {
    setup()
    await userEvent.click(await screen.findByRole('checkbox', { name: /every toolkit/i }))
    const select = screen.getByRole('combobox', { name: /^simulation/i })
    expect(within(select).getAllByRole('option')).toHaveLength(3)
  })

  it('says so when no toolkit that is on can fetch', async () => {
    mockTtx({})
    setup()
    toolkits.toolkits[0]!.enabled = false
    queryClient.clear()
    cleanup()
    setup()
    expect(await screen.findByText(/None of this scenario's toolkits can fetch/)).toBeTruthy()
    toolkits.toolkits[0]!.enabled = true
  })
})
