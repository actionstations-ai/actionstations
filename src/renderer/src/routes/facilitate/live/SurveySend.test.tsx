// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import type { LiveSessionStatus, LiveSurveyView } from '@shared/schemas/live'
import { queryClient } from '../../../lib/query'
import { mockTtx, PROJECT } from '../../documents/test-utils'
import { SurveySend } from './SurveySend'

const QR = { size: 3, rows: ['101', '111', '000'] }
const invite = (kind: 'players' | 'staff') => ({
  kind,
  url: `https://192.168.4.20:8485/s/abc#${kind}`,
  epoch: 1,
  issuedAt: '2026-10-28T10:00:00.000Z',
  qr: QR,
})
const RUNNING = (surveyOnly: boolean): LiveSessionStatus => ({
  session: {
    id: 'c2Vzc2lvbi1pZC0wMDAwMDA',
    scenarioId: 'scn-1',
    name: 'FIDS',
    startedAt: '2026-10-28T10:00:00.000Z',
    connection: { kind: 'lan', address: '192.168.4.20', tls: 'self-signed' },
    joinUrlPublic: 'https://192.168.4.20:8485/s/x',
    attribution: 'role',
    protocolVersion: 1,
    lastIndex: 0,
    ...(surveyOnly ? { surveyOnly: true } : {}),
  },
  invites: { players: invite('players'), staff: invite('staff') },
  connected: 4,
})

const SURVEYS = [
  { id: 'FEEDBACK', title: 'Participant feedback', status: 'ready' as const },
  { id: 'DEBRIEF', title: 'Facilitator debrief', status: 'draft' as const },
  { id: 'OLD', title: 'Old survey', status: 'archived' as const },
]

const view = (over: Partial<LiveSurveyView> = {}): LiveSurveyView => ({
  deliveryId: 'AAAAAAAAAAAAAAAAAAAAAA',
  surveyId: 'FEEDBACK',
  title: 'Participant feedback',
  status: 'open',
  responses: 3,
  eligible: 5,
  targets: ['all'],
  openedAt: 1,
  ...over,
})

function mount(
  session: LiveSessionStatus,
  views: LiveSurveyView[] = [],
  extra: Record<string, (r: never) => unknown> = {},
) {
  const ttx = mockTtx({
    'live:session-status': () => session,
    'surveys:live-status': () => views,
    ...extra,
  } as never)
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <SurveySend projectPath={PROJECT} scenarioId="scn-1" surveys={SURVEYS} />
    </QueryClientProvider>,
  )
  return ttx
}

afterEach(() => cleanup())

describe('SurveySend', () => {
  it('lists surveys that can be sent, not archived ones', async () => {
    mount({ connected: 0 })
    expect(await screen.findByText('Participant feedback')).toBeTruthy()
    expect(screen.getByText('Facilitator debrief')).toBeTruthy()
    expect(screen.queryByText('Old survey')).toBeNull()
  })

  it('without a session offers to start a survey-only session and sends the survey', async () => {
    const ttx = mount({ connected: 0 }, [], {
      'live:session-start': () => RUNNING(true),
      'surveys:open-live': () => view(),
    })
    const row = (await screen.findByText('Participant feedback')).closest('li')!
    await userEvent
      .setup()
      .click(within(row).getByRole('button', { name: /Start a survey session/ }))
    await waitFor(() => expect(ttx.calls('surveys:open-live')).toHaveLength(1))
    expect(ttx.calls('live:session-start')[0]).toMatchObject({
      surveyOnly: true,
      connection: { kind: 'lan' },
    })
    expect(ttx.calls('surveys:open-live')[0]).toMatchObject({ surveyId: 'FEEDBACK' })
  })

  it('in a running session sends to devices, shows counts, and closes', async () => {
    const ttx = mount(RUNNING(false), [view()], { 'surveys:close-live': () => view() })
    const row = (await screen.findByText('Participant feedback')).closest('li')!
    expect((await within(row).findByRole('status')).textContent).toContain('3 of 5 answered')
    await userEvent.setup().click(within(row).getByRole('button', { name: 'Close survey' }))
    await waitFor(() => expect(ttx.calls('surveys:close-live')).toHaveLength(1))
    expect(ttx.calls('surveys:close-live')[0]).toMatchObject({ deliveryId: view().deliveryId })
    const other = screen.getByText('Facilitator debrief').closest('li')!
    expect(within(other).getByRole('button', { name: 'Send to devices' })).toBeTruthy()
  })

  it('a survey-only session shows the join code and can be ended', async () => {
    const ttx = mount(RUNNING(true), [view({ responses: 0, eligible: 0 })], {
      'live:session-end': () => RUNNING(true).session,
    })
    expect(await screen.findByRole('img', { name: /8485/ })).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'End survey session' }))
    await waitFor(() => expect(ttx.calls('live:session-end')).toHaveLength(1))
  })

  it('has no axe violations', async () => {
    mount(RUNNING(true), [view()])
    await screen.findByRole('img')
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})
