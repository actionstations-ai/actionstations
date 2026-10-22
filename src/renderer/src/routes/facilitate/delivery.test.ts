import { describe, expect, it } from 'vitest'
import { Inject } from '@shared/schemas/inject'
import { deliveryAction, imageAsset, pageAsset, presentAsset, screenAsset } from './delivery'

const prov = { provider: 'template', createdAt: '2026-10-21T14:00:00.000Z' }
const asset = (id: string, kind: string, role = 'rendered') => ({
  id,
  kind,
  role,
  path: `scenarios/S/media/I/${id}.${kind === 'audio' ? 'wav' : kind === 'pdf' ? 'pdf' : 'png'}`,
  provenance: prov,
})

const inject = (deliveryMode: string, assets: unknown[]) =>
  Inject.parse({
    id: 'I1',
    mselRowId: 'I-06',
    type: 'fids_board',
    title: 'FIDS',
    deliveryMode,
    assets,
  })

describe('inject delivery', () => {
  it('prefers the composite, then the rendered page, then the AI image', () => {
    const i = inject('display_main_screen', [
      asset('gen', 'image', 'generated'),
      asset('page', 'image', 'rendered'),
      asset('comp', 'image', 'composite'),
    ])
    expect(imageAsset(i)?.id).toBe('comp')
    expect(screenAsset(inject('read_aloud', [asset('a', 'audio'), asset('p', 'image')]))?.id).toBe(
      'p',
    )
  })

  it('presents main-screen injects, plays audio injects, hands out paper ones', () => {
    expect(deliveryAction(inject('display_main_screen', [asset('p', 'image')]))).toMatchObject({
      kind: 'present',
      asset: { id: 'p' },
    })
    expect(deliveryAction(inject('display_main_screen', []))).toEqual({ kind: 'none' })
    expect(deliveryAction(inject('play_audio', [asset('v', 'audio')]))).toMatchObject({
      kind: 'play',
      asset: { id: 'v' },
    })
    expect(deliveryAction(inject('play_audio', []))).toEqual({ kind: 'read' })
    expect(
      deliveryAction(inject('hand_to_role', [asset('p', 'image'), asset('pdf', 'pdf')])),
    ).toMatchObject({ kind: 'hand', asset: { id: 'pdf' } })
    expect(deliveryAction(inject('read_aloud', [asset('p', 'image')]))).toEqual({ kind: 'read' })
    expect(deliveryAction(undefined)).toEqual({ kind: 'none' })
  })

  it('shows the requested asset on the projector, else the default for the mode', () => {
    const i = inject('play_audio', [asset('p', 'image'), asset('v', 'audio')])
    expect(presentAsset(i, 'p')?.id).toBe('p')
    expect(presentAsset(i, 'missing')?.id).toBe('v')
    expect(presentAsset(i)?.id).toBe('v')
    expect(presentAsset(inject('display_main_screen', [asset('p', 'image')]))?.id).toBe('p')
    expect(pageAsset(inject('hand_to_role', [asset('p', 'image')]))?.id).toBe('p')
  })
})
