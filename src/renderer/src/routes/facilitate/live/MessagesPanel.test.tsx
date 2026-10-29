// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveMessage, ThreadSummary } from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { MessagesView } from './MessagesPanel'
import { personaOptions, scriptFor, waitingLabel } from './messages-model'
import type { LiveMessages } from './use-live-messages'

afterEach(cleanup)

const scenario = {
  simcellScripts: [
    {
      rolePlayed: 'Channel 5 reporter',
      trigger: 'After the first statement',
      hardQuestions: ['Sources say ransomware. Confirm or deny?'],
      concessions: ['We will hold the hack angle 30 minutes'],
    },
  ],
  msel: [{ from: 'Gate agent' }, { from: 'channel 5 REPORTER' }, { from: '' }],
} as unknown as Scenario

const thread = (over: Partial<ThreadSummary> = {}): ThreadSummary => ({
  channel: 'role:pio',
  label: 'Public Information Officer',
  messages: 1,
  lastActivity: 1,
  lastText: 'Is it ransomware?',
  unread: 0,
  ...over,
})

const fromPlayer = (over: Partial<LiveMessage> = {}): LiveMessage => ({
  messageId: 'm1',
  channel: 'role:pio',
  at: Date.now(),
  exerciseTime: '1:42',
  from: { kind: 'client', seat: 'pio', seatLabel: 'PIO', clientRef: 'abcd1234' },
  text: 'We are investigating.',
  attachments: [],
  starred: false,
  pinned: false,
  ...over,
})

function fakeLive(over: Partial<LiveMessages> = {}): LiveMessages {
  return {
    active: true,
    threads: [thread({ waitingSince: Date.now() - 4 * 60_000 })],
    targets: [{ channel: 'role:ops', label: 'Operations Director' }],
    messages: () => [fromPlayer()],
    send: vi.fn(async () => fromPlayer()),
    open: vi.fn(async (channel: string) =>
      thread({ channel, label: 'Operations Director', messages: 0 }),
    ),
    markHandled: vi.fn(async () => undefined),
    star: vi.fn(async () => undefined),
    pin: vi.fn(async () => undefined),
    ...over,
  }
}

function Harness({ live, initial = 'role:pio' }: { live: LiveMessages; initial?: string }) {
  const [channel, setChannel] = useState<string | undefined>(initial)
  return (
    <MessagesView
      projectPath="/p"
      scenario={scenario}
      live={live}
      channel={channel}
      onChannel={setChannel}
    />
  )
}

describe('persona and script helpers', () => {
  it('lists script roles, MSEL senders and the defaults once each', () => {
    expect(personaOptions(scenario)).toEqual([
      'Channel 5 reporter',
      'Gate agent',
      'SimCell',
      'Controller',
    ])
  })

  it('finds the script for a persona ignoring case', () => {
    expect(scriptFor(scenario, 'channel 5 REPORTER')?.hardQuestions).toHaveLength(1)
    expect(scriptFor(scenario, 'Gate agent')).toBeUndefined()
  })

  it('says how long a player has waited in whole minutes', () => {
    expect(waitingLabel(0, 4 * 60_000 + 5_000)).toBe('waiting 4 min')
    expect(waitingLabel(0, 1_000)).toBe('waiting 1 min')
  })
})

describe('MessagesView', () => {
  it('says to start a session when none runs', () => {
    render(<Harness live={fakeLive({ active: false })} />)
    expect(screen.getByText(/Start a live session/)).toBeTruthy()
  })

  it('lists threads with how long the oldest player message has waited', () => {
    render(<Harness live={fakeLive()} initial="" />)
    const list = screen.getByRole('list', { name: 'Conversations' })
    expect(within(list).getByText('waiting 4 min')).toBeTruthy()
  })

  it('shows the conversation as a live log with exercise time and sender', () => {
    render(<Harness live={fakeLive()} />)
    const log = screen.getByRole('log')
    expect(log.getAttribute('aria-live')).toBe('polite')
    expect(log.textContent).toContain('PIO')
    expect(log.textContent).toContain('1:42')
  })

  it('inserts a scripted question without sending, then sends in character on Enter', () => {
    const live = fakeLive()
    render(<Harness live={live} />)
    fireEvent.change(screen.getByLabelText('Reply as'), { target: { value: 'Channel 5 reporter' } })
    fireEvent.click(screen.getByRole('button', { name: /Insert Question: Sources say ransomware/ }))
    expect(live.send).not.toHaveBeenCalled()
    const field = screen.getByLabelText('Reply as Channel 5 reporter') as HTMLTextAreaElement
    expect(field.value).toBe('Sources say ransomware. Confirm or deny?')
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(live.send).toHaveBeenCalledWith({
      channel: 'role:pio',
      text: 'Sources say ransomware. Confirm or deny?',
      persona: 'Channel 5 reporter',
      showPlayedBy: true,
    })
  })

  it('keeps the played-by caption on by default and can turn it off', () => {
    const live = fakeLive()
    render(<Harness live={live} />)
    const box = screen.getByLabelText(/played by SimCell/) as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    fireEvent.change(screen.getByLabelText('Reply as SimCell'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(live.send).toHaveBeenCalledWith(expect.objectContaining({ showPlayedBy: false }))
  })

  it('does not send an empty reply', () => {
    render(<Harness live={fakeLive()} />)
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('stars, pins and marks a player message handled', () => {
    const live = fakeLive()
    render(<Harness live={live} />)
    fireEvent.click(screen.getByRole('button', { name: 'Star' }))
    expect(live.star).toHaveBeenCalledWith('m1', true)
    fireEvent.click(screen.getByRole('button', { name: 'Pin to hot wash' }))
    expect(live.pin).toHaveBeenCalledWith('m1')
    fireEvent.click(screen.getByRole('button', { name: 'Mark handled' }))
    expect(live.markHandled).toHaveBeenCalledWith('m1')
  })

  it('filters to starred messages', () => {
    render(<Harness live={fakeLive()} />)
    fireEvent.click(screen.getByLabelText('Starred only'))
    expect(screen.getByText('No messages in this conversation yet.')).toBeTruthy()
  })

  it('starts a conversation with a role and opens it', async () => {
    const live = fakeLive({ messages: () => [] })
    render(<Harness live={live} initial="" />)
    fireEvent.change(screen.getByLabelText('Message a role, team or device'), {
      target: { value: 'role:ops' },
    })
    expect(await screen.findByRole('heading', { name: 'Operations Director' })).toBeTruthy()
    expect(live.open).toHaveBeenCalledWith('role:ops')
  })

  it('accepts a persona that is not in the list', () => {
    const live = fakeLive()
    render(<Harness live={live} />)
    fireEvent.change(screen.getByLabelText('Reply as'), { target: { value: '__other__' } })
    fireEvent.change(screen.getByLabelText('Name of who is speaking'), {
      target: { value: 'Vendor rep' },
    })
    fireEvent.change(screen.getByLabelText('Reply as Vendor rep'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(live.send).toHaveBeenCalledWith(expect.objectContaining({ persona: 'Vendor rep' }))
  })
})
