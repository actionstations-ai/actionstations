// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { FacilitatorState } from '@shared/ipc'
import type { Observation, RowCriterion } from '@shared/schemas/evaluation'
import { Inject } from '@shared/schemas/inject'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import { PROJECT, mockTtx, projectUrl, renderAt } from '../documents/test-utils'
import FacilitatePage from './FacilitatePage'
import { NOTE_SAVE_DELAY_MS } from './use-facilitator-state'

const scenario = Scenario.parse(fixture)
const prov = { provider: 'template', createdAt: '2026-10-21T14:00:00.000Z' }
const fids = Inject.parse({
  id: 'INJ06',
  mselRowId: 'I-06',
  type: 'fids_board',
  title: 'FIDS board shows phantom flights',
  deliveryMode: 'display_main_screen',
  assets: [
    { id: 'A06', kind: 'image', path: 'scenarios/s3/media/INJ06/A06.png', provenance: prov },
  ],
})
const memo = Inject.parse({
  id: 'INJ07',
  mselRowId: 'I-07',
  type: 'memo',
  title: 'BHS memo',
  deliveryMode: 'hand_to_role',
})

/** The criteria main derives for the rows these tests rate (evaluation:criteria). */
const CRITERIA: RowCriterion[] = [
  {
    id: 'T-07',
    rowId: 'I-06',
    text: 'Decide whether to silence the PA and take the FIDS dark',
    taskId: 'T-07',
    capability: 'operational_coordination',
    citation: {
      documentId: 'tirp',
      documentTitle: 'TIRP',
      headingPath: 'TIRP › Section 13 › 13.6 Scenario C: FIDS / BHS System Failure',
    },
  },
  { id: 'I-01:expected', rowId: 'I-01', text: 'Ops logs a ticket with IT.' },
]

function setup(initial: Partial<FacilitatorState> = {}) {
  let saved: FacilitatorState = {
    elapsedMin: 0,
    delivered: {},
    notes: {},
    generalNotes: '',
    ...initial,
  }
  let record: { formatVersion: number; observations: Observation[]; updatedAt: string } = {
    formatVersion: 1,
    observations: [],
    updatedAt: '2026-10-28T14:00:00.000Z',
  }
  const ttx = mockTtx({
    'scenarios:get': () => scenario,
    'injects:list': () => [fids, memo],
    'facilitator:state-get': () => saved,
    'facilitator:state-save': (req: { state: FacilitatorState }) => (saved = req.state),
    'evaluation:criteria': () => CRITERIA,
    'evaluation:get': () => record,
    'evaluation:observe': (req: { observation: Observation }) => {
      record = {
        ...record,
        observations: [
          ...record.observations.filter((o) => o.id !== req.observation.id),
          req.observation,
        ],
      }
      return record
    },
    'evaluation:remove': (req: { observationId: string }) => {
      record = {
        ...record,
        observations: record.observations.filter((o) => o.id !== req.observationId),
      }
      return record
    },
    'facilitator:displays': () => [
      { id: 1, label: 'Built-in', primary: true, width: 1512, height: 982 },
      { id: 2, label: 'Projector', primary: false, width: 1920, height: 1080 },
    ],
    'facilitator:present': () => undefined,
    'facilitator:close-present': () => undefined,
    'facilitator:present-status': () => ({ open: false }),
  })
  renderAt(
    projectUrl(`scenarios/${scenario.id}/facilitate`),
    '/p/:projectKey/scenarios/:scenarioId/facilitate',
    FacilitatePage,
  )
  return { ...ttx, saved: () => saved, record: () => record }
}

const lastSave = (calls: unknown[]) => (calls.at(-1) as { state: FacilitatorState }).state

afterEach(() => cleanup())

describe('FacilitatePage', () => {
  it('lists every MSEL row by phase with due highlighting from the saved clock', async () => {
    setup({ elapsedMin: 20 })
    const timeline = await screen.findByRole('region', { name: 'Timeline' })
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(scenario.msel.length)
    expect(within(timeline).getByRole('region', { name: /Phase 2: The Crisis/ })).toBeTruthy()
    expect(within(timeline).getAllByText('Due now')).toHaveLength(3)
    expect(screen.getByRole('timer', { name: 'Exercise time' }).textContent).toBe('0:20:00')
    expect(screen.getByText(/Scenario time 09:20/)).toBeTruthy()
  })

  it('Space starts the clock; N selects the next due row; D delivers and presents it', async () => {
    const ttx = setup({
      elapsedMin: 75,
      delivered: Object.fromEntries(
        ['START', 'I-01', 'I-02a', 'I-02', 'I-03', 'I-04', 'I-05', 'I-05b'].map((id) => [
          id,
          { at: '2026-10-21T14:00:00.000Z', exerciseTime: '0:00' },
        ]),
      ),
    })
    await screen.findByRole('region', { name: 'Timeline' })
    fireEvent.keyDown(window, { key: ' ' })
    await waitFor(() =>
      expect(lastSave(ttx.calls('facilitator:state-save')).runningSince).toBeTruthy(),
    )
    fireEvent.keyDown(window, { key: 'n' })
    expect(await screen.findByRole('article', { name: 'Inject I-06' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'd' })
    await waitFor(() =>
      expect(ttx.calls('facilitator:present')).toEqual([
        { projectPath: PROJECT, scenarioId: scenario.id, injectId: 'INJ06', assetId: 'A06' },
      ]),
    )
    expect(ttx.saved().delivered['I-06']?.exerciseTime).toBe('1:15')
    expect(screen.getByRole('status').textContent).toContain('I-06 delivered')
  })

  it('presents on the chosen display and shows hand-out instructions for paper injects', async () => {
    const ttx = setup({ elapsedMin: 100 })
    const user = userEvent.setup()
    await screen.findByRole('region', { name: 'Timeline' })
    await user.selectOptions(await screen.findByLabelText('Present on'), '2')
    await user.click(screen.getByRole('button', { name: 'Deliver I-06' }))
    await waitFor(() =>
      expect(ttx.calls('facilitator:present')).toEqual([
        expect.objectContaining({ injectId: 'INJ06', displayId: 2 }),
      ]),
    )
    await user.click(screen.getByRole('button', { name: 'Deliver I-07' }))
    expect(screen.getByText('Print / hand to Ops')).toBeTruthy()
    expect(ttx.calls('facilitator:present')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Undo deliver I-07' }))
    await waitFor(() => expect(ttx.saved().delivered['I-07']).toBeUndefined())
  })

  it('toggles Open presentation / Close presentation with the window state (#235)', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await screen.findByRole('region', { name: 'Timeline' })
    expect(screen.queryByRole('button', { name: /Close presentation/ })).toBeNull()
    await user.click(screen.getAllByRole('button', { name: /I-06/ })[0]!)
    await user.click(screen.getByRole('button', { name: /Open presentation/ }))
    await waitFor(() =>
      expect(ttx.calls('facilitator:present')).toEqual([
        expect.objectContaining({ injectId: 'INJ06', assetId: 'A06' }),
      ]),
    )
    act(() => ttx.emit('facilitator:present-changed', { open: true }))
    await user.click(await screen.findByRole('button', { name: /Close presentation/ }))
    expect(ttx.calls('facilitator:close-present')).toHaveLength(1)
    // Closed from anywhere (Escape on the projector): back to Open.
    act(() => ttx.emit('facilitator:present-changed', { open: false }))
    expect(await screen.findByRole('button', { name: /Open presentation/ })).toBeTruthy()
  })

  it('autosaves notes after typing pauses and lists them in the hot wash helper', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await screen.findByRole('region', { name: 'Timeline' })
    await user.click(screen.getAllByRole('button', { name: /I-09/ })[0]!)
    const before = ttx.calls('facilitator:state-save').length
    await user.type(screen.getByLabelText('Hot wash notes for I-09'), 'Found the IP')
    expect(ttx.calls('facilitator:state-save')).toHaveLength(before)
    await act(() => new Promise((r) => setTimeout(r, NOTE_SAVE_DELAY_MS + 100)))
    expect(ttx.saved().notes['I-09']).toBe('Found the IP')
    expect(ttx.calls('facilitator:state-save').length).toBe(before + 1)
    await user.click(screen.getByRole('tab', { name: 'Hot wash' }))
    const metric = screen.getByRole('article', { name: 'Operational Coordination' })
    expect(within(metric).getByText('Found the IP')).toBeTruthy()
    expect(screen.getByText(/At what point did you stop trusting the screens/)).toBeTruthy()
  })
})

describe('FacilitatePage evaluation (#421)', () => {
  it('rates a criterion of the selected inject, stores a note, and rolls it up in the hot wash', async () => {
    const ttx = setup({ elapsedMin: 75 })
    const user = userEvent.setup()
    await screen.findByRole('region', { name: 'Timeline' })
    await user.click(screen.getAllByRole('button', { name: /I-06/ })[0]!)
    await user.click(screen.getByRole('tab', { name: 'Evaluation' }))
    await user.type(screen.getByLabelText('Evaluator label (optional)'), 'Evaluator 2')
    const group = await screen.findByRole('group', {
      name: 'Rating for Decide whether to silence the PA and take the FIDS dark',
    })
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => (r as HTMLInputElement).value),
    ).toEqual(['met', 'partial', 'not_met', 'not_observed'])
    await user.click(within(group).getByRole('radio', { name: 'Partial' }))
    await waitFor(() => expect(ttx.record().observations).toHaveLength(1))
    expect(ttx.record().observations[0]).toMatchObject({
      id: 'O-I-06-T-07',
      rowId: 'I-06',
      taskId: 'T-07',
      criterionId: 'T-07',
      rating: 'partial',
      exerciseTime: '1:15',
      evaluator: 'Evaluator 2',
      source: 'facilitate',
    })
    const note = await screen.findByLabelText('Note for T-07')
    await user.type(note, 'PA silenced after 12 minutes')
    await act(() => new Promise((r) => setTimeout(r, NOTE_SAVE_DELAY_MS + 100)))
    expect(ttx.record().observations[0]?.note).toBe('PA silenced after 12 minutes')
    // No field asks for a player's name.
    expect(screen.queryByLabelText(/player/i)).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Hot wash' }))
    const capability = screen.getByRole('region', { name: 'Operational Coordination' })
    expect(within(capability).getByText('Partial 1')).toBeTruthy()
    expect(within(capability).getByText(/PA silenced after 12 minutes/)).toBeTruthy()
    expect(
      within(capability).getAllByText('13.6 Scenario C: FIDS / BHS System Failure').length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('article', { name: 'Decision Making' })).toBeTruthy()
  })

  it('rates a row no task covers by its expected action and can clear the rating', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await screen.findByRole('region', { name: 'Timeline' })
    await user.click(screen.getAllByRole('button', { name: /I-01/ })[0]!)
    await user.click(screen.getByRole('tab', { name: 'Evaluation' }))
    const group = await screen.findByRole('group', {
      name: 'Rating for Ops logs a ticket with IT.',
    })
    expect(screen.getByText('Expected action')).toBeTruthy()
    await user.click(within(group).getByRole('radio', { name: 'Met' }))
    await waitFor(() => expect(ttx.record().observations).toHaveLength(1))
    expect(ttx.record().observations[0]).toMatchObject({
      id: 'O-I-01-I-01_expected',
      rating: 'met',
    })
    await user.click(await screen.findByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(ttx.record().observations).toHaveLength(0))
  })
})
