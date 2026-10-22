// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { StageRun } from '@shared/schemas/scenario'
import { StageTimeline } from './StageTimeline'

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

function setup(provenance: StageRun[]) {
  render(
    <StageTimeline
      projectPath="/p"
      scenarioId="s1"
      provenance={provenance}
      busy={false}
      onJob={() => undefined}
      itemLabels={{ i1: 'Inject I-01', i2: 'Inject I-02', i3: 'Inject I-03' }}
    />,
  )
  return screen.getByRole('region', { name: 'Generation stages' })
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
})
