// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { TranslationStatusView } from '@shared/ipc'
import { Scenario } from '@shared/schemas'
import { queryClient } from '../../lib/query'
import { useJobsStore } from '../../state/jobs'
import { mockTtx } from '../documents/test-utils'
import { LanguagesPanel } from './LanguagesPanel'

afterEach(() => {
  cleanup()
  useJobsStore.setState({ jobs: {} })
})

const PATH = '/tmp/p.asproj'
const now = '2027-03-04T10:00:00.000Z'
const scenario = (languages?: { player: 'es'[]; controller: boolean }) =>
  Scenario.parse({
    id: 'S1',
    projectId: 'P1',
    title: 'Water',
    createdAt: now,
    updatedAt: now,
    brief: {},
    ...(languages ? { languages } : {}),
  })

const status = (over: Partial<TranslationStatusView> = {}): TranslationStatusView => ({
  languages: { player: ['es'], controller: false },
  items: [
    { kind: 'doc', id: 'briefing', label: 'Player Briefing Packet', status: 'machine', flags: [] },
    { kind: 'inject', id: 'i1', label: 'I-04: Post', status: 'reviewed', flags: [] },
    { kind: 'inject', id: 'i2', label: 'I-05: Memo', status: 'missing', flags: [] },
    {
      kind: 'inject',
      id: 'i3',
      label: 'I-06: Notice',
      status: 'stale',
      flags: ['Expected "EJERCICIO" for "EXERCISE"'],
    },
  ],
  route: { providerLabel: 'LM Studio', model: 'qwen', cloud: false },
  glossary: [{ term: 'EXERCISE', translation: 'EJERCICIO' }],
  ...over,
})

function setup(s: TranslationStatusView, sc = scenario({ player: ['es'], controller: false })) {
  const ttx = mockTtx({
    'translate:status': () => s,
    'translate:run': () => ({ jobId: 'job1' }),
    'translate:accept': () => ({ accepted: 1 }),
    'translate:set-languages': () => undefined,
  })
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LanguagesPanel projectPath={PATH} scenario={sc} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return ttx
}

describe('LanguagesPanel (spec 0435)', () => {
  it('lists every item with its review status and names the provider before Translate runs', async () => {
    setup(status())
    const table = await screen.findByRole('table', { name: /translated items/i })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]?.textContent)).toEqual([
      'Needs review',
      'Reviewed',
      'Not translated',
      'English changed',
    ])
    expect(screen.getByText('LM Studio')).toBeTruthy()
    expect(screen.getByText(/It runs on this computer/)).toBeTruthy()
    expect(screen.getByText('Expected "EJERCICIO" for "EXERCISE"')).toBeTruthy()
    expect(screen.getByText('3 of 4 items need review before export')).toBeTruthy()
  })

  it('warns when the translation provider is in the cloud', async () => {
    setup(status({ route: { providerLabel: 'Cloud model', cloud: true } }))
    expect((await screen.findByText(/the text leaves this computer/)).textContent).toContain(
      'cloud',
    )
  })

  it('starts the translation job', async () => {
    const ttx = setup(status())
    await userEvent.click(await screen.findByRole('button', { name: 'Translate' }))
    await waitFor(() => expect(ttx.calls('translate:run')).toHaveLength(1))
    expect(ttx.calls('translate:run')[0]).toMatchObject({
      projectPath: PATH,
      scenarioId: 'S1',
      lang: 'es',
    })
  })

  it('retranslates one item', async () => {
    const ttx = setup(status())
    await userEvent.click(await screen.findByRole('button', { name: 'Retranslate I-05: Memo' }))
    await waitFor(() => expect(ttx.calls('translate:run')).toHaveLength(1))
    expect(ttx.calls('translate:run')[0]).toMatchObject({
      items: [{ kind: 'inject', id: 'i2' }],
      retranslate: true,
    })
  })

  it('accepts every item that can be accepted', async () => {
    const ttx = setup(status())
    await userEvent.click(
      await screen.findByRole('button', { name: 'Accept all in this scenario' }),
    )
    await waitFor(() => expect(ttx.calls('translate:accept')).toHaveLength(1))
  })

  it('cannot translate when no text model is set', async () => {
    setup(status({ route: null }))
    expect(await screen.findByText(/No text model is set/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Translate' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('offers only the switch while Spanish is off', async () => {
    const ttx = setup(status(), scenario())
    const box = (await screen.findByRole('checkbox', {
      name: /Spanish \(US\)/,
    })) as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(screen.queryByRole('button', { name: 'Translate' })).toBeNull()
    await userEvent.click(box)
    await waitFor(() => expect(ttx.calls('translate:set-languages')).toHaveLength(1))
    expect(ttx.calls('translate:set-languages')[0]).toMatchObject({
      languages: { player: ['es'], controller: false },
    })
  })
})
