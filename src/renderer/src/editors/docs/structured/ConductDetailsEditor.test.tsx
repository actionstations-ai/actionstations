// @vitest-environment happy-dom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { Scenario } from '@shared/schemas/scenario'
import { PROJECT, SCENARIO, mockTtx, renderWithClient } from '../test-helpers'
import { ConductDetailsEditor } from './ConductDetailsEditor'
import { SitManEditor } from './SitManEditor'
import { withModule } from './sitman-module'

afterEach(() => cleanup())

function setup(ui: 'conduct' | 'sitman', scenario: Scenario = SCENARIO) {
  const ttx = mockTtx({
    'scenarios:get': () => scenario,
    'scenarios:save': (req: { scenario: Scenario }) => req.scenario,
    'scenarios:history': () => [],
  })
  renderWithClient(
    ui === 'conduct' ? (
      <ConductDetailsEditor projectPath={PROJECT} scenario={scenario} />
    ) : (
      <SitManEditor projectPath={PROJECT} scenario={scenario} />
    ),
  )
  return { ttx, user: userEvent.setup() }
}

const saved = (ttx: ReturnType<typeof mockTtx>) =>
  (ttx.calls('scenarios:save').at(-1) as { scenario: Scenario; note: string }).scenario

describe('ConductDetailsEditor (#420)', () => {
  it('saves the exercise details into scenario.conduct', async () => {
    const { ttx, user } = setup('conduct')
    await user.type(screen.getByRole('textbox', { name: 'Sponsor organization' }), 'NCRAA')
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Dana Whitfield')
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'dw@ncia.example')
    await user.click(screen.getByRole('checkbox', { name: 'Observers allowed' }))
    await user.click(screen.getByRole('button', { name: 'Add channel' }))
    await user.type(screen.getByRole('textbox', { name: 'Channel 1' }), 'Radio 4')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(ttx.calls('scenarios:save').length).toBeGreaterThan(0))
    expect(saved(ttx).conduct).toMatchObject({
      sponsor: 'NCRAA',
      director: { name: 'Dana Whitfield', email: 'dw@ncia.example' },
      observersAllowed: true,
      communications: [{ channel: 'Radio 4', purpose: '', detail: '' }],
      marking: 'EXERCISE — FOR TRAINING USE',
    })
  })

  it('seeds the standard acronyms and the role abbreviations on request', async () => {
    const { ttx, user } = setup('conduct')
    await user.click(screen.getByRole('button', { name: 'Add standard acronyms' }))
    expect(screen.getByDisplayValue('HSEEP')).toBeTruthy()
    expect(screen.getByDisplayValue('ASC')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add standard acronyms' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(ttx.calls('scenarios:save').length).toBeGreaterThan(0))
    expect(saved(ttx).conduct?.acronyms.map((a) => a.term)).toContain('MSEL')
  })

  it('says the details are never sent to a model', () => {
    setup('conduct')
    expect(screen.getByText(/never sent to a model/)).toBeTruthy()
  })
})

describe('SitManEditor (#420)', () => {
  it('shows one module per phase and adds a question with roles to a module', async () => {
    const { ttx, user } = setup('sitman')
    for (const p of SCENARIO.phases)
      expect(screen.getByRole('region', { name: `Module ${p.index + 1}: ${p.title}` })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Add question to module 2' }))
    await user.type(screen.getByRole('textbox', { name: 'Question 2.1' }), 'PIO: what now?')
    await user.click(
      screen.getByRole('group', { name: 'Question 2.1 addressed to' }).querySelector('input')!,
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(ttx.calls('scenarios:save').length).toBeGreaterThan(0))
    const sitman = saved(ttx).sitman!
    expect(sitman.modules).toHaveLength(1)
    expect(sitman.modules[0]).toMatchObject({
      phaseId: SCENARIO.phases[1]!.id,
      discussionQuestions: [{ text: 'PIO: what now?', roleIds: [SCENARIO.roles[0]!.id] }],
    })
  })

  it('offers to generate the modules with the sitman stage', () => {
    setup('sitman')
    expect(screen.getByRole('button', { name: /generate/i })).toBeTruthy()
  })

  it('keeps modules in phase order when one is added', () => {
    const phases = SCENARIO.phases
    const m = (id: string) => ({
      phaseId: id,
      narrativeMd: id,
      keyIssues: [],
      discussionQuestions: [],
    })
    const next = withModule(
      { assumptions: [], artificialities: [], modules: [m(phases[2]!.id)] },
      phases,
      m(phases[0]!.id),
    )
    expect(next.modules.map((x) => x.phaseId)).toEqual([phases[0]!.id, phases[2]!.id])
  })
})
