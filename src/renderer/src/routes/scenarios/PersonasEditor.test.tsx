// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import type { PersonaCard, PersonasFile } from '@shared/schemas/persona'
import type { Scenario } from '@shared/schemas/scenario'
import { queryClient } from '../../lib/query'
import { mockTtx, PROJECT } from '../documents/test-utils'
import { cardProblems, mergeProposal } from './persona-model'
import { PersonasEditor } from './PersonasEditor'

afterEach(() => cleanup())

const scenario = {
  id: 'scn-1',
  msel: [{ id: 'I-01' }, { id: 'I-05' }],
  simcellScripts: [
    {
      rolePlayed: 'Local TV reporter',
      trigger: 'After the first statement',
      hardQuestions: ['Is anyone in danger?'],
      concessions: ['Hold the story for one hour'],
    },
  ],
} as unknown as Scenario

const card = (over: Partial<PersonaCard> = {}): PersonaCard => ({
  id: 'p1-local-tv-reporter',
  displayName: 'Local TV reporter',
  roleTitle: 'Local TV reporter',
  organization: { name: '', fictional: true },
  kind: 'reporter',
  register: '',
  goals: [],
  deadlines: [],
  escalationRules: [],
  knowledge: { knows: [], doesNotKnow: [], mustNotReveal: [] },
  concessions: [{ id: 'c1', give: 'Hold the story for one hour', onlyIf: '' }],
  hardQuestions: ['Is anyone in danger?'],
  linkedRowIds: [],
  channels: ['message'],
  voice: { postFx: ['phone'] },
  source: { simcellScriptIndex: 0 },
  ...over,
})

function renderEditor(saved: PersonasFile = { version: 1, personas: [] }) {
  queryClient.clear()
  const ttx = mockTtx({
    'simcell:personas-get': () => saved,
    'simcell:personas-from-scripts': () => ({ proposal: { version: 1, personas: [card()] } }),
    'simcell:personas-save': (req: { file: PersonasFile }) => req.file,
  })
  render(
    <QueryClientProvider client={queryClient}>
      <PersonasEditor projectPath={PROJECT} scenario={scenario} />
    </QueryClientProvider>,
  )
  return ttx
}

describe('the persona card editor', () => {
  it('creates a card from the SimCell scripts, says what it still needs, and saves only on request', async () => {
    const ttx = renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Create from SimCell scripts' }))
    expect(await screen.findByText(/Add at least one goal/)).toBeTruthy()
    expect(screen.getByText(/The concession .* needs a condition/)).toBeTruthy()
    expect(ttx.calls('simcell:personas-save')).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Add a goal' }))
    fireEvent.change(screen.getByLabelText('Goal 1'), {
      target: { value: 'Publish before the evening edition.' },
    })
    fireEvent.change(screen.getByLabelText('Only if'), {
      target: { value: 'A statement with a next update.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save cards' }))
    await waitFor(() => expect(ttx.calls('simcell:personas-save')).toHaveLength(1))
    const saved = (ttx.calls('simcell:personas-save')[0] as { file: PersonasFile }).file
    expect(saved.personas[0]).toMatchObject({
      goals: [{ id: 'g1', text: 'Publish before the evening edition.' }],
      concessions: [{ onlyIf: 'A statement with a next update.' }],
    })
  })

  it('has constraint fields and no personality field; register is explained as tone only', async () => {
    renderEditor({ version: 1, personas: [card()] })
    expect(await screen.findByLabelText('Register')).toBeTruthy()
    expect(screen.getByText(/It changes style only/)).toBeTruthy()
    expect(screen.queryByLabelText(/personality/i)).toBeNull()
    for (const label of ['Knows', 'Does not know', 'Must never reveal', 'Hard questions'])
      expect(screen.getByLabelText(label)).toBeTruthy()
  })

  it('keeps Save off until something changes, and the voice preview off until the cards are saved', async () => {
    renderEditor({ version: 1, personas: [card()] })
    await screen.findByLabelText('Display name')
    const save = screen.getByRole('button', { name: 'Save cards' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Preview the voice' }) as HTMLButtonElement).disabled,
    ).toBe(false)
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Dana Whitlock' } })
    expect(save.disabled).toBe(false)
    expect(
      (screen.getByRole('button', { name: 'Preview the voice' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})

describe('card helpers', () => {
  it('asks for a goal, a condition on each concession, and a limit on an attacker', () => {
    expect(cardProblems(card())).toHaveLength(2)
    const attacker = card({
      kind: 'attacker',
      goals: [{ id: 'g1', text: 'x' }],
      concessions: [],
    })
    expect(cardProblems(attacker)[0]).toMatch(/attacker should not know/)
    expect(cardProblems(card({ goals: [{ id: 'g1', text: 'x' }], concessions: [] }))).toEqual([])
  })

  it('replaces the card from the same script and keeps the others', () => {
    const mine = card({ id: 'hand-made', source: undefined, displayName: 'Mine' })
    const old = card({ displayName: 'Old' })
    const merged = mergeProposal([mine, old], [card({ displayName: 'New' })])
    expect(merged.map((c) => c.displayName)).toEqual(['Mine', 'New'])
  })
})
