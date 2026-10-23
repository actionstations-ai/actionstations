// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { StageRun } from '@shared/schemas/scenario'
import { StageTimeline } from './StageTimeline'
import { mockTtx, type Handlers } from '../documents/test-utils'

afterEach(() => cleanup())

const at = '2026-10-21T10:00:00.000Z'
const run = (
  stage: string,
  itemId: string | undefined,
  status: StageRun['status'],
  error?: string,
): StageRun =>
  ({
    stage,
    ...(itemId ? { itemId } : {}),
    status,
    startedAt: at,
    finishedAt: at,
    ...(error ? { error } : {}),
  }) as StageRun

function setup(provenance: StageRun[], handlers: Handlers = {}, onJob = (_id: string) => {}) {
  const ttx = mockTtx({ 'jobs:list': () => [], ...handlers })
  render(
    <StageTimeline
      projectPath="/p"
      scenarioId="s1"
      provenance={provenance}
      busy={false}
      onJob={onJob}
      itemLabels={{ i1: 'Inject I-01', i2: 'Inject I-02', i3: 'Inject I-03' }}
    />,
  )
  return Object.assign(screen.getByRole('region', { name: 'Generation stages' }), { ttx })
}

describe('StageTimeline', () => {
  it('collapses per-inject runs into groups with counts; groups with errors start open', async () => {
    const stages = setup([
      run('scenario_overview', undefined, 'ok'),
      run('inject_text', 'i1', 'ok'),
      run('inject_text', 'i2', 'error', 'Model returned invalid JSON'),
      run('inject_text', 'i3', 'stale'),
      run('media_render', 'i1', 'ok'),
      run('media_render', 'i2', 'ok'),
    ])
    const text = within(stages).getByRole('button', { name: /Inject text\s*3 injects/ })
    expect(text.getAttribute('aria-expanded')).toBe('true')
    const textGroup = text.closest('li')!
    expect(within(textGroup).getByText('1 error')).toBeTruthy()
    expect(within(textGroup).getByText('1 stale')).toBeTruthy()
    expect(within(textGroup).getByText('1 ok')).toBeTruthy()
    expect(within(textGroup).getByText('Model returned invalid JSON')).toBeTruthy()
    expect(
      within(textGroup).getByRole('button', { name: 'Re-run Inject text Inject I-02' }),
    ).toBeTruthy()

    const media = within(stages).getByRole('button', { name: /Media render\s*2 injects/ })
    expect(media.getAttribute('aria-expanded')).toBe('false')
    expect(
      within(stages).queryByRole('button', { name: 'Re-run Media render Inject I-01' }),
    ).toBeNull()
    await userEvent.click(media)
    expect(media.getAttribute('aria-expanded')).toBe('true')
    expect(
      within(stages).getByRole('button', { name: 'Re-run Media render Inject I-01' }),
    ).toBeTruthy()
    // Non-grouped stages stay plain rows.
    expect(within(stages).getByRole('button', { name: 'Re-run Scenario overview' })).toBeTruthy()
  })

  it('shows the reported cost of remote runs next to the tokens (#218)', () => {
    const remote = {
      ...run('scenario_overview', undefined, 'ok'),
      model: 'remote-large',
      inputTokens: 1200,
      outputTokens: 800,
      costUsd: 0.0432,
    }
    const local = { ...run('phase_plan', undefined, 'ok'), model: 'local-small', costUsd: 0 }
    const stages = setup([remote, local])
    expect(within(stages).getByText(/remote-large · 1,200 in \/ 800 out · \$0\.04 ·/)).toBeTruthy()
    expect(within(stages).getByText(/local-small · — · 0\.0 s/)).toBeTruthy()
    expect(within(stages).getByText('Reported cost $0.04')).toBeTruthy()
  })

  it('offers Continue for a stage an app exit left "running" (#195)', () => {
    const stages = setup([run('msel_phase', 'p1', 'running')])
    expect(within(stages).getByRole('button', { name: /Continue from failure/ })).toBeTruthy()
  })

  it('repairs the scenario in place, without AI stills unless asked (#200)', async () => {
    const started: string[] = []
    const stages = setup(
      [run('scenario_overview', undefined, 'ok')],
      { 'generate:repair': () => ({ jobId: 'R1' }) },
      (id) => started.push(id),
    )
    await userEvent.click(within(stages).getByRole('button', { name: /Repair this scenario/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Repair this scenario?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Repair' }))
    expect(stages.ttx.calls('generate:repair')).toEqual([
      { projectPath: '/p', scenarioId: 's1', aiStills: 0 },
    ])
    expect(started).toEqual(['R1'])
    const banner = await within(stages).findByRole('region', { name: 'Generation status' })
    expect(within(banner).getByText('Repairing the scenario for this scenario')).toBeTruthy()
    expect(within(stages).getByRole('button', { name: /Repair this scenario/ })).toHaveProperty(
      'disabled',
      true,
    )
  })
})
