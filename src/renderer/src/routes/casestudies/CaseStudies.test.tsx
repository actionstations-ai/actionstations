// @vitest-environment happy-dom
// Case studies (spec 0452 NFR-3, NFR-5): the notices come first with an opt-out, every prompt type
// is a labelled native control, feedback appears in a polite live region only after answering,
// figures carry their text summary, the report names the six steps, and no screen has an axe
// violation.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlayView } from '@shared/ipc'
import { mockTtx, renderAt, PROJECT } from '../documents/test-utils'
import CaseStudiesPage from './CaseStudiesPage'
import { EducationPanel } from './EducationPanel'
import { PlayerView } from './PlayerView'

afterEach(cleanup)

const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }
const violations = async () => (await axe.run(document.body, AXE)).violations.map((v) => v.id)

const RUN = {
  id: 'run1',
  caseId: 'case1',
  mode: 'individual' as const,
  acknowledged: true,
  preview: false,
  startedAt: '2026-11-04T10:00:00.000Z',
  stageId: 's1',
  path: ['s1'],
  answers: [],
}

const opts = (ids: string[]) => ids.map((id) => ({ id, text: `Text of ${id}` }))
const STAGE: PlayView['stage'] = {
  id: 's1',
  title: 'First assessment',
  time: '08:10',
  narrative: 'You reassess the patient.',
  figures: [
    {
      name: 'monitor',
      kind: 'vitals_monitor',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
      summary: 'Heart rate 117 per minute, above its limit.',
      table: {
        caption: 'Readings',
        columns: ['Minutes', 'Heart rate'],
        rows: [
          ['0', '88'],
          ['30', '117'],
        ],
      },
    },
  ],
  tables: [],
  statements: [{ speaker: 'Patient', text: 'I feel off.' }],
  prompts: [
    {
      id: 'p1',
      step: 'recognize_cues',
      stepLabel: 'Recognize cues',
      type: 'select_cues',
      text: 'Which cues matter?',
      options: opts(['c1', 'c2', 'c3']),
    },
    {
      id: 'p2',
      step: 'analyze_cues',
      stepLabel: 'Analyze cues',
      type: 'rationale',
      text: 'What do the trends tell you?',
    },
    {
      id: 'p3',
      step: 'prioritize_hypotheses',
      stepLabel: 'Prioritize hypotheses',
      type: 'rank_hypotheses',
      text: 'Rank these.',
      options: opts(['h1', 'h2', 'h3']),
    },
    {
      id: 'p4',
      step: 'evaluate_outcomes',
      stepLabel: 'Evaluate outcomes',
      type: 'evaluate_outcome',
      text: 'Evaluate.',
      options: opts(['o1', 'o2']),
    },
  ],
}

const view = (over: Partial<PlayView> = {}): PlayView => ({
  run: RUN,
  study: {
    id: 'case1',
    title: 'Sepsis after surgery',
    patientSummary: 'A simulated patient.',
    objectives: ['Recognize cues'],
  },
  stage: STAGE,
  stageNumber: 1,
  feedback: [],
  canAdvance: false,
  finished: false,
  profile: [],
  overall: null,
  notes: {
    score: 'Scores use this app’s own scale. They are not NCLEX scores.',
    privacy: 'Your instructor can see your answers in a class session.',
  },
  ...over,
})

const caseStudy = {
  id: 'case1',
  title: 'Sepsis after surgery',
  origin: 'generated' as const,
  status: 'reviewed' as const,
  contentNotice: 'This case includes the death of a patient.',
  patient: {
    simulated: true as const,
    name: 'Marcus Delgado',
    mrn: 'SIM-1',
    age: 67,
    sex: 'M' as const,
    summary: 'A simulated patient.',
  },
  objectives: ['Recognize cues'],
  source: '',
  stages: [],
  createdAt: '2026-11-04T10:00:00.000Z',
  updatedAt: '2026-11-04T10:00:00.000Z',
}

describe('starting a case', () => {
  it('shows the notices and the content notice first, offers an opt-out and needs acknowledgement', async () => {
    const onClose = vi.fn()
    const ttx = mockTtx({
      'casestudy:get': () => caseStudy as never,
      'casestudy:run-start': () => ({ runId: 'run1' }),
    })
    renderAt('/x', '/x', () => (
      <PlayerView projectPath={PROJECT} caseId="case1" onStarted={vi.fn()} onClose={onClose} />
    ))
    await screen.findByText(/death of a patient/)
    expect(screen.getByText(/not clinical guidance/)).toBeTruthy()
    expect(screen.getByText(/not NCLEX scores/)).toBeTruthy()
    expect(screen.getByText(/Your instructor can see your answers/)).toBeTruthy()
    const start = screen.getByRole('button', { name: 'Start the case' }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    expect(await violations()).toEqual([])
    fireEvent.click(screen.getByLabelText('I have read these notices'))
    expect(start.disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Choose not to do this case' }))
    expect(onClose).toHaveBeenCalled()
    fireEvent.click(start)
    await waitFor(() => expect(ttx.calls('casestudy:run-start')).toHaveLength(1))
    expect(ttx.calls('casestudy:run-start')[0]).toMatchObject({
      acknowledged: true,
      mode: 'individual',
    })
  })
})

describe('playing a stage', () => {
  function renderStage(first: PlayView, handlers: Parameters<typeof mockTtx>[0] = {}) {
    const ttx = mockTtx({ 'casestudy:play': () => first, ...handlers })
    renderAt('/x', '/x', () => (
      <PlayerView
        projectPath={PROJECT}
        caseId="case1"
        runId="run1"
        onStarted={vi.fn()}
        onClose={vi.fn()}
      />
    ))
    return ttx
  }

  it('shows the figure with its summary, every prompt type as labelled controls, and no axe violations', async () => {
    renderStage(view())
    await screen.findByText('You reassess the patient.')
    expect(screen.getByAltText('Heart rate 117 per minute, above its limit.')).toBeTruthy()
    expect(screen.getByText('Data table')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Text of c1' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Text of o1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Move up: Text of h2' })).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Continue to the next stage' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(await violations()).toEqual([])
  })

  it('submits a selection and shows the rationale in a polite live region only after answering', async () => {
    const answered = view({
      feedback: [
        {
          promptId: 'p1',
          response: ['c1'],
          score: 0.5,
          rationale: 'The relevant cues tie to the story.',
          bestAnswer: 'Text of c1; Text of c2',
        },
      ],
    })
    const ttx = renderStage(view(), { 'casestudy:run-answer': () => answered })
    await screen.findByText('You reassess the patient.')
    expect(screen.queryByText(/relevant cues tie/)).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Text of c1' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit answer' })[0]!)
    await screen.findByText(/relevant cues tie/)
    expect(ttx.calls('casestudy:run-answer')[0]).toMatchObject({ promptId: 'p1', response: ['c1'] })
    expect(screen.getByText(/Score for this question: 50%/)).toBeTruthy()
    expect(screen.getByText(/The strongest answer/).closest('[aria-live="polite"]')).not.toBeNull()
    expect(await violations()).toEqual([])
  })

  it('moves a ranked item with the buttons and submits the new order', async () => {
    const ttx = renderStage(view(), { 'casestudy:run-answer': () => view() })
    await screen.findByText('You reassess the patient.')
    fireEvent.click(screen.getByRole('button', { name: 'Move up: Text of h2' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit answer' })[2]!)
    await waitFor(() => expect(ttx.calls('casestudy:run-answer')).toHaveLength(1))
    expect(ttx.calls('casestudy:run-answer')[0]).toMatchObject({
      promptId: 'p3',
      response: ['h2', 'h1', 'h3'],
    })
  })

  it('enables Continue when every prompt is answered', async () => {
    renderStage(view({ canAdvance: true }))
    await screen.findByText('You reassess the patient.')
    expect(
      (screen.getByRole('button', { name: 'Continue to the next stage' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('ends with the profile across the six steps, the scale note and no violations', async () => {
    const profile = [
      'Recognize cues',
      'Analyze cues',
      'Prioritize hypotheses',
      'Generate solutions',
      'Take action',
      'Evaluate outcomes',
    ].map((label, i) => ({
      step: [
        'recognize_cues',
        'analyze_cues',
        'prioritize_hypotheses',
        'generate_solutions',
        'take_action',
        'evaluate_outcomes',
      ][i]! as 'take_action',
      label,
      prompts: 1,
      earned: 0.5,
      percent: i === 3 ? null : 50,
    }))
    renderStage(view({ finished: true, overall: 50, profile }))
    await screen.findByText('Your profile across the six steps')
    expect(screen.getAllByRole('row')).toHaveLength(7)
    expect(screen.getByText('n/a')).toBeTruthy()
    expect(screen.getByText(/not NCLEX scores/)).toBeTruthy()
    expect(await violations()).toEqual([])
  })
})

describe('the library', () => {
  it('lists cases with their status, blocks play on a draft and has no axe violations', async () => {
    mockTtx({
      'casestudy:list': () => [
        {
          id: 'a',
          title: 'Reviewed case',
          origin: 'generated',
          status: 'reviewed',
          stages: 7,
          prompts: 8,
        },
        {
          id: 'b',
          title: 'Draft case',
          origin: 'imported',
          status: 'draft',
          stages: 7,
          prompts: 8,
          contentNotice: 'Includes a death.',
        },
      ],
    })
    renderAt('/x', '/x', CaseStudiesPage as never)
    await screen.findByRole('heading', { name: 'Reviewed case' })
    expect(screen.getByText('Reviewed')).toBeTruthy()
    expect(screen.getByText('Draft')).toBeTruthy()
    expect(screen.getByText(/Includes a death/)).toBeTruthy()
    const plays = screen.getAllByRole('button', { name: 'Play' }) as HTMLButtonElement[]
    expect(plays.map((b) => b.disabled)).toEqual([false, true])
    expect(screen.getByRole('button', { name: 'Preview as the author' })).toBeTruthy()
    expect(await violations()).toEqual([])
  })
})

describe('the education record', () => {
  const record = {
    id: 'r1',
    title: 'Sepsis after surgery',
    date: '2026-11-04',
    hours: 3,
    facilitator: 'A. Brooks',
    participants: 12,
    objectives: [],
    cornerstones: {
      prebrief: { done: true, by: 'A. Brooks', at: '2026-11-04T09:00:00.000Z' },
      facilitation: { done: false },
      professional_integrity: { done: false },
      debrief: { done: false },
    },
    debriefCheckIn: false,
    contentNoticeShown: false,
    createdAt: '2026-11-04T08:00:00.000Z',
    updatedAt: '2026-11-04T08:00:00.000Z',
  }

  it('says who did what, needs a name to mark a cornerstone, shows the hours note and has no axe violations', async () => {
    const ttx = mockTtx({
      'education:list': () => [record] as never,
      'education:cornerstone': () => record as never,
    })
    renderAt('/x', '/x', () => <EducationPanel projectPath={PROJECT} cases={[]} />)
    await screen.findByText('Sepsis after surgery')
    expect(screen.getByText(/state board of nursing; this app does not decide it/)).toBeTruthy()
    expect(screen.getByText('3 not recorded')).toBeTruthy()
    const mark = screen.getAllByRole('button', { name: 'Mark done' })[0] as HTMLButtonElement
    expect(mark.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Who did facilitation'), {
      target: { value: 'A. Brooks' },
    })
    expect(mark.disabled).toBe(false)
    fireEvent.click(mark)
    await waitFor(() => expect(ttx.calls('education:cornerstone')).toHaveLength(1))
    expect(ttx.calls('education:cornerstone')[0]).toMatchObject({
      cornerstone: 'facilitation',
      done: true,
      by: 'A. Brooks',
    })
    expect(await violations()).toEqual([])
  })
})
