// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { SearchHit } from '@shared/schemas/document'
import SearchPage from './SearchPage'
import { FakeIpcError, PROJECT, mockTtx, projectUrl, renderAt } from '../documents/test-utils'

const ROUTE = '/p/:projectKey/search'

const HIT: SearchHit = {
  chunkId: 7,
  documentId: 'doc1',
  documentTitle: 'Terminal Incident Response Plan',
  headingPath: 'TIRP › Section 13 › 13.6 FIDS/BHS System Failure',
  page: 4,
  text: 'When the BHS fails, switch to manual baggage tagging. <script>alert(1)</script>',
  score: 0.03279,
  ftsRank: 1,
  vecRank: 3,
}

afterEach(() => cleanup())

describe('SearchPage', () => {
  it('searches with the chosen mode and k and renders ranked hits', async () => {
    const ttx = mockTtx({ 'retrieve:search': () => [HIT] })
    renderAt(projectUrl('search'), ROUTE, SearchPage)
    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox', { name: 'Query' }), 'BHS manual')
    await user.click(screen.getByRole('radio', { name: 'Keyword' }))
    const k = screen.getByRole('spinbutton', { name: 'Results (k)' })
    await user.clear(k)
    await user.type(k, '5')
    await user.click(screen.getByRole('button', { name: /Search/ }))

    await waitFor(() =>
      expect(ttx.calls('retrieve:search')[0]).toEqual({
        projectPath: PROJECT,
        query: 'BHS manual',
        mode: 'fts',
        k: 5,
      }),
    )
    const hits = await screen.findByRole('list', { name: '1 results' })
    const hit = within(hits).getByRole('listitem')
    expect(within(hit).getByRole('heading', { name: HIT.headingPath })).toBeTruthy()
    expect(within(hit).getByText('Terminal Incident Response Plan · p. 4')).toBeTruthy()
    const scores = Object.fromEntries(
      Array.from(hit.querySelectorAll('dl div')).map((d) => [
        d.querySelector('dt')!.textContent,
        d.querySelector('dd')!.textContent,
      ]),
    )
    expect(scores).toEqual({ Score: '0.0328', 'FTS rank': '1', 'Vector rank': '3' })

    const marks = Array.from(hit.querySelectorAll('mark')).map((m) => m.textContent)
    expect(marks).toEqual(['BHS', 'manual'])
    // Chunk text is rendered as text, never as markup.
    expect(hit.querySelector('script')).toBeNull()
    expect(hit.textContent).toContain('<script>alert(1)</script>')
  })

  it('shows an empty result and backend errors', async () => {
    let fail = false
    mockTtx({
      'retrieve:search': () => {
        if (fail) throw new FakeIpcError('NOT_IMPLEMENTED', 'Index store lands with #14')
        return []
      },
    })
    renderAt(projectUrl('search'), ROUTE, SearchPage)
    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox', { name: 'Query' }), 'nothing')
    await user.click(screen.getByRole('button', { name: /Search/ }))
    expect(await screen.findByRole('region', { name: 'No matches' })).toBeTruthy()

    fail = true
    await user.type(screen.getByRole('searchbox', { name: 'Query' }), ' else')
    await user.click(screen.getByRole('button', { name: /Search/ }))
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /isn.t available in this version/,
    )
  })

  it('keeps the search button disabled for a blank query', () => {
    mockTtx({})
    renderAt(projectUrl('search'), ROUTE, SearchPage)
    expect(screen.getByRole('button', { name: /Search/ }).hasAttribute('disabled')).toBe(true)
  })
})
