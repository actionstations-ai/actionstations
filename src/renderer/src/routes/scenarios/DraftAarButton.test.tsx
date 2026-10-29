// @vitest-environment happy-dom
// The draft dialog warns before hot wash quotes go to a cloud model (#425 FR-14, #433).
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { mockTtx, projectUrl, renderAt, type Handlers } from '../documents/test-utils'
import { DraftAarButton } from './DraftAarButton'
import { PROJECT } from '../documents/test-utils'

const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }

const provider = (kind: 'anthropic' | 'ollama') => ({
  id: 'p1',
  label: kind === 'anthropic' ? 'Anthropic API' : 'Local Ollama',
  kind,
  enabled: true,
  baseUrl: kind === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.anthropic.com',
  options: {},
  hasKey: false,
})

const quote = {
  citeKey: 'T1',
  ref: 'transcript:a#b',
  recordingTitle: 'Hot wash',
  at: '0:01:00',
  text: 'We never confirmed the hand-off.',
  quote: true,
  objectiveIds: [],
  rowIds: [],
}

function open(kind: 'anthropic' | 'ollama', quotes: unknown[]) {
  const handlers = {
    'aar:sessions': () => [],
    'hotwash:transcripts': () => quotes,
    'providers:list': () => [provider(kind)],
    'routing:get': () => ({ global: {}, effective: { draft: { providerId: 'p1' } } }),
  } as unknown as Handlers
  mockTtx(handlers)
  renderAt(projectUrl('scenarios/s1/aar'), '/p/:projectKey/scenarios/:scenarioId/aar', () => (
    <DraftAarButton projectPath={PROJECT} scenarioId="s1" hasEvidence hasDraft={false} />
  ))
  return userEvent.setup().click(screen.getByRole('button', { name: /Draft AAR\/IP/ }))
}

afterEach(() => cleanup())

describe('transcript cloud warning', () => {
  it('names the cloud provider when marked quotes are part of the input', async () => {
    await open('anthropic', [quote])
    const alert = await screen.findByText(/marked quote from the hot wash transcript/)
    expect(alert.textContent).toContain('Anthropic API')
    expect(alert.textContent).toContain('Quotes you redacted are never sent')
  })

  it('stays quiet for a local model', async () => {
    await open('ollama', [quote])
    await screen.findByText('Draft the AAR/IP')
    await waitFor(() => expect(screen.queryByText(/hot wash transcript/)).toBeNull())
  })

  it('stays quiet when no quotes are marked', async () => {
    await open('anthropic', [])
    await screen.findByText('Draft the AAR/IP')
    expect(screen.queryByText(/hot wash transcript/)).toBeNull()
  })

  it('has no axe violations with the warning showing', async () => {
    await open('anthropic', [quote])
    await screen.findByText(/hot wash transcript/)
    expect((await axe.run(screen.getByRole('dialog'), AXE)).violations.map((v) => v.id)).toEqual([])
  })
})
