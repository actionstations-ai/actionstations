/* eslint-disable react-refresh/only-export-components -- test-only module, never hot-reloaded */
// Test-only: render an editor with the app's QueryClient. Imported only from *.test.tsx.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import { queryClient } from '../../lib/query'

export { FakeIpcError, PROJECT, mockTtx } from '../../routes/documents/test-utils'

export const SCENARIO: Scenario = Scenario.parse(fixture)

export function renderWithClient(ui: ReactElement): RenderResult {
  queryClient.clear()
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}
