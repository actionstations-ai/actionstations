// @vitest-environment happy-dom
// Hazard data screens (#439): off by default with no fetch offered, the consent dialog names each
// host and what is sent, nothing is requested until Fetch, the FIRMS key field never shows a
// saved key, the Location form checks its input, and every screen has no axe violations.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HazardPlan } from '@shared/ipc/hazards'
import { HazardSnapshot } from '@shared/schemas'
import { queryClient } from '../../lib/query'
import { mockTtx, renderAt, PROJECT } from '../documents/test-utils'
import { HazardDataSection } from '../settings/HazardDataSection'
import { LocationSettings } from '../project-home/LocationSettings'
import { draftToLocation, toDraft } from '../project-home/location-draft'
import HazardsPage from './HazardsPage'

afterEach(cleanup)
beforeEach(() => queryClient.clear())

const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }
const violations = async () => (await axe.run(document.body, AXE)).violations.map((v) => v.id)

const at = '2026-10-29T12:00:00.000Z'
const snapshot = HazardSnapshot.parse({
  id: 'snap1',
  label: 'Before the storm',
  fetchedAt: at,
  request: { lat: 41.88, lon: -87.63, precision: 0.01 },
  sources: [
    { id: 'nws_alerts', status: 'ok', attribution: 'NWS', accessedAt: at },
    {
      id: 'firms',
      status: 'error',
      error: 'FIRMS did not answer',
      attribution: 'x',
      accessedAt: at,
    },
  ],
  alerts: [
    {
      event: 'Flood Watch',
      severity: 'Moderate',
      headline: 'Flood Watch until Friday',
      effective: at,
      areaDesc: 'Cook',
    },
  ],
  declarations: [
    {
      disasterNumber: 4749,
      declarationType: 'DR',
      declarationDate: '2023-07-14',
      incidentType: 'Flood',
      declarationTitle: 'Severe storms and flooding',
      designatedArea: 'Cook',
    },
  ],
})

const plan = (enabled = true, hasLocation = true): HazardPlan => ({
  enabled,
  hasLocation,
  items: enabled
    ? [
        {
          id: 'nws_alerts',
          label: 'Weather alerts',
          host: 'api.weather.gov',
          sends: 'rounded coordinates 41.88, -87.63',
          returns: 'Active alerts for that point',
          available: true,
        },
        {
          id: 'firms',
          label: 'Fire detections',
          host: 'firms.modaps.eosdis.nasa.gov',
          sends: 'rounded coordinates and your FIRMS map key',
          returns: 'Fire detections',
          available: false,
          reason: 'Needs a free FIRMS map key (Settings, Hazard data).',
        },
      ]
    : [],
})

function page(over: Record<string, unknown> = {}) {
  const ttx = mockTtx({
    'hazards:settings': () => ({ enabled: true, hasFirmsKey: false, encryptionAvailable: true }),
    'hazards:plan': () => plan(),
    'hazards:list': () => ({
      active: 'snap1',
      snapshots: [{ id: 'snap1', label: 'Before the storm', fetchedAt: at, pinned: false }],
    }),
    'hazards:get': () => snapshot,
    'hazards:update': () => ({ snapshots: [] }),
    ...over,
  })
  renderAt('/p/x/hazards', '/p/:projectKey/hazards', () => <HazardsPage />)
  return ttx
}

describe('Hazard context screen', () => {
  it('offers no fetch while the feature is off, and requests nothing', async () => {
    const ttx = page({
      'hazards:settings': () => ({ enabled: false, hasFirmsKey: false, encryptionAvailable: true }),
      'hazards:plan': () => plan(false, true),
    })
    await screen.findByText('Hazard data is off')
    expect(screen.queryByRole('button', { name: /Fetch hazard data/ })).toBeNull()
    expect(ttx.calls('hazards:fetch')).toEqual([])
    expect(await violations()).toEqual([])
  })

  it('asks for a location first when the project has none', async () => {
    page({ 'hazards:plan': () => plan(true, false) })
    await screen.findByText('Set the project location first')
    expect(screen.queryByRole('button', { name: /Fetch hazard data/ })).toBeNull()
  })

  it('lists the snapshot with its results as a table, and has no axe violations', async () => {
    page()
    const table = await screen.findByRole('table', { name: 'Result of each source' })
    expect(within(table).getByText('Received')).toBeTruthy()
    expect(within(table).getByText('Failed')).toBeTruthy()
    expect(screen.getByText('FIRMS did not answer')).toBeTruthy()
    expect(screen.getByRole('table', { name: 'Saved hazard snapshots, newest first' })).toBeTruthy()
    expect(screen.getByText(/must not be used for operational decisions/)).toBeTruthy()
    expect(await violations()).toEqual([])
  })

  it('shows hosts and values in the consent dialog and fetches only after Fetch', async () => {
    const ttx = page({ 'hazards:fetch': () => snapshot })
    fireEvent.click(await screen.findByRole('button', { name: /Fetch hazard data/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Fetch hazard data' })
    await within(dialog).findByText(/Host: api\.weather\.gov/)
    expect(dialog.textContent).toContain('rounded coordinates 41.88, -87.63')
    expect(dialog.textContent).toContain('Not available: Needs a free FIRMS map key')
    expect(
      (within(dialog).getByRole('checkbox', { name: 'Fire detections' }) as HTMLInputElement)
        .disabled,
    ).toBe(true)
    expect(ttx.calls('hazards:fetch')).toEqual([])
    expect((await axe.run(dialog, AXE)).violations.map((v) => v.id)).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fetch' }))
    await waitFor(() => expect(ttx.calls('hazards:fetch')).toHaveLength(1))
    expect(ttx.calls('hazards:fetch')[0]).toMatchObject({ sources: ['nws_alerts'] })
  })

  it('leaves out a source the user unticks', async () => {
    const ttx = page({ 'hazards:fetch': () => snapshot })
    fireEvent.click(await screen.findByRole('button', { name: /Fetch hazard data/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Fetch hazard data' })
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: 'Weather alerts' }))
    expect(
      (within(dialog).getByRole('button', { name: 'Fetch' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(ttx.calls('hazards:fetch')).toEqual([])
  })
})

describe('Settings → Hazard data', () => {
  function section(settings: Record<string, unknown>) {
    const ttx = mockTtx({
      'hazards:settings': () => ({
        enabled: false,
        hasFirmsKey: false,
        encryptionAvailable: true,
        ...settings,
      }),
      'hazards:settings-save': () => ({
        enabled: true,
        hasFirmsKey: false,
        encryptionAvailable: true,
      }),
      'hazards:firms-key-set': () => ({
        enabled: true,
        hasFirmsKey: true,
        encryptionAvailable: true,
      }),
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HazardDataSection />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    return ttx
  }

  it('is off by default and names every host', async () => {
    section({})
    const box = (await screen.findByRole('checkbox', {
      name: 'Allow fetching public hazard data',
    })) as HTMLInputElement
    expect(box.checked).toBe(false)
    for (const host of [
      'api.weather.gov',
      'earthquake.usgs.gov',
      'firms.modaps.eosdis.nasa.gov',
      'www.fema.gov',
    ])
      expect(document.body.textContent).toContain(host)
    expect(screen.queryByLabelText('NASA FIRMS map key')).toBeNull()
    expect(await violations()).toEqual([])
  })

  it('saves the switch', async () => {
    const ttx = section({})
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Allow fetching public hazard data' }),
    )
    await waitFor(() => expect(ttx.calls('hazards:settings-save')).toEqual([{ enabled: true }]))
  })

  it('sends the map key once and never shows a saved key again', async () => {
    const ttx = section({ enabled: true })
    const input = (await screen.findByLabelText('NASA FIRMS map key')) as HTMLInputElement
    expect(input.type).toBe('password')
    fireEvent.change(input, { target: { value: 'firmskeyfortests0001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save map key' }))
    await waitFor(() => expect(ttx.calls('hazards:firms-key-set')).toHaveLength(1))
    expect(await violations()).toEqual([])
  })

  it('says "Map key saved" with Replace and Remove when a key exists', async () => {
    section({ enabled: true, hasFirmsKey: true })
    await screen.findByText('Map key saved')
    expect(screen.getByRole('button', { name: 'Replace' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy()
    expect(document.body.textContent).not.toContain('firmskeyfortests0001')
  })

  it('refuses a key when there is no secure storage', async () => {
    section({ enabled: true, encryptionAvailable: false })
    await screen.findByText(/no secure storage/)
    expect((screen.getByLabelText('NASA FIRMS map key') as HTMLInputElement).disabled).toBe(true)
  })
})

describe('Location form', () => {
  const project = { id: 'p1' } as never

  it('checks coordinates and codes', () => {
    const d = toDraft(undefined)
    expect(draftToLocation({ ...d, lat: '95', lon: '10' })).toMatchObject({ error: /Latitude/ })
    expect(draftToLocation({ ...d, lat: '41', lon: '-200' })).toMatchObject({ error: /Longitude/ })
    expect(draftToLocation({ ...d, lat: '41', lon: '-87', stateFips: '1' })).toMatchObject({
      error: /two digits/,
    })
    expect(draftToLocation({ ...d, lat: '41', lon: '-87', countyFips: '031' })).toMatchObject({
      error: /needs a state/,
    })
    expect(
      draftToLocation({
        ...d,
        lat: '41.8781',
        lon: '-87.6298',
        stateFips: '17',
        countyFips: '031',
      }),
    ).toEqual({
      value: {
        label: '',
        lat: 41.8781,
        lon: -87.6298,
        stateFips: '17',
        countyFips: '031',
        sendPrecision: 0.01,
      },
    })
  })

  it('fills the fields from a county search and saves the full values', async () => {
    const ttx = mockTtx({
      'hazards:gazetteer-search': () => [
        { label: 'Cook County, IL', stateFips: '17', countyFips: '031', lat: 41.8, lon: -87.7 },
      ],
      'project:update': () => ({ path: PROJECT, project: {} as never }),
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LocationSettings path={PROJECT} project={project} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByLabelText('Find a US county'), { target: { value: 'cook il' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Use Cook County, IL' }))
    expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('41.8')
    expect((screen.getByLabelText('County code (FIPS)') as HTMLInputElement).value).toBe('031')
    expect(await violations()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Save location' }))
    await waitFor(() => expect(ttx.calls('project:update')).toHaveLength(1))
    expect(ttx.calls('project:update')[0]).toMatchObject({
      patch: {
        location: {
          lat: 41.8,
          lon: -87.7,
          stateFips: '17',
          countyFips: '031',
          sendPrecision: 0.01,
        },
      },
    })
  })
})
