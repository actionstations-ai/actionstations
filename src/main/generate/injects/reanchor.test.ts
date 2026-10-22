// generate:repair re-anchors a brief written before #177.4: the stored I-09 prompt of the
// water example had the street anchor in front of the kitchen scene.
import { describe, expect, it } from 'vitest'
import { builtinProfile } from '@shared/domains'
import { anchoredPrompt, reanchorPrompt } from './media-plan'

const water = builtinProfile('water_utility').sceneAnchors
const scene = { orgType: 'water_utility', anchors: water }
const STYLE =
  'Candid smartphone snapshot, slight tilt, natural color balance, neutral white balance'
const KITCHEN =
  "Phone snapshot taken at eye level, slightly tilted. A child's hand holds a plastic tumbler of cloudy tap water in a dim kitchen."

describe('reanchorPrompt', () => {
  it('moves a leading setting anchor behind the scene, as anchoredPrompt writes it', () => {
    const stored = `${STYLE} ${water.exterior}. ${KITCHEN}`
    const fixed = reanchorPrompt(stored, 'phone', scene)
    expect(fixed.startsWith(`${STYLE}. Phone snapshot taken at eye level`)).toBe(true)
    expect(fixed.endsWith(`Setting: ${water.exterior}`)).toBe(true)
    expect(fixed).not.toContain(`white balance ${water.exterior}`)
  })

  it('returns current, anchor-only and non-place prompts unchanged', () => {
    const current = anchoredPrompt(KITCHEN, 'phone', scene)
    expect(reanchorPrompt(current, 'phone', scene)).toBe(current)
    const anchorOnly = `${STYLE} ${water.public}. phone snapshot, slight tilt, daylight`
    expect(reanchorPrompt(anchorOnly, 'phone', scene)).toBe(anchorOnly)
    const screen = 'A monitor photographed at an angle, slight moiré and reflections. HMI screen.'
    expect(reanchorPrompt(screen, 'screen', scene)).toBe(screen)
  })
})
