// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import { PROJECT, mockTtx, projectUrl, renderAt, type Handlers } from '../documents/test-utils'
import ScenarioPage from './ScenarioPage'
import ScenariosPage from './ScenariosPage'

// happy-dom's DOM breaks DOMPurify (it drops headings and keeps handlers); sanitizing is
// checked in Chromium by e2e/scenarios.spec.ts. Here we check marked escapes raw HTML.
vi.mock('dompurify', () => ({ default: { sanitize: (html: string) => html } }))

const base = Scenario.parse(fixture)
const scenario: Scenario = {
  ...base,
  documents: { handbook: 'scenarios/scenario-3/documents/handbook.md' },
  warnings: [
    { code: 'NO_CLUE', severity: 'warning', message: 'Phase 4 has no CLUE', source: 'lint' },
  ],
  provenance: [
    {
      stage: 'scenario_overview',
      startedAt: '2026-10-21T10:00:00.000Z',
      finishedAt: '2026-10-21T10:00:12.000Z',
      model: 'qwen3-30b-a3b-2507',
      inputTokens: 3200,
      outputTokens: 800,
      status: 'ok',
      repairAttempts: 0,
    },
    {
      stage: 'msel_phase',
      itemId: 'p3',
      startedAt: '2026-10-21T10:01:00.000Z',
      status: 'error',
      error: 'Model returned invalid JSON',
      repairAttempts: 2,
    },
  ],
}

function setup(extra: Handlers = {}) {
  const ttx = mockTtx({
    'scenarios:get': () => scenario,
    'jobs:list': () => [],
    'scenarios:lint': () => scenario.warnings,
    'scenarios:doc-get': (req: { kind: string }) => ({
      markdown:
        req.kind === 'handbook'
          ? '# Controller Handbook\n\n<img src=x onerror="alert(1)">\n\n| Metric | Points |\n|---|---|\n| Ops | 30 |'
          : '',
    }),
    ...extra,
  })
  renderAt(projectUrl('scenarios/scenario-3'), '/p/:projectKey/scenarios/:scenarioId', ScenarioPage)
  return ttx
}

afterEach(() => cleanup())

describe('ScenarioPage', () => {
  it('shows header, stage timeline with model/tokens and the overview', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Flight to Nowhere', level: 1 })).toBeTruthy()
    const stages = screen.getByRole('region', { name: 'Generation stages' })
    expect(within(stages).getByText('Scenario overview')).toBeTruthy()
    expect(
      within(stages).getByText(/qwen3-30b-a3b-2507 · 3,200 in \/ 800 out · 12.0 s/),
    ).toBeTruthy()
    expect(within(stages).getByText('Model returned invalid JSON')).toBeTruthy()
    expect(
      await screen.findByDisplayValue('Data Integrity, Public Trust, and Crowd Management.'),
    ).toBeTruthy()
    expect(
      screen.getAllByText('13.6 Scenario C: FIDS / BHS System Failure').length,
    ).toBeGreaterThan(0)
  })

  it('keeps stages and the generation log collapsed under Advanced information', async () => {
    setup()
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'Flight to Nowhere', level: 1 })
    const summary = screen.getByText('Advanced information')
    const details = summary.closest('details')!
    expect(details.open).toBe(false)
    // The section sits after the tabs, at the bottom of the page.
    const tablist = screen.getByRole('tablist', { name: 'Scenario sections' })
    expect(tablist.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(details.contains(screen.getByRole('region', { name: 'Generation stages' }))).toBe(true)
    await user.click(summary)
    expect(details.open).toBe(true)
  })

  it('switches to the MSEL, documents (sanitized) and warnings tabs', async () => {
    setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: 'MSEL (24)' }))
    expect(screen.getByRole('grid', { name: 'Master Scenario Events List' })).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Documents' }))
    const doc = await screen.findByRole('article', { name: 'Controller handbook' })
    expect(within(doc).getByRole('heading', { name: 'Controller Handbook' })).toBeTruthy()
    expect(within(doc).getByRole('table')).toBeTruthy()
    expect(doc.querySelector('img')).toBeNull()
    expect(doc.textContent).toContain('<img src=x onerror="alert(1)">')
    await user.click(screen.getByRole('tab', { name: 'Warnings (1)' }))
    expect(await screen.findByText('Phase 4 has no CLUE')).toBeTruthy()
  })

  it('re-runs a stage with instructions and follows the new job', async () => {
    const ttx = setup({
      'generate:rerun-stage': () => ({ jobId: 'RERUN1' }),
      'jobs:get': () => ({
        id: 'RERUN1',
        kind: 'rerun-stage',
        status: 'running',
        progress: 0.1,
        message: 'Re-running MSEL phase',
        createdAt: '2026-10-21T10:00:00.000Z',
        updatedAt: '2026-10-21T10:00:00.000Z',
        resumable: false,
      }),
      'jobs:log': () => ({ entries: [], tokens: {} }),
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^Re-run MSEL phase Phase \d: / }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), 'Add a red herring')
    await user.click(within(dialog).getByRole('button', { name: 'Re-run' }))
    await waitFor(() =>
      expect(ttx.calls('generate:rerun-stage')[0]).toEqual({
        projectPath: PROJECT,
        scenarioId: 'scenario-3',
        stage: 'msel_phase',
        itemId: 'p3',
        instructions: 'Add a red herring',
      }),
    )
    expect(
      await screen.findByText('Re-running MSEL phase', { selector: '.live-log__message' }),
    ).toBeTruthy()
  })

  it('continues from failure', async () => {
    const ttx = setup({ 'generate:continue': () => ({ jobId: 'CONT1' }) })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Continue from failure/ }))
    await waitFor(() =>
      expect(ttx.calls('generate:continue')[0]).toEqual({
        projectPath: PROJECT,
        scenarioId: 'scenario-3',
      }),
    )
  })
})

describe('ScenarioPage — guided flow (#227, #228, #229)', () => {
  const lint = [
    {
      code: 'PHASE_EMPTY',
      severity: 'error',
      message: 'Phase 2 "The Crisis" has no injects',
      source: 'lint',
    },
    {
      code: 'ROLE_NO_INJECT',
      severity: 'warning',
      message: 'Ops Director receives no inject in phase 1',
      rowId: 'I-03',
      source: 'lint',
    },
    { code: 'DENSITY_LOW', severity: 'info', message: 'Phase 4 has 1 injects', source: 'lint' },
  ] as const

  it('shows a truthful status, the next action and an Injects badge when injects are missing', async () => {
    const ttx = setup({
      'injects:list': () => [],
      'scenarios:lint': () => [...lint],
      'generate:injects': () => ({ jobId: 'INJ1' }),
    })
    const bar = await screen.findByRole('region', { name: 'Next: write 24 injects' })
    // The stored status is "ready", but nothing is written yet.
    expect(screen.getByText('Draft')).toBeTruthy()
    expect(screen.queryByText('ready')).toBeNull()
    expect(within(bar).getByText('Injects written: 0/24')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Injects 24 missing' })).toBeTruthy()
    const user = userEvent.setup()
    await user.click(within(bar).getByRole('button', { name: 'Write 24 injects' }))
    await waitFor(() =>
      expect(ttx.calls('generate:injects')[0]).toEqual({
        projectPath: PROJECT,
        scenarioId: 'scenario-3',
      }),
    )
  })

  it('counts the Warnings tab from the same lint query as its body', async () => {
    // Stored warnings: 1. Live lint: 3.
    setup({ 'injects:list': () => [], 'scenarios:lint': () => [...lint] })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: 'Warnings (3)' }))
    const list = await screen.findByRole('list', { name: 'Warnings' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })

  it('explains each warning in plain language, keeps the code and jumps to the row', async () => {
    setup({ 'injects:list': () => [], 'scenarios:lint': () => [...lint] })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /^Warnings/ }))
    const list = await screen.findByRole('list', { name: 'Warnings' })
    const items = within(list).getAllByRole('listitem')
    // Errors first, with the plain headline, the checker's detail and the code.
    expect(within(items[0]!).getByText('Must fix')).toBeTruthy()
    expect(within(items[0]!).getByText('A phase has no events for the players.')).toBeTruthy()
    expect(within(items[0]!).getByText('PHASE_EMPTY')).toBeTruthy()
    expect(
      within(items[1]!).getByText('A player role has nothing to react to in this phase.'),
    ).toBeTruthy()
    await user.click(within(items[1]!).getByRole('button', { name: 'Go to row I-03' }))
    expect(screen.getByRole('tab', { name: /^MSEL/ }).getAttribute('aria-selected')).toBe('true')
    const grid = screen.getByRole('grid', { name: 'Master Scenario Events List' })
    await waitFor(() => expect(grid.contains(document.activeElement)).toBe(true))
    expect(document.activeElement?.closest('tr')?.textContent).toContain('I-03')
  })

  it('lists live review notes and folds stale ones away under a count (#342)', async () => {
    const note = (rowId: string, stale?: boolean) => ({
      code: 'CRITIQUE',
      severity: 'warning' as const,
      message: `Row ${rowId} contradicts the plan`,
      source: 'critique' as const,
      rowId,
      ...(stale ? { stale } : {}),
    })
    const reviewed = {
      ...scenario,
      warnings: [note('I-02'), note('I-03', true), note('I-04', true)],
    }
    setup({ 'scenarios:get': () => reviewed, 'injects:list': () => [], 'scenarios:lint': () => [] })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /^Warnings/ }))
    const notes = await screen.findByRole('region', { name: 'Review notes' })
    const open = within(notes).getByRole('list', { name: 'Open review notes' })
    expect(within(open).getAllByRole('listitem')).toHaveLength(1)
    expect(within(open).getByText(/Row I-02 contradicts the plan/)).toBeTruthy()
    // The stale ones sit apart, behind a summary that counts them.
    const summary = within(notes).getByText('2 older notes on rows changed since the review')
    const details = summary.closest('details')!
    expect(details.open).toBe(false)
    const stale = within(details).getByRole('list', { name: 'Stale review notes', hidden: true })
    expect(within(stale).getAllByRole('listitem', { hidden: true })).toHaveLength(2)
    expect(within(open).queryByText(/Row I-03/)).toBeNull()
  })

  it('explains glossary terms in a popover', async () => {
    setup({ 'injects:list': () => [], 'scenarios:lint': () => [] })
    const user = userEvent.setup()
    const bar = await screen.findByRole('region', { name: /^Next:/ })
    await user.click(within(bar).getByRole('button', { name: 'What is Inject?' }))
    expect(await screen.findByText(/One message or event handed to the players/)).toBeTruthy()
  })
})

describe('ScenariosPage', () => {
  it('lists scenario cards with counts and confirms before deleting', async () => {
    const meta = {
      id: 'scenario-3',
      title: 'Flight to Nowhere',
      status: 'ready' as const,
      updatedAt: base.updatedAt,
    }
    const ttx = mockTtx({
      'scenarios:list': () => [meta],
      'scenarios:get': () => base,
      'scenarios:delete': () => undefined,
    })
    renderAt(projectUrl('scenarios'), '/p/:projectKey/scenarios', ScenariosPage)
    const card = (await screen.findByRole('heading', { name: 'Flight to Nowhere' })).closest('li')!
    expect(await within(card).findByText('4 phases · 22 injects')).toBeTruthy()
    expect(within(card).getByText('Scenario 3: Data Integrity & FIDS')).toBeTruthy()
    const user = userEvent.setup()
    await user.click(within(card).getByRole('button', { name: 'Delete Flight to Nowhere' }))
    expect(ttx.calls('scenarios:delete')).toHaveLength(0)
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }),
    )
    await waitFor(() =>
      expect(ttx.calls('scenarios:delete')[0]).toEqual({
        projectPath: PROJECT,
        scenarioId: 'scenario-3',
      }),
    )
  })

  it('shows an empty state pointing at generation', async () => {
    mockTtx({ 'scenarios:list': () => [] })
    renderAt(projectUrl('scenarios'), '/p/:projectKey/scenarios', ScenariosPage)
    expect(await screen.findByRole('region', { name: 'No scenarios yet' })).toBeTruthy()
  })
})
