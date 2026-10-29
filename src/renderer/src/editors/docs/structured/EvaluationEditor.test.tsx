// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { RowCriterion } from '@shared/schemas/evaluation'
import type { Scenario } from '@shared/schemas/scenario'
import { PROJECT, SCENARIO, mockTtx, renderWithClient } from '../test-helpers'
import { knownCitations, nextTaskId } from './evaluation-rules'
import { EvaluationEditor } from './EvaluationEditor'

afterEach(() => cleanup())

function setup(scenario: Scenario = SCENARIO, handlers: Parameters<typeof mockTtx>[0] = {}) {
  const ttx = mockTtx({
    'scenarios:get': () => scenario,
    'scenarios:save': (req: { scenario: Scenario }) => req.scenario,
    'scenarios:history': () => [],
    'evaluation:criteria': (): RowCriterion[] => [
      {
        id: 'T-07',
        rowId: 'I-06',
        text: 'Decide whether to silence the PA',
        taskId: 'T-07',
        capability: 'operational_coordination',
      },
      { id: 'I-01:expected', rowId: 'I-01', text: 'Ops logs a ticket with IT.' },
    ],
    ...handlers,
  })
  renderWithClient(<EvaluationEditor projectPath={PROJECT} scenario={scenario} />)
  return { ttx, user: userEvent.setup() }
}

const guide = (name: string) => screen.getByRole('region', { name: `Evaluation guide: ${name}` })

describe('EvaluationEditor', () => {
  it('shows each objective with its capabilities and one guide per capability', () => {
    setup()
    expect(screen.getByRole('combobox', { name: 'Objective 1 capability 1' })).toHaveProperty(
      'value',
      'public_information_and_warning',
    )
    expect(screen.getByRole('combobox', { name: 'Objective 2 capability 2' })).toHaveProperty(
      'value',
      'infrastructure_systems',
    )
    for (const name of [
      'Public Information and Warning',
      'Operational Coordination',
      'Infrastructure Systems',
      'Cybersecurity',
    ])
      expect(guide(name)).toBeTruthy()
    expect(within(guide('Cybersecurity')).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole('textbox', { name: 'Task T-14' })).toHaveProperty(
      'value',
      'Notify the FBI Cyber Task Force and CISA',
    )
  })

  it('adds a capability to an objective and saves only the evaluation', async () => {
    const latest = { ...SCENARIO, title: 'Renamed elsewhere' }
    const { ttx, user } = setup(SCENARIO, { 'scenarios:get': () => latest })
    const objective = screen
      .getAllByRole('listitem')
      .find((li) => /Technical Analysis/.test(li.textContent ?? ''))!
    await user.click(within(objective).getByRole('button', { name: 'Add capability' }))
    const added = screen.getByRole('combobox', { name: 'Objective 3 capability 2' })
    await user.selectOptions(added, 'situational_assessment')
    await user.type(
      screen.getByRole('textbox', { name: 'Objective 3 capability 2 reason' }),
      'Logs tell the story',
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(ttx.calls('scenarios:save')).toHaveLength(1))
    const saved = ttx.calls('scenarios:save')[0] as { scenario: Scenario; note: string }
    expect(saved.note).toBe('Edited evaluation guides')
    expect(saved.scenario.title).toBe('Renamed elsewhere')
    expect(saved.scenario.evaluation.objectiveCapabilities).toContainEqual({
      objectiveId: 'obj-technical',
      capability: 'situational_assessment',
      why: 'Logs tell the story',
    })
    expect(saved.scenario.evaluation.eegs).toHaveLength(4)
  })

  it('edits a task, links a row and locks it; hand-written tasks start locked with a cited source', async () => {
    const { ttx, user } = setup()
    const text = screen.getByRole('textbox', { name: 'Task T-14' })
    await user.clear(text)
    await user.type(text, 'Notify the FBI Cyber Task Force within one hour')
    await user.type(screen.getByRole('textbox', { name: 'Task T-14 timing' }), 'within one hour')
    await user.type(
      screen.getByRole('combobox', { name: 'Add inject to Task T-14 linked rows' }),
      'I-13{Enter}',
    )
    await user.click(screen.getByRole('checkbox', { name: 'Keep task T-14 when regenerating' }))
    await user.click(within(guide('Cybersecurity')).getByRole('button', { name: 'Add task' }))
    const fresh = screen.getByRole('textbox', { name: 'Task T-16' })
    await user.type(fresh, 'Preserve the AODB logs before any rebuild')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(ttx.calls('scenarios:save')).toHaveLength(1))
    const saved = (ttx.calls('scenarios:save')[0] as { scenario: Scenario }).scenario
    const cyber = saved.evaluation.eegs.find((e) => e.capability === 'cybersecurity')!
    expect(cyber.criticalTasks.find((t) => t.id === 'T-14')).toMatchObject({
      task: 'Notify the FBI Cyber Task Force within one hour',
      timing: 'within one hour',
      rowIds: ['I-09', 'I-13'],
      locked: true,
    })
    const added = cyber.criticalTasks.find((t) => t.id === 'T-16')!
    expect(added).toMatchObject({ task: 'Preserve the AODB logs before any rebuild', locked: true })
    expect(added.citation.documentId).toBeTruthy()
    expect(added.citation.headingPath).toMatch(/›/)
  })

  it('adds a guide for a capability that has none and lists the derived criteria', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Add guide' }))
    expect(guide('Planning')).toBeTruthy()
    await user.click(screen.getByText(/Criteria by MSEL row/))
    const table = await screen.findByRole('table', { name: 'Criteria by MSEL row' })
    expect(within(table).getByText('Decide whether to silence the PA')).toBeTruthy()
    expect(within(table).getByText('Expected action')).toBeTruthy()
  })

  it('offers no hand-written task when the scenario cites no plan section', () => {
    const bare: Scenario = {
      ...SCENARIO,
      overview: undefined,
      msel: SCENARIO.msel.map((r) => ({ ...r, citations: [] })),
      evaluation: {
        objectiveCapabilities: [],
        eegs: [{ capability: 'planning', target: '', objectiveRefs: [], criticalTasks: [] }],
      },
    }
    setup(bare)
    expect(knownCitations(bare, bare.evaluation)).toEqual([])
    expect(screen.getByRole('button', { name: 'Add task' })).toHaveProperty('disabled', true)
    expect(screen.getByText(/A task must cite a plan section/)).toBeTruthy()
  })

  it('numbers new tasks after the highest existing id', () => {
    expect(nextTaskId(SCENARIO.evaluation.eegs)).toBe('T-16')
    expect(nextTaskId([])).toBe('T-01')
  })
})
