// @vitest-environment happy-dom
// The connection chooser on the Live tab (spec 0410): radio group semantics, the statement linked
// to its radio, consent before any test or start, the Test checklist, the fingerprint Confirm for
// a self-signed server, and a server key field that never shows a stored value.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConnectionTestResult } from '@shared/schemas/live'
import { queryClient } from '../../../lib/query'
import { mockTtx, PROJECT } from '../../documents/test-utils'
import { LivePanel } from './LivePanel'
import { CONNECTION } from './strings'

const FP = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(
  ':',
)
const HEALTHY: ConnectionTestResult = {
  ok: true,
  checks: [
    { id: 'reachable', label: 'The server answered', status: 'pass' },
    { id: 'protocol', label: 'The server speaks the same protocol', status: 'pass' },
  ],
  server: { kind: 'relay' },
}

function renderPanel(extra: Parameters<typeof mockTtx>[0] = {}, consented: string[] = []) {
  queryClient.clear()
  const ttx = mockTtx({
    'live:session-status': () => ({ connected: 0 }),
    'live:lan-addresses': () => [],
    'live:firewall-guidance': () => ({
      platform: 'darwin' as const,
      beforeStart: 'x',
      ifDenied: 'x',
      noConnections: 'x',
    }),
    'facilitator:state-get': () =>
      ({
        elapsedMin: 0,
        delivered: {},
        notes: {},
        generalNotes: '',
        hotwash: [],
        decisions: [],
        live: { consented },
      }) as never,
    'settings:get': () => ({ live: { defaultConnectionKind: 'lan', servers: [] } }) as never,
    'live:servers-list': () => [],
    'live:connection-test': () => HEALTHY,
    'live:consent': () => undefined,
    ...extra,
  })
  render(
    <QueryClientProvider client={queryClient}>
      <LivePanel projectPath={PROJECT} scenarioId="scn-1" />
    </QueryClientProvider>,
  )
  return ttx
}

afterEach(() => cleanup())

describe('connection chooser', () => {
  it('is a radio group of three options, each linked to its statement', async () => {
    renderPanel()
    const group = await screen.findByRole('radiogroup', { name: CONNECTION.legend })
    const radios = screen.getAllByRole('radio', { hidden: false }).filter((r) => group.contains(r))
    expect(radios).toHaveLength(3)
    const statements = [
      CONNECTION.lan.statement,
      CONNECTION.relay.statement,
      CONNECTION.selfHosted.statement,
    ]
    radios.forEach((radio, i) => {
      const id = radio.getAttribute('aria-describedby')!
      expect(document.getElementById(id)?.textContent).toContain(statements[i])
    })
    expect((radios[0] as HTMLInputElement).checked).toBe(true)
  })

  it('opens on the connection the scenario used before', async () => {
    renderPanel({
      'facilitator:state-get': () =>
        ({
          elapsedMin: 0,
          delivered: {},
          notes: {},
          generalNotes: '',
          hotwash: [],
          decisions: [],
          live: { connection: { kind: 'relay' }, consented: ['relay'] },
        }) as never,
    })
    await waitFor(() =>
      expect(
        (screen.getByLabelText(new RegExp(CONNECTION.relay.title)) as HTMLInputElement).checked,
      ).toBe(true),
    )
  })

  it('makes no test call until Test is pressed', async () => {
    const ttx = renderPanel()
    await screen.findByRole('radiogroup')
    expect(ttx.calls('live:connection-test')).toHaveLength(0)
  })
})

describe('relay option', () => {
  it('keeps Test and Start off until the facilitator confirms what is sent', async () => {
    const ttx = renderPanel()
    fireEvent.click(await screen.findByLabelText(new RegExp(CONNECTION.relay.title)))
    expect(
      (screen.getByRole('button', { name: CONNECTION.test }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: CONNECTION.start }) as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: CONNECTION.consent.continue }))
    await waitFor(() =>
      expect(ttx.calls('live:consent')).toEqual([
        { projectPath: PROJECT, scenarioId: 'scn-1', kind: 'relay' },
      ]),
    )
    expect(ttx.calls('live:connection-test')).toHaveLength(0)
    expect(ttx.calls('live:session-start')).toHaveLength(0)
  })

  it('announces the checklist and starts once consented', async () => {
    const ttx = renderPanel({ 'live:session-start': () => ({ connected: 0 }) }, ['relay'])
    fireEvent.click(await screen.findByLabelText(new RegExp(CONNECTION.relay.title)))
    fireEvent.click(await screen.findByRole('button', { name: CONNECTION.test }))
    const results = await screen.findByRole('region', { name: CONNECTION.testHeading })
    expect(results.textContent).toContain('Passed: The server answered')
    expect(results.closest('[role="status"]')?.getAttribute('aria-live')).toBe('polite')
    fireEvent.click(screen.getByRole('button', { name: CONNECTION.start }))
    await waitFor(() => expect(ttx.calls('live:session-start')).toHaveLength(1))
    expect(ttx.calls('live:session-start')[0]).toMatchObject({ connection: { kind: 'relay' } })
  })
})

describe('your server option', () => {
  const UNTRUSTED: ConnectionTestResult = {
    ok: true,
    checks: [{ id: 'certificate', label: 'The certificate is not trusted yet', status: 'warn' }],
    server: { kind: 'self-hosted', untrusted: true, fingerprintSha256: FP },
  }

  it('shows the fingerprint in pairs and pins it only after Confirm', async () => {
    const ttx = renderPanel(
      { 'live:connection-test': () => UNTRUSTED, 'live:server-save': (r: never) => r },
      ['self-hosted'],
    )
    fireEvent.click(await screen.findByLabelText(new RegExp(CONNECTION.selfHosted.title)))
    fireEvent.change(screen.getByLabelText(CONNECTION.selfHosted.url), {
      target: { value: 'https://live.example.org' },
    })
    fireEvent.click(screen.getByRole('button', { name: CONNECTION.test }))
    await screen.findByText(CONNECTION.selfHosted.fingerprintHelp)
    const pairs = document.querySelectorAll('.live-fingerprint-view__pair')
    expect(Array.from(pairs, (pair) => pair.textContent?.trim()).slice(0, 2)).toEqual(['00', '01'])
    expect(
      (screen.getByRole('button', { name: CONNECTION.start }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(ttx.calls('live:server-save')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: CONNECTION.selfHosted.confirmFingerprint }))
    await waitFor(() =>
      expect(ttx.calls('live:server-save')).toEqual([
        { url: 'https://live.example.org', fingerprintSha256: FP },
      ]),
    )
    await screen.findByText(CONNECTION.selfHosted.pinned)
  })

  it('stores a typed key through live:server-save before starting, and never echoes a stored one', async () => {
    const ttx = renderPanel(
      {
        'live:servers-list': () => [
          { url: 'https://live.example.org', addedAt: '2026-10-01T00:00:00.000Z', hasKey: true },
        ],
        'live:server-save': (r: never) => r,
        'live:session-start': () => ({ connected: 0 }),
      },
      ['self-hosted'],
    )
    fireEvent.click(await screen.findByLabelText(new RegExp(CONNECTION.selfHosted.title)))
    fireEvent.change(await screen.findByLabelText(CONNECTION.selfHosted.remembered), {
      target: { value: 'https://live.example.org' },
    })
    const key = screen.getByLabelText(CONNECTION.selfHosted.key) as HTMLInputElement
    expect(key.type).toBe('password')
    expect(key.value).toBe('')
    expect(screen.getByText(CONNECTION.selfHosted.keyStored)).toBeTruthy()
    fireEvent.change(key, { target: { value: 'sk-new' } })
    fireEvent.click(screen.getByRole('button', { name: CONNECTION.start }))
    await waitFor(() => expect(ttx.calls('live:session-start')).toHaveLength(1))
    expect(ttx.calls('live:server-save')[0]).toMatchObject({
      url: 'https://live.example.org',
      serverKey: 'sk-new',
    })
    expect(JSON.stringify(ttx.calls('live:session-start'))).not.toContain('sk-new')
  })

  it('warns when "no TLS" is ticked', async () => {
    renderPanel({}, ['self-hosted'])
    fireEvent.click(await screen.findByLabelText(new RegExp(CONNECTION.selfHosted.title)))
    fireEvent.click(screen.getByLabelText(CONNECTION.selfHosted.noTls))
    expect(screen.getByText(CONNECTION.selfHosted.noTlsWarning)).toBeTruthy()
  })
})
