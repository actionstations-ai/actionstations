// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { MediaConfirmNeededEvent } from '@shared/ipc/media-confirm'
import { mockTtx } from '../routes/documents/test-utils'
import { MediaConfirmDialog, MediaConfirmHost } from './MediaConfirmDialog'
import { describeCounts } from './media-confirm-format'

afterEach(cleanup)

const request: MediaConfirmNeededEvent = {
  requestId: 'r1',
  providers: [
    {
      providerId: 'fal',
      label: 'fal.ai',
      host: 'fal.run',
      counts: { image: 3, video: 1, audio: 0 },
      estimateUsd: 1.25,
    },
    {
      providerId: 'eleven',
      label: 'ElevenLabs',
      host: 'api.elevenlabs.io',
      counts: { image: 0, video: 0, audio: 2 },
      estimateUsd: 0.1,
    },
  ],
  totalEstimateUsd: 1.35,
}

describe('describeCounts', () => {
  it('names only the kinds that have calls', () => {
    expect(describeCounts({ image: 3, video: 1, audio: 0 })).toBe('3 images, 1 video')
    expect(describeCounts({ image: 0, video: 0, audio: 1 })).toBe('1 audio clip')
  })
})

describe('MediaConfirmDialog', () => {
  it('lists counts and estimates per provider in a labelled dialog', () => {
    render(<MediaConfirmDialog request={request} onAnswer={() => undefined} />)
    const dialog = screen.getByRole('dialog', { name: 'Generate media with a paid service?' })
    expect(dialog.textContent).toContain('fal.ai')
    expect(dialog.textContent).toContain('3 images, 1 video, about $1.25')
    expect(dialog.textContent).toContain('2 audio clips, about $0.10')
    expect(dialog.textContent).toContain('Estimated total: about $1.35')
  })

  it('says no estimate is shown when no price is set', () => {
    const provider = { ...request.providers[0]! }
    delete provider.estimateUsd
    render(
      <MediaConfirmDialog
        request={{ requestId: 'r2', providers: [provider] }}
        onAnswer={() => undefined}
      />,
    )
    expect(screen.getByRole('note').textContent).toContain('No price per call is set')
  })

  it('reports Continue with the providers ticked as do-not-ask', async () => {
    const answers: unknown[][] = []
    render(<MediaConfirmDialog request={request} onAnswer={(...a) => void answers.push(a)} />)
    await userEvent.click(screen.getByRole('checkbox', { name: "Don't ask again for ElevenLabs" }))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(answers).toEqual([['continue', ['eleven']]])
  })

  it('Cancel ignores the ticks', async () => {
    const answers: unknown[][] = []
    render(<MediaConfirmDialog request={request} onAnswer={(...a) => void answers.push(a)} />)
    await userEvent.click(screen.getByRole('checkbox', { name: "Don't ask again for fal.ai" }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(answers).toEqual([['cancel', []]])
  })

  it('keeps focus inside the dialog', () => {
    render(<MediaConfirmDialog request={request} onAnswer={() => undefined} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(2)
  })
})

describe('MediaConfirmHost', () => {
  it('opens on the event and answers over media:confirm-answer', async () => {
    const ttx = mockTtx({ 'media:confirm-answer': () => undefined })
    render(<MediaConfirmHost />)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => ttx.emit('media:confirm-needed', request))
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(ttx.calls('media:confirm-answer')).toEqual([
      { requestId: 'r1', decision: 'continue', dontAskAgain: [] },
    ])
  })
})
