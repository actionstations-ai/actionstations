// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebCryptoProvider } from '../../../shared/live/crypto/webcrypto'
import { MemoryKeyValue } from '../../../shared/live/transport'
import { DEFAULT_PREFS } from '../../app/prefs'
import { PlayerSession } from '../../app/session'
import { DrillBanner } from './DrillBanner'
import { DrillScreen } from './DrillScreen'
import type { PlayerDrill, StepState } from './drills'

const ID = 'AAAAAAAAAAAAAAAAAAAAAA'

const drill = (
  progress: Record<string, StepState> = {},
  over: Partial<PlayerDrill> = {},
): PlayerDrill => ({
  drillId: ID,
  title: 'Notify the duty manager',
  situation: 'A drone is reported near the north runway.',
  durationMin: 15,
  assessment: 'model',
  steps: [
    { id: 's1', prompt: 'Who do you notify first?' },
    { id: 's2', prompt: 'What do you write down?' },
  ],
  targets: ['all'],
  status: 'open',
  progress,
  openedAt: 1,
  ...over,
})

function setup(d: PlayerDrill, ui: 'screen' | 'banner' = 'screen') {
  const session = new PlayerSession({
    url: 'http://127.0.0.1/s/session-00000000000000#x',
    crypto: createWebCryptoProvider(),
    storage: new MemoryKeyValue(),
    connect: () => {
      throw new Error('not in this test')
    },
    announcer: { announce: () => {} },
    prefs: () => DEFAULT_PREFS,
    bundleVersion: 'test',
  })
  const enqueue = vi.fn(async () => undefined)
  Object.assign(session, { outbox: { enqueue } })
  session.store.set({
    phase: 'seated',
    connection: 'connected',
    clientId: 'playerA-00000000000000',
    seat: {
      kind: 'player',
      role: { id: 'ops', name: 'Operations', abbreviation: '', teamId: 'ops' },
    },
    drills: { [ID]: d },
  })
  const onBack = vi.fn()
  const onOpen = vi.fn()
  render(
    ui === 'screen' ? (
      <DrillScreen session={session} drillId={ID} onBack={onBack} />
    ) : (
      <DrillBanner session={session} onOpen={onOpen} viewing={false} />
    ),
  )
  return { session, enqueue, onBack, onOpen }
}

afterEach(() => cleanup())

const checked = (over: Partial<StepState> = {}): StepState => ({
  pending: false,
  hints: [],
  checked: true,
  ...over,
})

describe('DrillScreen', () => {
  it('shows the situation and the first question', () => {
    setup(drill())
    expect(screen.getByRole('heading', { level: 1, name: 'Notify the duty manager' })).toBeTruthy()
    expect(screen.getByText('A drone is reported near the north runway.')).toBeTruthy()
    expect(screen.getByText('Who do you notify first?')).toBeTruthy()
    expect(screen.getByText('Question 1 of 2')).toBeTruthy()
  })

  it('sends the answer to the controller and waits for the reply', async () => {
    const { enqueue, session } = setup(drill())
    const user = userEvent.setup()
    const check = screen.getByRole('button', { name: 'Check my answer' })
    expect((check as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByLabelText('Your answer'), 'I call the duty manager.')
    await user.click(check)
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'drill.answer',
        to: 'controller',
        payload: { drillId: ID, stepId: 's1', ask: 'check', text: 'I call the duty manager.' },
      }),
    )
    expect(session.state.drills[ID]!.progress.s1!.pending).toBe(true)
  })

  it('asks for a hint without sending any answer text', async () => {
    const { enqueue } = setup(drill())
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show a hint' }))
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { drillId: ID, stepId: 's1', ask: 'hint' } }),
    )
  })

  it('shows the reply in a live region and offers the next question once an answer was checked', async () => {
    const { session } = setup(drill())
    act(() => {
      session.store.set({
        drills: {
          [ID]: drill({
            s1: checked({
              reply: {
                drillId: ID,
                stepId: 's1',
                kind: 'result',
                covered: ['Call the duty manager'],
                left: 1,
                followUp: 'What do you write down?',
                hintOffer: 1,
              },
              hints: [{ level: 1, text: 'Think about the chain of command.' }],
            }),
          }),
        },
      })
    })
    const status = document.querySelector('.drill-reply')!
    expect(status.textContent).toContain('Call the duty manager')
    expect(status.textContent).toContain('1 point is not fully covered yet.')
    expect(status.textContent).toContain('A hint is available if you want one (Level 1).')
    expect(screen.getByText('Think about the chain of command.')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Next question' }))
    expect(screen.getByText('Question 2 of 2')).toBeTruthy()
  })

  it('in checklist mode ticks the covered points and sends them with the answer', async () => {
    const { enqueue } = setup(
      drill(
        {
          s1: {
            pending: false,
            hints: [],
            checked: false,
            reply: {
              drillId: ID,
              stepId: 's1',
              kind: 'checklist',
              points: [
                { id: 'p1', text: 'Call the duty manager' },
                { id: 'p2', text: 'Log the time' },
              ],
              modelAnswer: 'Call the duty manager and log the time.',
            },
          },
        },
        { assessment: 'checklist' },
      ),
    )
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Your answer'), 'I call them.')
    await user.click(screen.getByRole('checkbox', { name: 'Call the duty manager' }))
    await user.click(screen.getByRole('button', { name: 'Confirm the ticked points' }))
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { drillId: ID, stepId: 's1', ask: 'check', text: 'I call them.', ticked: ['p1'] },
      }),
    )
  })

  it('shows an error from the controller and disables sending once the drill is closed', () => {
    setup(
      drill(
        {
          s1: {
            pending: false,
            hints: [],
            checked: false,
            reply: { drillId: ID, stepId: 's1', kind: 'error', message: 'Write an answer first.' },
          },
        },
        { status: 'closed' },
      ),
    )
    expect(screen.getByText('Write an answer first.')).toBeTruthy()
    expect(screen.getByText('This drill is closed.')).toBeTruthy()
    const hint = screen.getByRole('button', { name: 'Show a hint' }) as HTMLButtonElement
    expect(hint.disabled).toBe(true)
  })

  it('has no axe violations', async () => {
    setup(drill({ s1: checked({ hints: [{ level: 1, text: 'Think.' }] }) }))
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
  })
})

describe('DrillBanner', () => {
  it('offers an open drill and goes quiet once it is closed', async () => {
    const { onOpen } = setup(drill(), 'banner')
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Join the drill: Notify the duty manager' }))
    expect(onOpen).toHaveBeenCalledWith(ID)
    cleanup()
    setup(drill({}, { status: 'closed' }), 'banner')
    expect(screen.queryByRole('button')).toBeNull()
  })
})
