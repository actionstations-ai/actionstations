// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { PrivacySettings } from '@shared/schemas/privacy'
import type { ProviderView } from '@shared/schemas'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../documents/test-utils'
import { PrivacySection } from './PrivacySection'

const anthropic: ProviderView = {
  id: 'anth',
  kind: 'anthropic',
  label: 'Anthropic',
  options: {},
  enabled: true,
  hasKey: true,
}
const lmStudio: ProviderView = {
  id: 'lm',
  kind: 'openai-compatible',
  label: 'LM Studio',
  baseUrl: 'http://127.0.0.1:1234/v1',
  options: {},
  enabled: true,
  hasKey: false,
}

function setup() {
  const global = PrivacySettings.parse({})
  const ttx = mockTtx({
    'privacy:get': () => ({ global, effective: global }),
    'privacy:set': (req: { settings: Partial<PrivacySettings> }) => {
      const next = PrivacySettings.parse({ ...global, ...req.settings })
      return { global: next, effective: next }
    },
    'providers:list': () => [anthropic, lmStudio],
    'routing:get': () => ({ global: {}, effective: {} }),
  })
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PrivacySection />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return ttx
}

afterEach(() => cleanup())

describe('Settings → Privacy (#433)', () => {
  it('defaults to asking on new excerpts with every category on', async () => {
    setup()
    const recommended = await screen.findByRole('radio', { name: /Ask when new plan excerpts/ })
    expect((recommended as HTMLInputElement).checked).toBe(true)
    for (const name of ['Names', 'Phone numbers', 'Email addresses', 'Street addresses'])
      expect((screen.getByRole('checkbox', { name }) as HTMLInputElement).checked).toBe(true)
  })

  it('asks before turning review off, naming the cloud provider, then sends confirmOff', async () => {
    const ttx = setup()
    await userEvent.click(await screen.findByRole('radio', { name: /Never ask/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save privacy settings' }))
    const confirm = await screen.findByRole('dialog', {
      name: 'Stop asking before cloud requests?',
    })
    expect(confirm.textContent).toContain('Requests to Anthropic will go without asking')
    expect(confirm.textContent).not.toContain('LM Studio')
    expect(ttx.calls('privacy:set')).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Never ask' }))
    await waitFor(() => expect(ttx.calls('privacy:set')).toHaveLength(1))
    expect(ttx.calls('privacy:set')[0]).toMatchObject({
      settings: { review: 'off' },
      confirmOff: true,
    })
  })

  it('keeps asking when the confirmation is declined', async () => {
    const ttx = setup()
    await userEvent.click(await screen.findByRole('radio', { name: /Never ask/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save privacy settings' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Keep asking' }))
    expect(ttx.calls('privacy:set')).toEqual([])
  })

  it('adds and removes Never redact terms and saves the category choice', async () => {
    const ttx = setup()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Street addresses' }))
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Add to Never redact' }),
      'Rivergate{Enter}',
    )
    expect(screen.getByText('Rivergate')).toBeTruthy()
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Add to Never redact' }),
      'Springfield',
    )
    await userEvent.click(screen.getAllByRole('button', { name: 'Add' })[1]!)
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Rivergate from Never redact' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save privacy settings' }))
    await waitFor(() => expect(ttx.calls('privacy:set')).toHaveLength(1))
    expect(ttx.calls('privacy:set')[0]).toMatchObject({
      settings: { redact: { address: false }, neverRedact: ['Springfield'] },
    })
    expect(ttx.calls('privacy:set')[0]).not.toHaveProperty('confirmOff')
  })
})
