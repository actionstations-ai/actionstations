// The profile's scene anchor never goes in front of the model's own scene (#177.4).
import { describe, expect, it } from 'vitest'
import { builtinProfile } from '@shared/domains'
import { anchoredPrompt, hasOwnScene } from './media-plan'

const water = builtinProfile('water_utility').sceneAnchors
const scene = { orgType: 'water_utility', anchors: water }

describe('anchoredPrompt', () => {
  it('keeps the I-11b hospital scene first and adds the public anchor after it', () => {
    const model =
      'Phone snapshot taken from bedside at a hospital: a child lies on a metal tray table next to a translucent plastic water glass half-filled with cloudy liquid.'
    const p = anchoredPrompt(model, 'phone', scene)
    expect(p.startsWith('Candid smartphone snapshot, slight tilt')).toBe(true)
    const sceneAt = p.indexOf('bedside at a hospital')
    const anchorAt = p.indexOf('a residential street with a utility crew')
    expect(sceneAt).toBeGreaterThan(0)
    expect(anchorAt).toBeGreaterThan(sceneAt)
    expect(p).toMatch(/cloudy liquid\. Setting: a residential street/)
    expect(p).not.toMatch(/white balance a residential street/)
  })

  it('uses the anchor as the scene when the prompt only names the camera', () => {
    const p = anchoredPrompt('phone snapshot, slight tilt, daylight', 'phone', scene)
    expect(p).toBe(
      `Candid smartphone snapshot, slight tilt, natural color balance, neutral white balance ${water.public}. phone snapshot, slight tilt, daylight`,
    )
  })

  it('adds no anchor for screen and portrait styles', () => {
    expect(anchoredPrompt('a monitor with an alarm banner', 'screen', scene)).not.toContain(
      'residential street',
    )
  })
})

describe('hasOwnScene', () => {
  it('counts the words that are not camera, framing or light words', () => {
    expect(hasOwnScene('Press photo, 35 mm lens, natural daylight')).toBe(false)
    expect(hasOwnScene('a crew at a flooded intersection')).toBe(true)
  })
})
