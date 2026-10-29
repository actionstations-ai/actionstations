// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LanAddress, LiveSessionStatus } from '@shared/schemas/live'
import { queryClient } from '../../../lib/query'
import { mockTtx, PROJECT } from '../../documents/test-utils'
import { LivePanel } from './LivePanel'
import { qrPath } from './qr-path'
import { LIVE } from './strings'

const ADDRESSES: LanAddress[] = [
  {
    address: '192.168.4.20',
    interface: 'en0',
    kind: 'wifi',
    private: true,
    linkLocal: false,
    recommended: true,
  },
  {
    address: '10.0.0.8',
    interface: 'en5',
    kind: 'ethernet',
    private: true,
    linkLocal: false,
    recommended: false,
  },
]
const FIREWALL = {
  platform: 'darwin' as const,
  beforeStart: 'macOS will ask: accept incoming connections. Choose Allow.',
  ifDenied: 'System Settings → Network → Firewall.',
  noConnections: 'No device has connected yet. Check the firewall.',
}
const QR = {
  size: 21,
  rows: Array.from({ length: 21 }, (_, y) => (y % 2 ? '1'.repeat(21) : '0'.repeat(21))),
}
const RUNNING: LiveSessionStatus = {
  session: {
    id: 'c2Vzc2lvbi1pZC0wMDAwMDA',
    scenarioId: 'scn-1',
    name: 'FIDS failure',
    startedAt: '2026-10-28T10:00:00.000Z',
    connection: { kind: 'lan', address: '192.168.4.20', tls: 'self-signed' },
    joinUrlPublic: 'https://192.168.4.20:8485/s/c2Vzc2lvbi1pZC0wMDAwMDA',
    attribution: 'role',
    protocolVersion: 1,
    lastIndex: 0,
  },
  lan: {
    url: 'https://192.168.4.20:8485/s/c2Vzc2lvbi1pZC0wMDAwMDA',
    address: '192.168.4.20',
    port: 8485,
    tls: 'self-signed',
    fingerprintSha256: Array(32).fill('AB').join(':'),
    connected: 3,
    startedAt: '2026-10-28T10:00:00.000Z',
  },
  invites: {
    players: {
      kind: 'players',
      url: 'https://192.168.4.20:8485/s/c2Vzc2lvbi1pZC0wMDAwMDA#PLAYERS',
      epoch: 1,
      issuedAt: '2026-10-28T10:00:00.000Z',
      qr: QR,
    },
    staff: {
      kind: 'staff',
      url: 'https://192.168.4.20:8485/s/c2Vzc2lvbi1pZC0wMDAwMDA#STAFF',
      epoch: 1,
      issuedAt: '2026-10-28T10:00:00.000Z',
      qr: QR,
    },
  },
  connected: 3,
}

function renderPanel(status: LiveSessionStatus, extra: Parameters<typeof mockTtx>[0] = {}) {
  queryClient.clear()
  let current = status
  const ttx = mockTtx({
    'live:session-status': () => current,
    'live:lan-addresses': () => ADDRESSES,
    'live:firewall-guidance': () => FIREWALL,
    'live:session-start': (req: { connection: unknown; attribution: string }) => {
      current = {
        ...RUNNING,
        session: { ...RUNNING.session!, attribution: req.attribution as 'role' },
      }
      return current
    },
    'live:session-end': () => {
      current = { connected: 0 }
      return RUNNING.session!
    },
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

describe('Live tab (spec 0407 Renderer)', () => {
  it('offers the recommended address, HTTPS and role attribution, shows the firewall note, and starts', async () => {
    const ttx = renderPanel({ connected: 0 })
    const select = (await screen.findByLabelText(LIVE.addressLabel)) as HTMLSelectElement
    expect(select.value).toBe('192.168.4.20')
    expect(screen.getByText(FIREWALL.beforeStart)).toBeTruthy()
    expect((screen.getByLabelText(/HTTPS with a certificate/) as HTMLInputElement).checked).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: LIVE.start }))
    await waitFor(() => expect(ttx.calls('live:session-start')).toHaveLength(1))
    expect(ttx.calls('live:session-start')[0]).toEqual({
      projectPath: PROJECT,
      scenarioId: 'scn-1',
      connection: { kind: 'lan', address: '192.168.4.20', tls: 'self-signed' },
      attribution: 'role',
      allowPublicAddress: false,
    })
    await screen.findByText(LIVE.running, { exact: false })
  })

  it('shows the players QR and link, hides the staff link behind a button, and the status line is live', async () => {
    renderPanel(RUNNING)
    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('Listening on 192.168.4.20:8485 (HTTPS)')
    expect(status.textContent).toContain('3 devices connected')
    expect(screen.getByRole('img', { name: LIVE.qrAlt(RUNNING.invites!.players.url) })).toBeTruthy()
    expect(screen.queryByText(RUNNING.invites!.staff.url)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: LIVE.showStaff }))
    expect(screen.getByText(RUNNING.invites!.staff.url)).toBeTruthy()
    expect(screen.getByText(RUNNING.lan!.fingerprintSha256!)).toBeTruthy()
  })

  it('shows the firewall recovery text after a minute with no device, and stops after confirming', async () => {
    const ttx = renderPanel({ ...RUNNING, connected: 0, noConnectionsForMs: 61_000 })
    await screen.findByText(FIREWALL.noConnections)
    window.confirm = vi.fn(() => true)
    fireEvent.click(screen.getByRole('button', { name: LIVE.stop }))
    await waitFor(() => expect(ttx.calls('live:session-end')).toHaveLength(1))
    await screen.findByRole('button', { name: LIVE.start })
  })

  it('reports an empty network and a start failure', async () => {
    renderPanel(
      { connected: 0 },
      {
        'live:lan-addresses': () => [],
        'live:session-start': () => {
          throw new Error('port busy')
        },
      },
    )
    await screen.findByText(LIVE.noNetwork)
    expect((screen.getByRole('button', { name: LIVE.start }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('draws one path run per horizontal run of dark modules inside a quiet zone', () => {
    const path = qrPath({ size: 3, rows: ['101', '111', '000'] })
    expect(path).toBe('M4 4h1v1h-1zM6 4h1v1h-1zM4 5h3v1h-3z')
  })
})

describe('plain HTTP and public addresses need an explicit yes (#457 review M2, L3)', () => {
  it('asks before starting on plain HTTP, and does not start when the facilitator declines', async () => {
    const ttx = renderPanel({ connected: 0 })
    await screen.findByLabelText(LIVE.addressLabel)
    fireEvent.click(screen.getByLabelText(/Plain HTTP/))
    expect(screen.getByText(LIVE.httpWarning)).toBeTruthy()
    window.confirm = vi.fn(() => false)
    fireEvent.click(screen.getByRole('button', { name: LIVE.start }))
    await new Promise((r) => setTimeout(r, 20))
    expect(window.confirm).toHaveBeenCalledWith(LIVE.confirmHttp)
    expect(ttx.calls('live:session-start')).toHaveLength(0)
    window.confirm = vi.fn(() => true)
    fireEvent.click(screen.getByRole('button', { name: LIVE.start }))
    await waitFor(() => expect(ttx.calls('live:session-start')).toHaveLength(1))
    expect(ttx.calls('live:session-start')[0]).toMatchObject({
      connection: { kind: 'lan', tls: 'none' },
      allowPublicAddress: false,
    })
  })

  it('shows the plain-HTTP badge the whole time a session runs on HTTP', async () => {
    renderPanel({
      ...RUNNING,
      lan: { ...RUNNING.lan!, tls: 'none', fingerprintSha256: undefined },
      session: {
        ...RUNNING.session!,
        connection: { kind: 'lan', address: '192.168.4.20', tls: 'none' },
      },
    })
    await screen.findByText(LIVE.httpBadge)
    expect(screen.queryByText(LIVE.fingerprint)).toBeNull()
  })

  it('warns about a public address, asks before starting on it, and passes the confirmation on', async () => {
    const ttx = renderPanel(
      { connected: 0 },
      {
        'live:lan-addresses': () => [
          ...ADDRESSES,
          {
            address: '203.0.113.5',
            interface: 'eth0',
            kind: 'ethernet',
            private: false,
            linkLocal: false,
            recommended: false,
          },
        ],
      },
    )
    const select = await screen.findByLabelText(LIVE.addressLabel)
    fireEvent.change(select, { target: { value: '203.0.113.5' } })
    expect(screen.getByText(LIVE.publicAddress)).toBeTruthy()
    window.confirm = vi.fn(() => true)
    fireEvent.click(screen.getByRole('button', { name: LIVE.start }))
    await waitFor(() => expect(ttx.calls('live:session-start')).toHaveLength(1))
    expect(window.confirm).toHaveBeenCalledWith(LIVE.confirmPublic)
    expect(ttx.calls('live:session-start')[0]).toMatchObject({
      connection: { address: '203.0.113.5' },
      allowPublicAddress: true,
    })
  })
})
