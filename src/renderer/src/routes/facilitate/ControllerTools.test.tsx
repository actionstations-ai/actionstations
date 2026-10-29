// @vitest-environment happy-dom
// Controller tools on the Facilitate page (spec 0428): clock nudges, rate and rewind, delivering
// to a chosen set of roles, the team filter, and the tracker.
import axe from 'axe-core'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { FacilitatorState } from '@shared/ipc'
import { Inject } from '@shared/schemas/inject'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import { mockTtx, projectUrl, renderAt } from '../documents/test-utils'
import FacilitatePage from './FacilitatePage'

const scenario = Scenario.parse(fixture)
const tweet = Inject.parse({
  id: 'INJ06b',
  mselRowId: 'I-06b',
  type: 'tweet',
  title: 'Viral post',
  deliveryMode: 'hand_to_role',
  fields: { metrics: { likes: 3, reposts: 1, replies: 0, views: 40 } },
  engagement: {
    curve: 'surge',
    start: { likes: 3 },
    peak: { likes: 1203 },
    peakAtMin: 20,
    replies: [
      { id: 'r1', atMin: 5, author: 'Lakeport Mom', handle: 'lakeportmom', text: 'Is it true?' },
    ],
  },
})

const delivered = (ids: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(ids).map(([id, exerciseTime]) => [
      id,
      { at: '2026-10-29T14:00:00.000Z', exerciseTime },
    ]),
  )

function setup(
  initial: Partial<FacilitatorState> = {},
  extra: Record<string, (req: never) => unknown> = {},
) {
  let saved: FacilitatorState = {
    elapsedMin: 0,
    delivered: {},
    notes: {},
    generalNotes: '',
    hotwash: [],
    decisions: [],
    ...initial,
  }
  const ttx = mockTtx({
    'scenarios:get': () => scenario,
    'injects:list': () => [tweet],
    'facilitator:state-get': () => saved,
    'facilitator:state-save': (req: { state: FacilitatorState }) => (saved = req.state),
    'facilitator:displays': () => [],
    'facilitator:present': () => undefined,
    'facilitator:present-status': () => ({ open: false }),
    'render:engagement': () => ({ path: '.cache/engagement/INJ06b/10.png', step: 10 }),
    'render:engagement-clear': () => undefined,
    ...extra,
  } as never)
  renderAt(
    projectUrl(`scenarios/${scenario.id}/facilitate`),
    '/p/:projectKey/scenarios/:scenarioId/facilitate',
    FacilitatePage,
  )
  return { ...ttx, saved: () => saved }
}

afterEach(() => cleanup())

describe('clock nudges and rate (spec 0428 FR-1, FR-2, FR-4)', () => {
  it('moves the clock with the nudge buttons and logs the change', async () => {
    const ttx = setup({ elapsedMin: 10 })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Forward 5 minutes' }))
    await waitFor(() => expect(ttx.saved().elapsedMin).toBe(15))
    expect(ttx.saved().clockLog?.at(-1)).toMatchObject({ kind: 'nudge', fromMin: 10, toMin: 15 })
  })

  it('moves the clock back one minute with [ and forward five with Shift+]', async () => {
    const ttx = setup({ elapsedMin: 10 })
    await screen.findByRole('timer', { name: 'Exercise time' })
    fireEvent.keyDown(window, { key: '[' })
    await waitFor(() => expect(ttx.saved().elapsedMin).toBe(9))
    fireEvent.keyDown(window, { key: '}', shiftKey: true })
    await waitFor(() => expect(ttx.saved().elapsedMin).toBe(14))
  })

  it('keeps a rate chosen from the menu and a faster one typed in Set time', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Rate'), '10')
    await waitFor(() => expect(ttx.saved().rate).toBe(10))
    expect(screen.getByText(/Paused at 10×/)).toBeTruthy()
    await user.type(screen.getByLabelText('Rate (0.25 to 60)'), '60')
    await user.click(screen.getByRole('button', { name: 'Set time' }))
    await waitFor(() => expect(ttx.saved().rate).toBe(60))
    await user.type(screen.getByLabelText('Rate (0.25 to 60)'), '90')
    await user.click(screen.getByRole('button', { name: 'Set time' }))
    expect(screen.getByRole('alert').textContent).toContain('0.25 to 60')
  })
})

describe('rewinding past deliveries (spec 0428 FR-3)', () => {
  const state = { elapsedMin: 80, delivered: delivered({ 'I-01': '0:15', 'I-03': '0:45' }) }

  it('lists the rows and keeps them delivered by default', async () => {
    const ttx = setup(state)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Exercise time (H:MM)'), '0:30')
    await user.click(screen.getByRole('button', { name: 'Set time' }))
    const dialog = await screen.findByRole('dialog', { name: 'Moving the clock back' })
    expect(within(dialog).getByText('I-03')).toBeTruthy()
    expect(within(dialog).queryByText('I-01')).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Keep them delivered' }))
    await waitFor(() => expect(ttx.saved().elapsedMin).toBe(30))
    expect(Object.keys(ttx.saved().delivered)).toEqual(['I-01', 'I-03'])
  })

  it('marks them not delivered and says so in the clock log', async () => {
    const ttx = setup(state)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Exercise time (H:MM)'), '0:30')
    await user.click(screen.getByRole('button', { name: 'Set time' }))
    await user.click(await screen.findByRole('button', { name: 'Mark them not delivered' }))
    await waitFor(() => expect(ttx.saved().elapsedMin).toBe(30))
    expect(Object.keys(ttx.saved().delivered)).toEqual(['I-01'])
    expect(ttx.saved().clockLog?.at(-1)?.note).toContain('not delivered: I-03')
  })

  it('does not ask when nothing was delivered after the target', async () => {
    const ttx = setup(state)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Back 5 minutes' }))
    await waitFor(() => expect(ttx.saved().elapsedMin).toBe(75))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks before a reset once rows were delivered', async () => {
    const ttx = setup(state)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Reset/ }))
    expect(ttx.saved().elapsedMin).toBe(80)
    await user.click(await screen.findByRole('button', { name: 'Reset the clock' }))
    await waitFor(() => expect(ttx.saved().elapsedMin).toBe(0))
    expect(ttx.saved().clockLog?.at(-1)?.kind).toBe('reset')
  })
})

describe('targeting (spec 0428 FR-6, FR-7)', () => {
  it('delivers to the roles picked in Deliver to… and stores them', async () => {
    const ttx = setup({ elapsedMin: 60 })
    const user = userEvent.setup()
    await user.click((await screen.findAllByRole('button', { name: /I-04/ }))[0]!)
    fireEvent.keyDown(window, { key: 'D', shiftKey: true })
    const dialog = await screen.findByRole('dialog', { name: /Deliver I-04 to/ })
    const pio = within(dialog).getByRole('checkbox', { name: 'PIO' }) as HTMLInputElement
    expect(pio.checked).toBe(true)
    await user.click(within(dialog).getByRole('checkbox', { name: 'IC' }))
    await user.click(within(dialog).getByRole('button', { name: 'Deliver to 2 roles' }))
    await waitFor(() =>
      expect(ttx.saved().delivered['I-04']?.recipients).toEqual(['pio', 'ops-director']),
    )
  })

  it('shows only the rows for a team and keeps the choice', async () => {
    setup()
    const user = userEvent.setup()
    await screen.findByRole('region', { name: 'Timeline' })
    await user.click(screen.getByRole('button', { name: 'Public Information team' }))
    const timeline = screen.getByRole('region', { name: 'Timeline' })
    expect(within(timeline).queryByRole('button', { name: /I-01\b/ })).toBeNull()
    expect(within(timeline).getAllByRole('button', { name: /I-04/ }).length).toBeGreaterThan(0)
    expect(within(timeline).getAllByRole('button', { name: /START/ }).length).toBeGreaterThan(0)
  })
})

describe('tracker (spec 0428 FR-13..17)', () => {
  const state = { elapsedMin: 40, delivered: delivered({ 'I-04': '0:20' }) }

  it('flags a delivered row nobody answered and clears it once answered', async () => {
    const ttx = setup(state)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /Tracker/ }))
    const item = await screen.findByText(/I-04 .*no response for 20 min/)
    expect(item).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Mark answered' }))
    await user.type(screen.getByLabelText('One line on the answer (optional)'), 'Called the FAA')
    await user.click(
      within(screen.getByRole('form', { name: 'Mark answered' })).getByRole('button', {
        name: 'Mark answered',
      }),
    )
    await waitFor(() =>
      expect(ttx.saved().tracker?.responses['I-04']).toMatchObject({
        note: 'Called the FAA',
        source: 'manual',
        exerciseMin: 40,
      }),
    )
    await waitFor(() => expect(screen.queryByText(/no response for/)).toBeNull())
  })

  it('offers a line to read to the table and never sends it', async () => {
    const ttx = setup(state)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /Tracker/ }))
    await user.click(await screen.findByRole('button', { name: 'Prompt the table' }))
    expect(screen.getByRole('note').textContent).toContain('what is your response')
    expect(ttx.calls('live:message-send')).toHaveLength(0)
  })

  it('adds a commitment and flags it once it comes due', async () => {
    const ttx = setup({ elapsedMin: 30 })
    const user = userEvent.setup()
    await screen.findByRole('timer', { name: 'Exercise time' })
    fireEvent.keyDown(window, { key: 'c' })
    const dialog = await screen.findByRole('dialog', { name: 'Add a commitment' })
    await user.type(within(dialog).getByLabelText('What was promised'), 'Notify the FAA')
    await user.type(within(dialog).getByLabelText('Due (optional)'), '+5')
    await user.click(within(dialog).getByRole('button', { name: 'Add commitment' }))
    await waitFor(() =>
      expect(ttx.saved().tracker?.commitments[0]).toMatchObject({
        text: 'Notify the FAA',
        dueAtMin: 35,
        status: 'open',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Forward 5 minutes' }))
    await user.click(await screen.findByRole('tab', { name: /Tracker/ }))
    const open = await screen.findByRole('list', { name: 'Open items' })
    expect(within(open).getByText(/was due at 0:35/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Kept' }))
    await waitFor(() => expect(ttx.saved().tracker?.commitments[0]?.status).toBe('kept'))
  })

  it('suggests a commitment from a note and adds nothing until accepted', async () => {
    const ttx = setup({
      elapsedMin: 30,
      notes: { 'I-01': "We'll call the county EOC within 20 minutes." },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /Tracker/ }))
    expect(
      await screen.findByText(/call the county EOC/, undefined, { timeout: 4000 }),
    ).toBeTruthy()
    await waitFor(() => expect(ttx.saved().tracker?.suggestions).toHaveLength(1))
    expect(ttx.saved().tracker?.commitments).toEqual([])
    await user.click(screen.getByRole('button', { name: /Add commitment: / }))
    await waitFor(() => expect(ttx.saved().tracker?.commitments[0]).toMatchObject({ dueAtMin: 50 }))
  })

  it('has no axe violations with the Tracker open', async () => {
    setup(state)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /Tracker/ }))
    await screen.findByText(/no response for/)
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})

describe('live session feed in the tracker (spec 0428 task 7)', () => {
  const state = { elapsedMin: 40, delivered: delivered({ 'I-04': '0:20' }) }
  const feed = (over: Record<string, unknown> = {}) => ({
    live: true,
    session: [{ kind: 'inject.release', at: Date.now() - 10 * 60_000, rowId: 'I-04' }],
    messages: [],
    ...over,
  })

  it('flags a release nobody opened on a device, and clears when it is read', async () => {
    let current = feed()
    const ttx = setup(state, { 'live:tracker-feed': () => current })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /Tracker/ }))
    const open = await screen.findByRole('list', { name: 'Open items' })
    expect(
      await within(open).findByText(/I-04 was sent to devices and nobody has opened it/),
    ).toBeTruthy()
    current = feed({
      session: [
        ...current.session,
        { kind: 'inject.receipt', at: Date.now(), rowId: 'I-04', receipt: 'read' },
      ],
    })
    ttx.emit('live:changed', { reason: 'receipts', connected: 3 })
    await waitFor(() => expect(within(open).queryByText(/nobody has opened it/)).toBeNull())
  })

  it('counts a device message on the row as the answer', async () => {
    setup(state, {
      'live:tracker-feed': () =>
        feed({
          session: [
            { kind: 'inject.receipt', at: Date.now(), rowId: 'I-04', receipt: 'read' },
            { kind: 'message.send', at: Date.now(), rowId: 'I-04', fromPlayer: true },
          ],
        }),
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /Tracker/ }))
    await screen.findByRole('list', { name: 'Open items' }).catch(() => undefined)
    expect(screen.queryByText(/I-04 .*no response for/)).toBeNull()
  })

  it('suggests a commitment from a device message once, and adds nothing until accepted', async () => {
    const ttx = setup(
      { elapsedMin: 30 },
      {
        'live:tracker-feed': () =>
          feed({
            session: [],
            messages: [
              {
                messageId: 'm1',
                text: "We'll notify the airlines within 20 minutes.",
                rowId: 'I-04',
                at: Date.now(),
              },
            ],
          }),
      },
    )
    await waitFor(() => expect(ttx.saved().tracker?.suggestions).toHaveLength(1))
    expect(ttx.saved().tracker?.suggestions[0]).toMatchObject({
      source: 'message',
      sourceRef: 'msg:m1',
      rowId: 'I-04',
    })
    expect(ttx.saved().tracker?.commitments).toEqual([])
  })

  it('sends a prompt to evaluator devices only while a session runs', async () => {
    const ttx = setup(state, {
      'live:tracker-feed': () => feed({ session: [] }),
      'live:staff-notice': () => undefined,
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /Tracker/ }))
    await user.click(await screen.findByRole('button', { name: 'Prompt the table' }))
    await user.click(await screen.findByRole('button', { name: 'Send to evaluator devices' }))
    await waitFor(() =>
      expect(ttx.calls('live:staff-notice')).toEqual([
        expect.objectContaining({ rowId: 'I-04', level: 'warning' }),
      ]),
    )
  })

  it('offers no evaluator button without a session', async () => {
    setup(state)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /Tracker/ }))
    await user.click(await screen.findByRole('button', { name: 'Prompt the table' }))
    expect(screen.queryByRole('button', { name: 'Send to evaluator devices' })).toBeNull()
  })
})

describe('engagement (spec 0428 FR-10)', () => {
  it('shows the counts and refreshes the post on screen', async () => {
    const ttx = setup({ elapsedMin: 40, delivered: delivered({ 'I-06b': '0:30' }) })
    const user = userEvent.setup()
    await user.click((await screen.findAllByRole('button', { name: /I-06b/ }))[0]!)
    const panel = await screen.findByRole('region', { name: 'Engagement for I-06b' })
    expect(within(panel).getByText('likes')).toBeTruthy()
    expect(within(panel).getByText(/1 of 1 replies out/)).toBeTruthy()
    await user.click(within(panel).getByRole('button', { name: 'Refresh on screen' }))
    await waitFor(() =>
      expect(ttx.calls('facilitator:present')).toEqual([
        expect.objectContaining({
          injectId: 'INJ06b',
          cachePath: '.cache/engagement/INJ06b/10.png',
        }),
      ]),
    )
    expect(ttx.calls('render:engagement')[0]).toMatchObject({ injectId: 'INJ06b', minutes: 10 })
  })

  it('has no axe violations on the engagement panel', async () => {
    setup({ elapsedMin: 40, delivered: delivered({ 'I-06b': '0:30' }) })
    const user = userEvent.setup()
    await user.click((await screen.findAllByRole('button', { name: /I-06b/ }))[0]!)
    await screen.findByRole('region', { name: 'Engagement for I-06b' })
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})
