// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '../../lib/query'
import { makeDoc, mockTtx } from '../documents/test-utils'
import { toggleId } from '../../components/privacy/privacy-model'
import { NeverSendCard } from './NeverSendCard'

const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }
const settings = { review: 'new-excerpts', redact: {}, alwaysRedact: [], neverRedact: [] }

function setup(neverSend: string[]) {
  const ttx = mockTtx({
    'documents:list': () => [
      makeDoc({ id: 'D1', title: 'Emergency Operations Plan' }),
      makeDoc({ id: 'D2', title: 'Water System Plan' }),
    ],
    'privacy:get': () =>
      ({
        global: { ...settings, neverSend: [] },
        effective: { ...settings, neverSend },
      }) as never,
    'privacy:set': () => ({}) as never,
  })
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <NeverSendCard projectPath="/p" />
    </QueryClientProvider>,
  )
  return ttx
}

afterEach(() => cleanup())

describe('toggleId', () => {
  it('adds and removes an id without duplicates', () => {
    expect(toggleId(['a'], 'b', true)).toEqual(['a', 'b'])
    expect(toggleId(['a', 'b'], 'a', true)).toEqual(['b', 'a'])
    expect(toggleId(['a', 'b'], 'a', false)).toEqual(['b'])
  })
})

describe('NeverSendCard (#502)', () => {
  it('lists the documents and shows which are marked', async () => {
    setup(['D2'])
    const first = await screen.findByRole('checkbox', {
      name: 'Never send Emergency Operations Plan',
    })
    expect((first as HTMLInputElement).checked).toBe(false)
    const second = screen.getByRole('checkbox', { name: 'Never send Water System Plan' })
    expect((second as HTMLInputElement).checked).toBe(true)
  })

  it('saves the marked documents with the choice added', async () => {
    const ttx = setup(['D2'])
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Never send Emergency Operations Plan' }),
    )
    await waitFor(() => expect(ttx.calls('privacy:set')).toHaveLength(1))
    expect(ttx.calls('privacy:set')[0]).toEqual({
      projectPath: '/p',
      settings: { neverSend: ['D2', 'D1'] },
    })
  })

  it('has no axe violations', async () => {
    setup([])
    await screen.findByRole('heading', { name: 'Documents never sent to the cloud' })
    expect((await axe.run(document.body, AXE)).violations.map((v) => v.id)).toEqual([])
  })
})
