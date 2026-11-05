// @vitest-environment happy-dom
// Synthetic exercise media is marked in the facilitator view (spec 0467 FR-6b).
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { MediaAsset } from '@shared/schemas/media'
import { SYNTHETIC_LABEL } from '@shared/synthetic-media'
import { MediaPanel } from './MediaPanel'

afterEach(cleanup)

const asset = (over: Partial<MediaAsset>): MediaAsset => ({
  id: 'a1',
  kind: 'audio',
  path: 'scenarios/s/media/i/a1.wav',
  role: 'generated',
  provenance: { provider: 'local-tts', createdAt: '2026-11-04T00:00:00.000Z' },
  ...over,
})

describe('MediaPanel', () => {
  it('shows the exercise mark on a synthetic asset', () => {
    render(<MediaPanel projectPath="/p" title="Voicemail" assets={[asset({ synthetic: true })]} />)
    expect(screen.getByText(SYNTHETIC_LABEL)).toBeTruthy()
  })

  it('shows no mark on ordinary media', () => {
    render(<MediaPanel projectPath="/p" title="Voicemail" assets={[asset({})]} />)
    expect(screen.queryByText(SYNTHETIC_LABEL)).toBeNull()
  })
})
