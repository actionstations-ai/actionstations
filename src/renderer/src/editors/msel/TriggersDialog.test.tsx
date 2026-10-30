// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Regulation } from '@shared/schemas/compliance'
import { MselRow } from '@shared/schemas/scenario'
import circia from '../../../../../packs/regulations/circia.json'
import gdpr from '../../../../../packs/regulations/gdpr_art33.json'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../../routes/documents/test-utils'
import { TriggersDialog } from './TriggersDialog'

const source = { layer: 'bundled' as const }
const row = MselRow.parse({
  id: 'I-07',
  phaseId: 'P1',
  time: '1:00',
  from: 'SimCell',
  event: 'Ransomware confirmed',
  expectedAction: '',
  purposeTag: 'CORE_NARRATIVE',
  triggers: [{ regulationId: 'gdpr_art33', triggerId: 'aware' }],
})

afterEach(() => cleanup())

describe('TriggersDialog', () => {
  it('starts from the row triggers and saves the ticked ones', async () => {
    mockTtx({
      'compliance:list': () => ({
        regulations: [
          { regulation: Regulation.parse(gdpr), enabled: false, suggested: false, source },
          { regulation: Regulation.parse(circia), enabled: true, suggested: true, source },
        ],
        frameworks: [],
        modelMapping: false,
      }),
    })
    const onSave = vi.fn()
    queryClient.clear()
    render(
      <QueryClientProvider client={queryClient}>
        <TriggersDialog projectPath="/p" row={row} onCancel={() => undefined} onSave={onSave} />
      </QueryClientProvider>,
    )
    const user = userEvent.setup()
    const aware = await screen.findByRole('checkbox', {
      name: 'Controller became aware of a personal data breach',
    })
    expect((aware as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('(switched off for this project)')).toBeTruthy()
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Reasonably believes a covered cyber incident occurred',
      }),
    )
    await user.click(aware)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith([{ regulationId: 'circia', triggerId: 'covered_incident' }])
  })
})
