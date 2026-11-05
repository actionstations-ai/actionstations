// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolkitList } from '@shared/ipc/toolkits'
import { Scenario } from '@shared/schemas'
import { ToolkitSchema } from '@shared/toolkits'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../documents/test-utils'
import { ToolkitsPanel } from './ToolkitsPanel'
import { additions } from './toolkit-additions'

afterEach(cleanup)

const PATH = '/tmp/p.asproj'
const now = '2027-03-04T10:00:00.000Z'
const scenario = Scenario.parse({
  id: 'S1',
  projectId: 'P1',
  title: 'Harbor',
  createdAt: now,
  updatedAt: now,
  brief: {},
})

const source = {
  layer: 'bundled',
  packId: 'p',
  packName: 'Test pack',
  packVersion: '1.0.0',
} as const
const kit = (id: string, name: string, over: Record<string, unknown> = {}) =>
  ToolkitSchema.parse({ id, name, description: `${name} description.`, ...over })

function list(over: Partial<ToolkitList['toolkits'][number]>[] = []): ToolkitList {
  const base = [
    {
      toolkit: kit('alpha', 'Alpha', {
        outsideParties: ['Harbor desk'],
        connectors: ['test_archive'],
        injectTypes: ['bulletin'],
      }),
      source,
      enabled: false,
    },
    { toolkit: kit('beta', 'Beta'), source, enabled: true },
  ]
  return { toolkits: base.map((b, i) => ({ ...b, ...over[i] })), projectDefault: [] }
}

function setup(data: ToolkitList) {
  const ttx = mockTtx({
    'toolkits:list': () => data,
    'toolkits:set-scenario': (r: { toolkits: string[] }) => r.toolkits,
  })
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <ToolkitsPanel projectPath={PATH} scenario={scenario} />
    </QueryClientProvider>,
  )
  return ttx
}

describe('ToolkitsPanel (spec 0448)', () => {
  it('lists every toolkit as a checkbox that shows whether it is on', async () => {
    setup(list())
    const group = await screen.findByRole('group', { name: /toolkits for this scenario/i })
    const boxes = within(group).getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.map((b) => b.checked)).toEqual([false, true])
    expect(within(group).getByRole('checkbox', { name: /Alpha/ })).toBeTruthy()
  })

  it('describes each toolkit to its checkbox and says what it adds', async () => {
    setup(list())
    const box = await screen.findByRole('checkbox', { name: /Alpha/ })
    const desc = document.getElementById(box.getAttribute('aria-describedby')!)
    expect(desc?.textContent).toBe('Alpha description.')
    expect(screen.getByText('What Alpha adds')).toBeTruthy()
    expect(screen.getByText('Harbor desk')).toBeTruthy()
    expect(screen.getByText('test_archive')).toBeTruthy()
  })

  it('turns a toolkit on and off by sending the new list, and announces it', async () => {
    const ttx = setup(list())
    const user = userEvent.setup()
    await user.click(await screen.findByRole('checkbox', { name: /Alpha/ }))
    await waitFor(() => expect(ttx.calls('toolkits:set-scenario')).toHaveLength(1))
    expect(ttx.calls('toolkits:set-scenario')[0]).toMatchObject({
      projectPath: PATH,
      scenarioId: 'S1',
      toolkits: ['beta', 'alpha'],
    })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Alpha is on.'))
    await user.click(screen.getByRole('checkbox', { name: /Beta/ }))
    await waitFor(() => expect(ttx.calls('toolkits:set-scenario')).toHaveLength(2))
    expect(ttx.calls('toolkits:set-scenario')[1]).toMatchObject({ toolkits: [] }) // the mocked list stays as first served: only Beta is on
  })

  it('shows a suggestion with its reason and adds it only when the person says so', async () => {
    const ttx = setup(list([{ suggestion: 'The brief mentions "gale".' }]))
    const user = userEvent.setup()
    const section = await screen.findByRole('region', { name: /suggested for this scenario/i })
    expect(within(section).getByText(/The brief mentions "gale"/)).toBeTruthy()
    expect(ttx.calls('toolkits:set-scenario')).toHaveLength(0)
    await user.click(within(section).getByRole('button', { name: /Add Alpha/ }))
    await waitFor(() => expect(ttx.calls('toolkits:set-scenario')).toHaveLength(1))
    expect(ttx.calls('toolkits:set-scenario')[0]).toMatchObject({ toolkits: ['beta', 'alpha'] })
  })

  it('hides a suggestion the person dismisses', async () => {
    setup(list([{ suggestion: 'Suggested for Airport exercises.' }]))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Not now for Alpha/ }))
    expect(screen.queryByRole('region', { name: /suggested for this scenario/i })).toBeNull()
  })

  it('says so when no pack provides a toolkit', async () => {
    setup({ toolkits: [], projectDefault: [] })
    expect(await screen.findByText(/No toolkits are installed/)).toBeTruthy()
  })
})

describe('additions', () => {
  it('leaves out empty parts and counts the guidance', () => {
    const rows = additions(
      kit('g', 'G', {
        outsideParties: ['Desk'],
        knowledge: { glossary: [{ term: 'a', definition: 'b' }] },
      }),
    )
    expect(rows.map((r) => r.label)).toEqual(['Outside parties', 'Guidance for the writer'])
    expect(rows[1]!.items).toEqual(['1 terms', '0 product conventions', '0 realism rules'])
  })
})
