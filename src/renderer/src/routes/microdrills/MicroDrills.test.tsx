// @vitest-environment happy-dom
// Micro-drills (#437): the run screen is keyboard-operable, announces feedback in a polite live
// region, always shows the practice notice and the hint rule, offers only the drill's prewritten
// hints, never stops at the planned time, and has no axe violations on any of its screens.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MICRO_DRILL_NOTICE,
  MicroDrill,
  MicroDrillRun,
  type MicroDrillDebrief,
} from '@shared/schemas'
import { mockTtx, renderAt, PROJECT } from '../documents/test-utils'
import { DebriefBody } from './DebriefView'
import { MicroDrillEditor } from './MicroDrillEditor'
import MicroDrillsPage from './MicroDrillsPage'
import { ruleText } from './rule-text'
import { RunView } from './RunView'
import { clockText } from './use-clock'

afterEach(cleanup)

const cite = {
  documentId: 'eop',
  documentTitle: 'EOP',
  headingPath: 'EOP › 6.4 Releases',
  page: 12,
  chunkId: 1,
}
const steps = [1, 2, 3].map((n) => ({
  id: `s${n}`,
  prompt: `Question ${n}: who may release information?`,
  expectedPoints: [
    { id: `s${n}p1`, text: 'The PIO may release information.', citation: cite },
    { id: `s${n}p2`, text: 'The Incident Commander is consulted first.', citation: cite },
  ],
  hints: [
    { level: 1, text: 'Think about who speaks for the organization.' },
    { level: 2, text: 'See the releases section.', citation: cite },
    {
      level: 3,
      text: 'The plan states the rule.',
      citation: cite,
      quote: 'The PIO may release information after consulting the IC.',
    },
  ],
  modelAnswer: 'The PIO, after consulting the Incident Commander.',
}))
const drill = MicroDrill.parse({
  id: 'd1',
  version: 1,
  title: 'Public information drill',
  status: 'ready',
  annex: { documentId: 'eop', documentTitle: 'EOP', headingPath: 'EOP › 6.4 Releases', page: 12 },
  audience: 'new_staff',
  durationMin: 15,
  mode: 'solo',
  situation: 'A reporter calls the main number.',
  objectives: [{ id: 'o1', text: 'Know who releases information.' }],
  steps,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
})
const baseRun = MicroDrillRun.parse({
  id: 'r1',
  drillId: 'd1',
  drillVersion: 1,
  drillTitle: drill.title,
  annex: drill.annex,
  participants: [{ label: 'Participant 1' }],
  assessment: 'model',
  hintRule: 'first_miss',
  startedAt: new Date().toISOString(),
  steps: steps.map((s) => ({ stepId: s.id })),
})
const attempt = (covered: string[], missing: string[], followUp?: string) => ({
  participantLabel: 'Participant 1',
  text: 'my answer',
  at: '2026-10-01T10:01:00.000Z',
  covered,
  partial: [],
  missing,
  ...(followUp ? { followUp } : {}),
})
const withAttempt = (a: ReturnType<typeof attempt>, hintsUsed: (1 | 2 | 3)[] = []) =>
  MicroDrillRun.parse({
    ...baseRun,
    steps: [
      { stepId: 's1', attempts: [a], hintsUsed, score: 0.5 },
      { stepId: 's2' },
      { stepId: 's3' },
    ],
  })

const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }
const violations = async () => (await axe.run(document.body, AXE)).violations.map((v) => v.id)

function renderRun(handlers: Parameters<typeof mockTtx>[0]) {
  const ttx = mockTtx({ 'microdrills:get': () => drill, ...handlers })
  renderAt('/x', '/x', () => (
    <RunView projectPath={PROJECT} drillId="d1" onFinished={vi.fn()} onClose={vi.fn()} />
  ))
  return ttx
}

async function start() {
  fireEvent.click(await screen.findByRole('button', { name: 'Start the drill' }))
  await screen.findByRole('heading', { name: /Question 1 of 3/ })
}

describe('RunView', () => {
  it('shows the practice notice and a labelled answer field, and has no axe violations', async () => {
    renderRun({ 'microdrills:run-start': () => baseRun })
    expect((await screen.findByRole('note')).textContent).toBe(MICRO_DRILL_NOTICE)
    await start()
    expect(screen.getByLabelText('Your answer')).toBeTruthy()
    expect(screen.getByText('A reporter calls the main number.')).toBeTruthy()
    expect(await violations()).toEqual([])
  })

  it('states the hint rule on the run screen', async () => {
    renderRun({ 'microdrills:run-start': () => baseRun })
    await start()
    expect(screen.getByText(/Hints are offered after an answer that misses a point/)).toBeTruthy()
  })

  it('states a faded rule and the withdrawn plan quote', () => {
    expect(ruleText({ hintRule: 'second_miss', withdrawnLevel3: ['s1'] })).toMatch(
      /second answer[\s\S]*1 question the plan quote \(Level 3\) is not offered/,
    )
    expect(ruleText({ hintRule: 'first_miss', withdrawnLevel3: [] })).not.toMatch(/Level 3/)
  })

  it('announces feedback in a polite live region and offers a hint without forcing it', async () => {
    const answered = withAttempt(attempt(['s1p1'], ['s1p2'], 'Who must be consulted?'))
    const ttx = renderRun({
      'microdrills:run-start': () => baseRun,
      'microdrills:answer': () => ({ run: answered, hintOffer: 1 }),
    })
    await start()
    const box = screen.getByLabelText('Your answer')
    fireEvent.change(box, { target: { value: 'The PIO.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check my answer' }))
    const status = await screen.findByText(/1 point is not fully covered yet/)
    const region = status.closest('[aria-live]')!
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.textContent).toContain('Who must be consulted?')
    expect(region.textContent).toContain('A hint is available')
    expect(ttx.calls('microdrills:hint')).toHaveLength(0)
    expect(await violations()).toEqual([])
  })

  it("shows the drill's own prewritten hint text when a hint is asked for", async () => {
    const hinted = withAttempt(attempt(['s1p1'], ['s1p2']), [1])
    const ttx = renderRun({
      'microdrills:run-start': () => baseRun,
      'microdrills:hint': () => ({
        run: hinted,
        hint: { level: 1, text: drill.steps[0]!.hints[0].text },
      }),
    })
    await start()
    fireEvent.click(screen.getByRole('button', { name: 'Show a hint (Level 1)' }))
    await screen.findByText(/Think about who speaks for the organization/)
    expect(ttx.calls('microdrills:hint')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Show a hint (Level 2)' })).toBeTruthy()
  })

  it('lets a team choose who is answering', async () => {
    const team = MicroDrill.parse({ ...drill, mode: 'team' })
    const run = MicroDrillRun.parse({
      ...baseRun,
      participants: [{ label: 'Desk' }, { label: 'Ops' }],
    })
    const ttx = mockTtx({ 'microdrills:get': () => team, 'microdrills:run-start': () => run })
    renderAt('/x', '/x', () => (
      <RunView projectPath={PROJECT} drillId="d1" onFinished={vi.fn()} onClose={vi.fn()} />
    ))
    fireEvent.click(await screen.findByRole('button', { name: 'Start the drill' }))
    expect(await screen.findByLabelText('Who is answering')).toBeTruthy()
    expect(ttx.calls('microdrills:run-start')[0]).toMatchObject({
      participants: [{ label: 'Participant 1' }, { label: 'Participant 2' }],
    })
  })

  it('does not stop or lock the drill when the planned time has passed', async () => {
    const old = MicroDrillRun.parse({
      ...baseRun,
      startedAt: new Date(Date.now() - 40 * 60_000).toISOString(),
    })
    renderRun({ 'microdrills:run-start': () => old })
    await start()
    expect(screen.getByText(/Over the planned time. Nothing stops/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'still going' } })
    expect(
      (screen.getByRole('button', { name: 'Check my answer' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('pauses and resumes the clock from the keyboard', async () => {
    renderRun({ 'microdrills:run-start': () => baseRun })
    await start()
    fireEvent.click(screen.getByRole('button', { name: 'Pause the clock' }))
    expect(screen.getByText(/\(paused\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Resume the clock' }))
    expect(screen.queryByText(/\(paused\)/)).toBeNull()
  })

  it('uses a checklist when the run says no model checked answers', async () => {
    const checklist = MicroDrillRun.parse({
      ...baseRun,
      assessment: 'checklist',
      checklistReason: 'The drafting model misjudged a test answer, so this run uses a checklist.',
    })
    renderRun({ 'microdrills:run-start': () => checklist })
    await start()
    expect(screen.getByText(/uses a checklist/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'my notes' } })
    fireEvent.click(screen.getByRole('button', { name: 'I have answered' }))
    expect(
      await screen.findByRole('group', { name: 'Tick the points your answer covered' }),
    ).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /The PIO may release information/ })).toBeTruthy()
    expect(await violations()).toEqual([])
  })
})

describe('clockText', () => {
  it('shows minutes and padded seconds', () => {
    expect(clockText(65)).toBe('1:05')
    expect(clockText(0)).toBe('0:00')
  })
})

const debrief: MicroDrillDebrief = {
  runId: 'r1',
  title: drill.title,
  annex: drill.annex,
  notice: MICRO_DRILL_NOTICE,
  evidenceNote: 'The evidence for short drills is thin.',
  startedAt: '2026-10-01T10:00:00.000Z',
  minutes: 12.5,
  plannedMinutes: 15,
  participants: ['Participant 1'],
  coverage: 0.5,
  hintsUsed: 1,
  assessment: 'model',
  steps: [
    {
      id: 's1',
      prompt: 'Question 1',
      hintsUsed: [1],
      points: [
        {
          text: 'The PIO may release information.',
          status: 'covered',
          headingPath: 'EOP › 6.4 Releases',
          page: 12,
        },
        {
          text: 'The IC is consulted first.',
          status: 'missed',
          headingPath: 'EOP › 6.4 Releases',
          page: 12,
        },
      ],
      modelAnswer: 'The PIO, after consulting the IC.',
    },
  ],
  reviewLine: 'Review: EOP › 6.4 Releases (page 12).',
}

describe('DebriefBody', () => {
  it('lists what was covered and missed with the plan section, the model answer and a review line', async () => {
    renderAt('/x', '/x', () => <DebriefBody d={debrief} />)
    expect(screen.getByText(MICRO_DRILL_NOTICE)).toBeTruthy()
    expect(screen.getByText('Missed')).toBeTruthy()
    expect(screen.getAllByText(/EOP › 6.4 Releases, page 12/).length).toBe(2)
    expect(screen.getByText(/The PIO, after consulting the IC/)).toBeTruthy()
    expect(screen.getByText('Review: EOP › 6.4 Releases (page 12).')).toBeTruthy()
    expect(screen.getByText(/evidence for short drills is thin/)).toBeTruthy()
    expect(await violations()).toEqual([])
  })
})

describe('MicroDrillsPage', () => {
  it('says plainly that the evidence is thin, lists drills and runs, and has no axe violations', async () => {
    mockTtx({
      'documents:list': () => [],
      'microdrills:list': () => [
        {
          id: 'd1',
          title: drill.title,
          status: 'ready',
          annex: drill.annex,
          durationMin: 15,
          mode: 'solo',
          lintIssues: 0,
          runs: 1,
        },
      ],
      'microdrills:runs': () => [
        { ...baseRun, finishedAt: '2026-10-01T10:15:00.000Z', coverage: 0.5 },
      ],
    })
    renderAt(`/p/x/micro-drills`, '/p/:projectKey/micro-drills', MicroDrillsPage)
    expect(await screen.findByText(drill.title, { selector: 'h3' })).toBeTruthy()
    expect(screen.getByText(/evidence for short drills with graded hints is thin/)).toBeTruthy()
    expect(await screen.findByRole('table', { name: /Finished micro-drill runs/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy()
    expect(await violations()).toEqual([])
  })

  it('shows an empty state before the first drill', async () => {
    mockTtx({
      'documents:list': () => [],
      'microdrills:list': () => [],
      'microdrills:runs': () => [],
    })
    renderAt(`/p/x/micro-drills`, '/p/:projectKey/micro-drills', MicroDrillsPage)
    expect(await screen.findByText('No drills yet')).toBeTruthy()
  })
})

describe('MicroDrillEditor', () => {
  const problem = MicroDrill.parse({
    ...drill,
    status: 'draft',
    lint: [
      {
        code: 'quote_not_verbatim',
        stepId: 's1',
        message: 'The Level 3 hint quotes words that are not in the passage it cites.',
      },
    ],
  })

  it('lists the problems, offers the override and saves the Ready request', async () => {
    const ttx = mockTtx({
      'microdrills:get': () => problem,
      'microdrills:save': (r: never) => (r as { drill: unknown }).drill as never,
    })
    renderAt('/x', '/x', () => (
      <MicroDrillEditor projectPath={PROJECT} drillId="d1" onClose={vi.fn()} />
    ))
    expect(await screen.findByText(/1 problem to fix/)).toBeTruthy()
    expect(screen.getByLabelText('Level 3 quote from the plan for question 1')).toBeTruthy()
    expect(await violations()).toEqual([])
    fireEvent.click(screen.getByRole('checkbox', { name: /Mark Ready even though/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark Ready' }))
    await waitFor(() => expect(ttx.calls('microdrills:save')).toHaveLength(1))
    expect(ttx.calls('microdrills:save')[0]).toMatchObject({
      drill: { status: 'ready', lintOverridden: true },
    })
  })
})
