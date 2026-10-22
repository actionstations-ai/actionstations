// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Inject } from '@shared/schemas/inject'
import { mediaUrl } from '@shared/media-url'
import { PROJECT, mockTtx, renderAt } from '../documents/test-utils'
import { projectKey } from '../../state/project'
import PresentPage from './PresentPage'

const prov = { provider: 'template', createdAt: '2026-10-21T14:00:00.000Z' }
const inject = Inject.parse({
  id: 'INJ03',
  mselRowId: 'I-03',
  type: 'radio_call',
  title: 'Radio call from TSA',
  deliveryMode: 'play_audio',
  assets: [
    { id: 'PAGE', kind: 'image', path: 'scenarios/S/media/INJ03/PAGE.png', provenance: prov },
    { id: 'VOICE', kind: 'audio', path: 'scenarios/S/media/INJ03/VOICE.wav', provenance: prov },
  ],
})

function open(query = '') {
  const ttx = mockTtx({
    'injects:get': () => inject,
    'facilitator:close-present': () => undefined,
  })
  renderAt(
    `/present/${projectKey(PROJECT)}/S/INJ03${query}`,
    '/present/:projectKey/:scenarioId/:injectId',
    PresentPage,
  )
  return ttx
}

afterEach(() => cleanup())

describe('PresentPage', () => {
  it('plays audio injects with a large play control and no title or tags', async () => {
    open()
    const button = await screen.findByRole('button', { name: /(Play|Pause) audio/ })
    expect(button).toBeTruthy()
    const audio = document.querySelector('audio')!
    expect(audio.getAttribute('src')).toBe(mediaUrl(PROJECT, 'scenarios/S/media/INJ03/VOICE.wav'))
    expect(audio.autoplay).toBe(true)
    expect(screen.queryByText('Radio call from TSA')).toBeNull()
  })

  it('shows the requested asset scaled to fit, with the title only on request', async () => {
    open('?asset=PAGE&title=1')
    const img = await screen.findByRole('img', { name: 'Inject' })
    expect(img.getAttribute('src')).toBe(mediaUrl(PROJECT, 'scenarios/S/media/INJ03/PAGE.png'))
    expect(img.className).toBe('present__image')
    expect(screen.getByText('Radio call from TSA')).toBeTruthy()
  })

  it('asks main to close the presentation on Escape', async () => {
    const ttx = open()
    await screen.findByRole('button', { name: /(Play|Pause) audio/ })
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(ttx.calls('facilitator:close-present')).toHaveLength(1))
  })
})
