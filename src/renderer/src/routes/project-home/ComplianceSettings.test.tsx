// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import type { ComplianceList } from '@shared/ipc'
import { Framework, Regulation } from '@shared/schemas/compliance'
import circia from '../../../../../packs/regulations/circia.json'
import sec from '../../../../../packs/regulations/sec_8k_105.json'
import dora from '../../../../../packs/frameworks/dora.json'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../documents/test-utils'
import { ComplianceSettings } from './ComplianceSettings'

const PATH = '/tmp/p.asproj'
const bundled = {
  layer: 'bundled' as const,
  packId: 'ai.actionstations.core',
  packName: 'Action Stations Core',
}

function setup() {
  let list: ComplianceList = {
    regulations: [
      { regulation: Regulation.parse(circia), enabled: true, suggested: true, source: bundled },
      { regulation: Regulation.parse(sec), enabled: false, suggested: false, source: bundled },
    ],
    frameworks: [
      { framework: Framework.parse(dora), enabled: false, suggested: false, source: bundled },
    ],
    modelMapping: false,
  }
  const ttx = mockTtx({
    'compliance:list': () => list,
    'compliance:set': (req: { regulations?: Record<string, boolean> }) => {
      list = {
        ...list,
        regulations: list.regulations.map((r) => ({
          ...r,
          enabled: req.regulations?.[r.regulation.id] ?? r.enabled,
        })),
      }
      return { regulations: req.regulations ?? {}, frameworks: {}, modelMapping: false }
    },
  })
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <ComplianceSettings path={PATH} />
    </QueryClientProvider>,
  )
  return ttx
}

afterEach(() => cleanup())

describe('ComplianceSettings', () => {
  it('lists regulations with status, last-checked date, sources and the proposed-rule note', async () => {
    setup()
    const box = await screen.findByRole('checkbox', { name: 'CIRCIA' })
    expect((box as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('Proposed rule')).toBeTruthy()
    expect(screen.getByText(/come from a proposed rule and may change/)).toBeTruthy()
    expect(screen.getAllByText(/Last checked/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'CIRCIA NPRM, 89 FR 23644' })).toBeTruthy()
    expect(screen.getByText(/not legal advice/)).toBeTruthy()
    expect(screen.getByText('Suggested for this domain')).toBeTruthy()
  })

  it('switches a regulation on', async () => {
    const ttx = setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('checkbox', { name: 'SEC Form 8-K Item 1.05' }))
    expect(ttx.calls('compliance:set')).toEqual([
      { projectPath: PATH, regulations: { sec_8k_105: true } },
    ])
    await waitFor(() =>
      expect(
        (screen.getByRole('checkbox', { name: 'SEC Form 8-K Item 1.05' }) as HTMLInputElement)
          .checked,
      ).toBe(true),
    )
  })
})
