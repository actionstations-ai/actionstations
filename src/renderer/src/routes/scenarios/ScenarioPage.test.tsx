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
