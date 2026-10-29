// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebCryptoProvider } from '../../../shared/live/crypto/webcrypto'
import { MemoryKeyValue } from '../../../shared/live/transport'
import { DEFAULT_PREFS } from '../../app/prefs'
import { PlayerSession } from '../../app/session'
import { SurveyBanner } from './SurveyBanner'
import { SurveysScreen } from './SurveysScreen'
import type { PlayerSurvey } from './surveys'

const ID = 'AAAAAAAAAAAAAAAAAAAAAA'
const OTHER = 'BBBBBBBBBBBBBBBBBBBBBB'

const survey = (over: Partial<PlayerSurvey> = {}): PlayerSurvey => ({
  surveyId: ID,
  title: 'Participant feedback',
  intro: 'Thank you for taking part.',
  questions: [
    {
      id: 'r1',
      kind: 'scale',
      text: 'The scenario was realistic (1 = Strongly disagree, 5 = Strongly agree)',
      min: 1,
      max: 5,
      required: true,
    },
    {
      id: 'c1',
      kind: 'single',
      text: 'Which part helped most?',
      required: false,
      options: [
        { id: 'a', label: 'The injects' },
        { id: 'b', label: 'The discussion' },
      ],
    },
    {
      id: 'm1',
      kind: 'multi',
      text: 'Who should have been in the room?',
      required: false,
      options: [
        { id: 'x', label: 'Legal' },
        { id: 'y', label: 'Finance' },
      ],
    },
    { id: 't1', kind: 'text', text: 'What would you change?', required: false },
  ],
  targets: ['all'],
  status: 'open',
  sent: true,
  openedAt: 1,
  ...over,
})

function setup(surveys: Record<string, PlayerSurvey>, ui: 'screen' | 'banner' = 'screen') {
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
    surveys,
  })
  const onBack = vi.fn()
  const onOpen = vi.fn()
  render(
    ui === 'screen' ? (
      <SurveysScreen session={session} onBack={onBack} />
    ) : (
      <SurveyBanner session={session} onOpen={onOpen} viewing={false} />
    ),
  )
  return { session, enqueue, onBack, onOpen }
}

afterEach(() => cleanup())

describe('SurveysScreen', () => {
  it('says so when no survey has been sent', () => {
    setup({})
    expect(screen.getByText('No survey has been sent yet.')).toBeTruthy()
  })

  it('opens the one open survey as a form and sends the answers without any sender', async () => {
    const { enqueue, session } = setup({ [ID]: survey() })
    const user = userEvent.setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Participant feedback' })).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: '4 of 5' }))
    await user.click(screen.getByRole('radio', { name: 'The discussion' }))
    await user.click(screen.getByRole('checkbox', { name: 'Legal' }))
    await user.click(screen.getByRole('checkbox', { name: 'Finance' }))
    await user.type(screen.getByLabelText(/What would you change/), 'More time')
    await user.click(screen.getByRole('button', { name: 'Send answers' }))
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'survey.response',
        to: 'controller',
        payload: {
          surveyId: ID,
          answers: [
            { questionId: 'r1', value: 4 },
            { questionId: 'c1', value: 'b' },
            { questionId: 'm1', value: ['x', 'y'] },
            { questionId: 't1', value: 'More time' },
          ],
        },
      }),
    )
    expect(session.state.surveys[ID]).toMatchObject({ sent: false })
    expect(screen.getByRole('status').textContent).toBe(
      'Your answers will be sent when you are back online.',
    )
    expect(screen.getByRole('button', { name: 'Send changed answers' })).toBeTruthy()
  })

  it('names a missing required question, focuses it and sends nothing', async () => {
    const { enqueue } = setup({ [ID]: survey() })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send answers' }))
    expect(screen.getByRole('alert').textContent).toBe('One required question has no answer.')
    expect(enqueue).not.toHaveBeenCalled()
    expect(document.activeElement?.getAttribute('name')).toBe('q-r1')
  })

  it('shows a closed survey read-only with no send button', async () => {
    setup({ [ID]: survey({ status: 'closed', mine: { r1: 5 }, sent: true }) })
    await userEvent.setup().click(screen.getByRole('button', { name: /Participant feedback/ }))
    expect(screen.queryByRole('button', { name: /Send/ })).toBeNull()
    expect(screen.getByText('This survey is closed.')).toBeTruthy()
  })

  it('lists several surveys and opens the one picked', async () => {
    setup({
      [ID]: survey(),
      [OTHER]: survey({ surveyId: OTHER, title: 'Debrief', openedAt: 2 }),
    })
    await userEvent.setup().click(screen.getByRole('button', { name: /Debrief/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Debrief' })).toBeTruthy()
  })

  it('has no axe violations as a form, with an error showing', async () => {
    setup({ [ID]: survey() })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send answers' }))
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
  })

  it('has no axe violations in the list', async () => {
    setup({ [ID]: survey(), [OTHER]: survey({ surveyId: OTHER, title: 'Debrief', openedAt: 2 }) })
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})

describe('SurveyBanner', () => {
  it('offers an open, unanswered survey and goes quiet once answered', async () => {
    const { onOpen } = setup({ [ID]: survey() }, 'banner')
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Answer the survey: Participant feedback' }))
    expect(onOpen).toHaveBeenCalledWith(ID)
    cleanup()
    setup({ [ID]: survey({ mine: { r1: 3 } }) }, 'banner')
    expect(screen.queryByRole('button')).toBeNull()
  })
})
