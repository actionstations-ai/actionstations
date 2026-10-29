// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { queryClient } from '../../lib/query'
import type { ScenarioIdea } from '@shared/schemas/scenario'
import { FakeIpcError, PROJECT, mockTtx, projectUrl, type Handlers } from '../documents/test-utils'
import { draftFromIdea, emptyDraft, toBrief, validateDraft } from './brief-form'
import GeneratePage from './GeneratePage'

const IDEA: ScenarioIdea = {
  id: 'idea1',
  title: 'Silent Belts',
  hook: 'BHS sortation logic is quietly rewritten during the morning bank.',
  threat: 'Compromised vendor remote-access account',
  systemsAffected: ['BHS', 'AODB'],
  sectionsExercised: [
    {
      documentId: 'tirp',
      documentTitle: 'Terminal Incident Response Plan',
      headingPath: 'TIRP › Section 13 › 13.6 Scenario C: FIDS / BHS System Failure',
    },
  ],
  difficulty: 'advanced',
  whyItTeaches: 'Forces the manual-baggage decision under airline pressure.',
  suggestedRoles: ['Ops Director', 'IT Director'],
}

function ScenarioStub() {
  return <p>Scenario screen</p>
}

function setup(extra: Handlers = {}) {
  const ttx = mockTtx({
    'project:get': () =>
      ({
        path: PROJECT,
        project: {
          orgType: 'transit',
          defaultRoles: [{ id: 'pio', name: 'Public Information Officer' }],
        },
      }) as never,
    'generate:ideas-result': () => [],
    ...extra,
  })
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[projectUrl('generate')]}>
        <Routes>
          <Route path="/p/:projectKey/generate" element={<GeneratePage />} />
          <Route path="/p/:projectKey/scenarios/:scenarioId" element={<ScenarioStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return ttx
}

afterEach(() => cleanup())

describe('brief-form', () => {
  it('validates and converts a draft to a ScenarioBrief', () => {
    const d = { ...emptyDraft(), durationHours: '0', phaseCount: '9', startWallClock: '25:00' }
    expect(Object.keys(validateDraft(d)).sort()).toEqual([
      'durationHours',
      'phaseCount',
      'startWallClock',
      'userPrompt',
    ])
    const brief = toBrief({
      ...emptyDraft(),
      userPrompt: '  AODB tampering ',
      audience: ['Ops', ' '],
      learningObjectives: ['Go dark decision'],
    })
    expect(brief).toEqual({
      userPrompt: 'AODB tampering',
      audience: ['Ops'],
      durationHours: 4,
      phaseCount: 4,
      learningObjectives: ['Go dark decision'],
      constraints: [],
      startWallClock: '09:00',
    })
  })

  it('prefills from an idea', () => {
    const d = draftFromIdea(IDEA)
    expect(d.userPrompt).toContain('Silent Belts')
    expect(d.audience).toEqual(['Ops Director', 'IT Director'])
    expect(d.constraints).toEqual([
      'Must test TIRP › Section 13 › 13.6 Scenario C: FIDS / BHS System Failure',
    ])
    expect(d.ideaId).toBe('idea1')
  })
})

describe('GeneratePage', () => {
  it('submits the brief and opens the scenario screen', async () => {
    const ttx = setup({ 'generate:scenario': () => ({ jobId: 'J1', scenarioId: 'S1' }) })
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Threat or theme'), 'CAD/AVL tampering')
    await user.click(screen.getByRole('button', { name: '+ Public Information Officer' }))
    await user.type(screen.getByLabelText('Learning objectives'), 'Go dark{Enter}')
    await user.click(screen.getByRole('button', { name: /Generate scenario/ }))
    await screen.findByText('Scenario screen')
    expect(ttx.calls('generate:scenario')[0]).toEqual({
      projectPath: PROJECT,
      brief: {
        userPrompt: 'CAD/AVL tampering',
        audience: ['Public Information Officer'],
        durationHours: 4,
        phaseCount: 4,
        learningObjectives: ['Go dark'],
        constraints: [],
        startWallClock: '09:00',
        threatFamily: 'cyber_physical',
      },
    })
  })

  it('suggests a threat family from the brief and explains why', async () => {
    setup()
    const user = userEvent.setup()
    const group = await screen.findByRole('group', { name: 'Threat family' })
    // Transit's default family before anything is typed.
    expect(group.textContent).toMatch(/Suggested: Cyber-physical incident/)
    expect(group.textContent).toMatch(/default for Transit \(bus \/ rail\) projects/)
    await user.type(screen.getByLabelText('Threat or theme'), 'A drone hovers over the depot')
    expect(group.textContent).toMatch(/Suggested: UAS \/ drone incident/)
    expect(group.textContent).toMatch(/mentions “drone”/)
    // The suggestion plus the profile's families (transit offers all eight).
    const options = within(group)
      .getAllByRole('radio')
      .map((r) => r.closest('label')?.querySelector('.threat-choice__title')?.textContent)
    expect(options[0]).toBe('Use the suggestion')
    expect(options).toHaveLength(9)
  })

  it("sends the designer's threat family over the suggestion", async () => {
    const ttx = setup({ 'generate:scenario': () => ({ jobId: 'J1', scenarioId: 'S1' }) })
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Threat or theme'), 'A drone over the depot')
    await user.click(screen.getByRole('radio', { name: /Insider threat/ }))
    await user.click(screen.getByRole('button', { name: /Generate scenario/ }))
    await screen.findByText('Scenario screen')
    const req = ttx.calls('generate:scenario')[0] as { brief: { threatFamily: string } }
    expect(req.brief.threatFamily).toBe('insider')
  })

  it('shows field errors instead of calling generate', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Generate scenario/ }))
    expect(screen.getByText('Describe the threat or theme to exercise.')).toBeTruthy()
    expect(ttx.calls('generate:scenario')).toHaveLength(0)
  })

  it('explains a missing provider and links to Providers', async () => {
    setup({
      'generate:scenario': () => {
        throw new FakeIpcError('PROVIDER', 'No provider is routed for stage scenario_overview')
      },
    })
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Threat or theme'), 'x')
    await user.click(screen.getByRole('button', { name: /Generate scenario/ }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/No text model is set up/)
    expect(
      within(alert).getByRole('link', { name: 'Set up a provider' }).getAttribute('href'),
    ).toBe('/providers')
  })

  it('requests ideas, shows progress, then develops one into the brief', async () => {
    let ideas: ScenarioIdea[] = []
    const ttx = setup({
      'generate:ideas': () => ({ jobId: 'IDEAS1' }),
      'generate:ideas-result': () => ideas,
      'jobs:get': () => {
        throw new FakeIpcError('NOT_FOUND', 'gone')
      },
      'generate:scenario': () => ({ jobId: 'J2', scenarioId: 'S2' }),
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: 'Give me ideas' }))
    await user.type(screen.getByLabelText('Focus (optional)'), 'baggage')
    await user.clear(screen.getByLabelText('How many'))
    await user.type(screen.getByLabelText('How many'), '3')
    await user.click(screen.getByRole('button', { name: /Give me ideas/ }))
    await waitFor(() =>
      expect(ttx.calls('generate:ideas')[0]).toEqual({
        projectPath: PROJECT,
        brief: { userPrompt: 'baggage' },
        count: 3,
        fromSeams: false,
        useHazards: false,
      }),
    )
    act(() =>
      ttx.emit('job:progress', {
        jobId: 'IDEAS1',
        kind: 'ideate',
        status: 'running',
        progress: 0.5,
        message: 'Reading the TIRP',
      }),
    )
    expect(await screen.findByText('Reading the TIRP')).toBeTruthy()
    ideas = [IDEA]
    act(() => ttx.emit('job:done', { jobId: 'IDEAS1', kind: 'ideate', status: 'done' }))
    const card = (await screen.findByRole('heading', { name: 'Silent Belts' })).closest('li')!
    expect(within(card).getByText('13.6 Scenario C: FIDS / BHS System Failure')).toBeTruthy()
    expect(within(card).getByText('advanced')).toBeTruthy()

    await user.click(within(card).getByRole('button', { name: 'Develop Silent Belts' }))
    expect(screen.getByText(/Developing idea/)).toBeTruthy()
    expect((screen.getByLabelText('Threat or theme') as HTMLTextAreaElement).value).toContain(
      'Silent Belts',
    )
    await user.click(screen.getByRole('button', { name: /Generate scenario/ }))
    await screen.findByText('Scenario screen')
    const req = ttx.calls('generate:scenario')[0] as {
      idea: ScenarioIdea
      brief: { ideaId: string }
    }
    expect(req.idea.id).toBe('idea1')
    expect(req.brief.ideaId).toBe('idea1')
  })

  it('blames document search (not the text model) when embeddings fail, and can retry or cancel', async () => {
    const ttx = setup({
      'generate:ideas': () => ({ jobId: 'IDEAS2' }),
      'jobs:get': () => {
        throw new FakeIpcError('NOT_FOUND', 'gone')
      },
      'jobs:cancel': () => undefined,
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: 'Give me ideas' }))
    await user.click(screen.getByRole('button', { name: /Give me ideas/ }))
    await waitFor(() => expect(ttx.calls('generate:ideas')).toHaveLength(1))
    act(() =>
      ttx.emit('job:progress', {
        jobId: 'IDEAS2',
        kind: 'ideate',
        status: 'running',
        progress: 0.1,
        message: 'Reading the plans',
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(ttx.calls('jobs:cancel')[0]).toEqual({ jobId: 'IDEAS2' })
    act(() =>
      ttx.emit('job:done', {
        jobId: 'IDEAS2',
        kind: 'ideate',
        status: 'error',
        error:
          'Embeddings (document search): OpenAI-compatible server unreachable at http://127.0.0.1:1234: ECONNREFUSED',
      }),
    )
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Document search failed/)
    expect(alert.textContent).toMatch(/LM Studio isn't responding at http:\/\/127.0.0.1:1234/)
    expect(alert.textContent).not.toMatch(/No text model/)
    expect(within(alert).getByRole('link', { name: 'Embedding settings' })).toBeTruthy()
    await user.click(within(alert).getByRole('button', { name: /Retry/ }))
    await waitFor(() => expect(ttx.calls('generate:ideas')).toHaveLength(2))
  })
})
