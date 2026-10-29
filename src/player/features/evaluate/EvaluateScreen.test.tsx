// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createWebCryptoProvider } from '../../../shared/live/crypto/webcrypto'
import { MemoryKeyValue } from '../../../shared/live/transport'
import { DEFAULT_PREFS } from '../../app/prefs'
import { PlayerSession } from '../../app/session'
import { EvaluatorFeature } from './evaluator'
import { EvaluateScreen } from './EvaluateScreen'
import { EndedObservations } from './EndedObservations'
import { MemoryObservationStore } from './observations'
import type { Assignment } from './assignment'

afterEach(cleanup)

const task = (id: string, over: object = {}) => ({
  id,
  capability: 'operational_communications',
  task: `Task ${id} text`,
  citation: { documentTitle: 'TIRP', headingPath: 'TIRP › 13.6', page: 41 },
  rowIds: [] as string[],
  ...over,
})

const ASSIGNMENT: Assignment = {
  assignmentId: 'A'.repeat(22),
  revision: 1,
  label: 'Evaluator 2',
  watch: { roleIds: ['pio'], capabilities: [] },
  showExpected: true,
  tasks: [
    task('T-01', { expectedBy: 'pio', rowIds: ['I-06'] }),
    task('T-02', { capability: 'cybersecurity', expectedBy: 'it', rowIds: ['I-06'] }),
    task('T-03', { expectedBy: 'pio', rowIds: ['I-08'], timing: 'within 15 minutes' }),
  ],
}

function setup(opts: { assignment?: Assignment | undefined } = { assignment: ASSIGNMENT }) {
  const saved: Record<string, unknown>[] = []
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
  let n = 0
  const feature = new EvaluatorFeature({
    sessionId: 's',
    store: new MemoryObservationStore(),
    newId: () => `id${String(++n).padStart(20, '0')}`,
    now: () => 1_000 + n,
    exerciseTime: () => '1:20',
    enqueue: async ({ payload }) => void saved.push(payload),
  })
  session.evaluate = feature
  Object.assign(session, { exerciseTimeNow: () => '1:20' })
  if (opts.assignment) feature.applyAssign(opts.assignment)
  session.store.set({
    phase: 'seated',
    connection: 'connected',
    seat: { kind: 'evaluator' },
    info: {
      sessionName: 's',
      scenarioTitle: 't',
      attribution: 'role',
      seats: [
        { id: 'pio', name: 'Public Information Officer', kind: 'player', taken: 1 },
        { id: 'it', name: 'IT Director', kind: 'player', taken: 1 },
      ],
      features: { messages: true, votes: false, hotwash: false, surveys: false, eval: true },
    },
  })
  render(<EvaluateScreen session={session} onBack={() => {}} />)
  return { session, feature, saved }
}

const release = (rowId: string, releaseId: string, time: string, ts: number) =>
  ({
    key: `inject:${releaseId}`,
    kind: 'inject',
    type: 'inject.release',
    ts,
    exerciseTime: time,
    inject: { releaseId, rowId },
  }) as never

describe('EvaluateScreen', () => {
  it('shows the rule about names and groups tasks under capability headings with their citations', () => {
    setup({ assignment: { ...ASSIGNMENT, watch: { roleIds: [], capabilities: [] } } })
    expect(
      screen.getByText('Observations are about roles and procedures. Do not write names.'),
    ).toBeTruthy()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings.some((h) => h?.startsWith('Operational Communications'))).toBe(true)
    expect(headings.some((h) => h?.startsWith('Cybersecurity'))).toBe(true)
    expect(screen.getAllByText('TIRP › 13.6, p. 41').length).toBe(3)
    expect(screen.getAllByText('Expected by Public Information Officer').length).toBe(2)
    expect(screen.getByText('within 15 minutes')).toBeTruthy()
  })

  it('offers four ratings as radios with words, not colors alone', () => {
    setup()
    const group = screen.getByRole('group', { name: 'Rating for Task T-01 text' })
    const labels = within(group)
      .getAllByRole('radio')
      .map((r) => (r as HTMLInputElement).closest('label')?.textContent)
    expect(labels).toEqual(['✓Met', '◐Partial', '✕Not met', '–Not observed'])
  })

  it('defaults to my watch list and widens to all tasks', () => {
    setup()
    expect(screen.queryByText('Task T-02 text')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'All tasks' }))
    expect(screen.getByText('Task T-02 text')).toBeTruthy()
  })

  it('saves a rating with the clock time and the latest released inject, then enables the note', async () => {
    const { session, saved } = setup()
    act(() => session.store.set({ items: [release('I-06', 'r6', '1:15', 10)] }))
    const note = () =>
      screen.getAllByLabelText('Note (what you saw, no names)')[0] as HTMLTextAreaElement
    expect(note().disabled).toBe(true)
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Rating for Task T-01 text' })).getByRole('radio', {
        name: /Partial/,
      }),
    )
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toMatchObject({
      taskId: 'T-01',
      rating: 'partial',
      exerciseTime: '1:20',
      mselRowId: 'I-06',
      revision: 1,
      kind: 'task',
    })
    await waitFor(() => expect(note().disabled).toBe(false))
    fireEvent.change(note(), { target: { value: 'Left BHS on the same segment' } })
    fireEvent.blur(note())
    await waitFor(() => expect(saved).toHaveLength(2))
    expect(saved[1]).toMatchObject({
      revision: 2,
      notes: 'Left BHS on the same segment',
      rating: 'partial',
    })
  })

  it('lists tasks to watch after a release, until rated or dismissed', async () => {
    const { session, saved } = setup()
    expect(screen.queryByRole('heading', { name: 'Watch for' })).toBeNull()
    act(() => session.store.set({ items: [release('I-06', 'r6', '1:15', 10)] }))
    expect(screen.getByRole('heading', { name: 'Watch for' })).toBeTruthy()
    expect(screen.getByText('I-06 at 1:15: 2 tasks to watch')).toBeTruthy()
    // The live region announces the release once.
    expect(
      screen
        .getAllByRole('status')
        .some((s) => s.textContent === 'Released I-06 at 1:15. 2 tasks to watch for.'),
    ).toBe(true)
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Rating for Task T-01 text' })).getByRole('radio', {
        name: /Met/,
      }),
    )
    await waitFor(() => expect(saved).toHaveLength(1))
    await waitFor(() => expect(screen.getByText('I-06 at 1:15: 1 task to watch')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss I-06' }))
    expect(screen.queryByRole('heading', { name: 'Watch for' })).toBeNull()
  })

  it('says how many observations are waiting to send, and when all are sent', async () => {
    const { feature } = setup()
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Rating for Task T-01 text' })).getByRole('radio', {
        name: /Met/,
      }),
    )
    await waitFor(() => expect(screen.getByText('1 observation waiting to send')).toBeTruthy())
    const id = feature.state.get().observations[0]!.observationId
    await act(() => feature.markSent(id, 1))
    expect(screen.getByText('Everything is sent.')).toBeTruthy()
  })

  it('adds an observation that is not tied to a task', async () => {
    const { saved } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Add an observation not tied to a task/ }))
    fireEvent.change(screen.getByLabelText('Observation'), {
      target: { value: 'Clear hand-offs at shift change' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save observation' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toMatchObject({
      kind: 'note',
      notes: 'Clear hand-offs at shift change',
      exerciseTime: '1:20',
    })
    expect(saved[0]).not.toHaveProperty('taskId')
    expect(screen.getByText('Clear hand-offs at shift change')).toBeTruthy()
  })

  it('shows a waiting message until the assignment arrives', () => {
    setup({ assignment: undefined })
    expect(screen.getByText('Waiting for your tasks from the facilitator.')).toBeTruthy()
  })

  it('is read-only once the session has ended', async () => {
    const { feature } = setup()
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Rating for Task T-01 text' })).getByRole('radio', {
        name: /Met/,
      }),
    )
    await waitFor(() => expect(feature.state.get().observations).toHaveLength(1))
    act(() => feature.end())
    const radios = screen.getAllByRole('radio', { name: /Met/ })
    expect(radios[0]!.closest('fieldset')!.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /Add an observation/ })).toBeNull()
  })
})

describe('EndedObservations', () => {
  it('lists the observations by task with rating and note, and nothing when there are none', async () => {
    const { feature } = setup()
    cleanup()
    const empty = render(<EndedObservations feature={feature} />)
    expect(empty.container.textContent).toBe('')
    empty.unmount()
    await feature.save({
      kind: 'task',
      taskId: 'T-01',
      rating: 'not_met',
      notes: 'Late',
      exerciseTime: '1:20',
    })
    render(<EndedObservations feature={feature} />)
    expect(screen.getByText('Task T-01 text')).toBeTruthy()
    expect(screen.getByText('Late')).toBeTruthy()
    expect(screen.getByText(/Not met/)).toBeTruthy()
  })
})
