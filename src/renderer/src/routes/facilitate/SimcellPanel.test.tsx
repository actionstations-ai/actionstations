// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import type { PersonaCard, SimcellDraft } from '@shared/schemas/persona'
import { queryClient } from '../../lib/query'
import { mockTtx, PROJECT } from '../documents/test-utils'
import { SimcellPanel } from './SimcellPanel'
import { appliedChips, ageLabel, FLAG_TITLES } from './simcell-model'

afterEach(() => cleanup())

const card: PersonaCard = {
  id: 'p1',
  displayName: 'Dana Whitlock',
  roleTitle: 'Reporter',
  organization: { name: 'Harbor Ledger', fictional: true },
  kind: 'reporter',
  register: '',
  goals: [{ id: 'g1', text: 'Publish before the evening edition.' }],
  deadlines: [{ id: 'd1', at: '1:30', wants: 'A written statement.', ifMissed: 'Publishes.' }],
  escalationRules: [],
  knowledge: { knows: [], doesNotKnow: [], mustNotReveal: [] },
  concessions: [{ id: 'c1', give: 'Holds the story.', onlyIf: 'A statement with a next update.' }],
  hardQuestions: [],
  linkedRowIds: [],
  channels: ['message'],
  voice: { postFx: ['phone'] },
}

const draft = (over: Partial<SimcellDraft> = {}): SimcellDraft => ({
  id: 'd-1',
  personaId: 'p1',
  threadId: 'role:pio',
  inReplyTo: 'm1',
  inReplyToText: 'We are looking into it.',
  trigger: 'player_message',
  text: 'We need your statement by 1:30.',
  intent: 'stall',
  applied: { goals: ['g1'], deadlines: ['d1'], rules: [], concessions: [] },
  controllerNote: 'Pushes for the statement.',
  flags: [{ code: 'AGREEABLE_DRIFT', message: 'The reply agrees but cites nothing.' }],
  providerRef: { providerId: 'p', model: 'm' },
  createdAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  status: 'queued',
  ...over,
})

const STATUS = {
  enabled: true,
  level: 'suited' as const,
  failed: [],
  live: true,
  keepRecordings: false,
}

function renderPanel(opts: { live?: boolean; drafts?: SimcellDraft[] } = {}) {
  queryClient.clear()
  const live = opts.live ?? true
  const ttx = mockTtx({
    'simcell:queue': () => ({
      drafts: opts.drafts ?? [draft()],
      waiting: [],
      status: { ...STATUS, live },
    }),
    'simcell:personas-get': () => ({ version: 1, personas: [card] }),
    'simcell:capability': () => null,
    'live:message-targets': () => [{ channel: 'role:pio', label: 'Public Information Officer' }],
    'simcell:resolve': (req: { draftId: string; action: string }) =>
      draft({ id: req.draftId, status: 'sent' }),
    'simcell:draft': () => draft({ id: 'd-2', text: 'Harder this time.' }),
    'simcell:offline-turn': () => draft({ id: 'd-off', threadId: 'offline', flags: [] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <SimcellPanel projectPath={PROJECT} scenario={{ id: 'scn-1' }} />
    </QueryClientProvider>,
  )
  return ttx
}

describe('the SimCell approval queue', () => {
  it('shows the draft with the card text it applied and its checks as words', async () => {
    renderPanel()
    expect(
      await screen.findByRole('heading', { name: /Dana Whitlock \(Harbor Ledger\)/ }),
    ).toBeTruthy()
    const applied = screen.getByRole('list', { name: 'What the draft applied' })
    expect(within(applied).getByText(/Goal: Publish before the evening edition/)).toBeTruthy()
    expect(within(applied).getByText(/Deadline: By 1:30: A written statement/)).toBeTruthy()
    const checks = screen.getByRole('list', { name: 'Checks on this draft' })
    expect(within(checks).getByText(/Check: Agrees with no reason on the card/)).toBeTruthy()
    expect(screen.getByText(/The players wrote:/)).toBeTruthy()
  })

  it('sends nothing until a button is pressed, then sends the draft as drafted', async () => {
    const ttx = renderPanel()
    await screen.findByRole('button', { name: 'Send' })
    expect(ttx.calls('simcell:resolve')).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(ttx.calls('simcell:resolve')).toHaveLength(1))
    expect(ttx.calls('simcell:resolve')[0]).toMatchObject({ draftId: 'd-1', action: 'send' })
  })

  it('turns Send into Edit and send once the text changes, and sends the edited text', async () => {
    const ttx = renderPanel()
    const box = (await screen.findByLabelText('Reply')) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'Statement by 1:45, please.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Edit and send' }))
    await waitFor(() => expect(ttx.calls('simcell:resolve')).toHaveLength(1))
    expect(ttx.calls('simcell:resolve')[0]).toMatchObject({
      action: 'edit',
      text: 'Statement by 1:45, please.',
    })
  })

  it('writes my own: clears the box and sends it as a rewrite', async () => {
    const ttx = renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Write my own' }))
    const box = screen.getByLabelText('Your own reply') as HTMLTextAreaElement
    expect(box.value).toBe('')
    fireEvent.change(box, { target: { value: 'No comment yet.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send my own' }))
    await waitFor(() => expect(ttx.calls('simcell:resolve')).toHaveLength(1))
    expect(ttx.calls('simcell:resolve')[0]).toMatchObject({
      action: 'rewrite',
      text: 'No comment yet.',
    })
  })

  it('works from the keyboard: Ctrl+Enter sends, Alt+D discards, Alt+R regenerates with the note', async () => {
    const ttx = renderPanel()
    const box = await screen.findByLabelText('Reply')
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(ttx.calls('simcell:resolve')).toHaveLength(1))
    expect(ttx.calls('simcell:resolve')[0]).toMatchObject({ action: 'send' })

    fireEvent.keyDown(box, { key: 'd', altKey: true })
    await waitFor(() => expect(ttx.calls('simcell:resolve')).toHaveLength(2))
    expect(ttx.calls('simcell:resolve')[1]).toMatchObject({ action: 'discard' })

    fireEvent.change(screen.getByLabelText('Instruction for the next draft'), {
      target: { value: 'be more hostile' },
    })
    fireEvent.keyDown(box, { key: 'r', altKey: true })
    await waitFor(() => expect(ttx.calls('simcell:draft')).toHaveLength(1))
    expect(ttx.calls('simcell:draft')[0]).toMatchObject({
      personaId: 'p1',
      replaces: 'd-1',
      instruction: 'be more hostile',
    })
  })

  it('announces a new draft in a polite live region', async () => {
    const ttx = renderPanel()
    await screen.findByRole('button', { name: 'Send' })
    const region = document.querySelector('[role="status"][aria-live="polite"]')!
    expect(region.textContent).toBe('')
    act(() => ttx.emit('simcell:draft-ready', { scenarioId: 'scn-1', draftId: 'd-9' }))
    await waitFor(() => expect(region.textContent).toMatch(/New draft reply ready/))
  })

  it('says there are no persona cards when the scenario has none', async () => {
    queryClient.clear()
    mockTtx({
      'simcell:queue': () => ({ drafts: [], waiting: [], status: STATUS }),
      'simcell:personas-get': () => ({ version: 1, personas: [] }),
    })
    render(
      <QueryClientProvider client={queryClient}>
        <SimcellPanel projectPath={PROJECT} scenario={{ id: 'scn-1' }} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText(/No persona cards yet/)).toBeTruthy()
  })
})

describe('without a live session', () => {
  it('drafts a reply to what the player said, to read aloud, and saves it only when used', async () => {
    const ttx = renderPanel({ live: false })
    fireEvent.change(await screen.findByLabelText('What the player said'), {
      target: { value: 'Can you give us until two?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Draft a reply' }))
    expect(await screen.findByRole('button', { name: 'Use this reply' })).toBeTruthy()
    expect(ttx.calls('simcell:offline-turn')[0]).toMatchObject({
      personaId: 'p1',
      playerText: 'Can you give us until two?',
    })
    expect(ttx.calls('simcell:resolve')).toEqual([])
    expect(screen.getByRole('button', { name: 'Play as voice' })).toBeTruthy()
    expect(screen.queryByLabelText('Draft replies when players write')).toBeNull()
  })
})

describe('draft helpers', () => {
  it('lists applied goals, deadlines and concessions with their text', () => {
    const chips = appliedChips(
      draft({ applied: { goals: ['g1'], deadlines: ['d1'], rules: [], concessions: ['c1'] } }),
      card,
    )
    expect(chips.map((c) => c.kind)).toEqual(['Goal', 'Deadline', 'Concession'])
    expect(chips[2]!.text).toContain('Only if: A statement with a next update.')
  })

  it('ages a message in whole minutes and names every check in words', () => {
    expect(ageLabel(0, 30_000)).toBe('just now')
    expect(ageLabel(0, 4 * 60_000 + 5_000)).toBe('4 min')
    for (const title of Object.values(FLAG_TITLES)) expect(title.length).toBeGreaterThan(5)
  })
})
