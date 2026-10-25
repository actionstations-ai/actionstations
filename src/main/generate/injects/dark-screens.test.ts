import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Inject, MselRow } from '@shared/schemas'
import {
  DARK_SCENE_LIGHTING,
  describesDarkScreens,
  LIT_SCREEN_NEGATIVE,
  normalizeBrief,
  planMedia,
  withoutScreens,
} from './media-plan'

const sampleInject = (rowId: string): Inject => {
  const all = JSON.parse(
    readFileSync(resolve('tests/fixtures/injects/sample-run/injects.json'), 'utf8'),
  ) as Inject[]
  return all.find((i) => i.mselRowId === rowId)!
}

const row = (id: string, event: string): MselRow => ({
  id,
  phaseId: 'p1',
  time: '0:10',
  from: 'Social media',
  toRoleIds: ['ops'],
  event,
  expectedAction: '',
  purposeTag: 'PRESSURE',
  citations: [],
  locked: false,
})

describe('dark screens in scene prompts (#141)', () => {
  it('detects screens described as dark, blank or powered off', () => {
    expect(describesDarkScreens('a row of dark, unlit departure boards')).toBe(true)
    expect(describesDarkScreens('the screens are blank or frozen')).toBe(true)
    expect(describesDarkScreens('every departure board goes dark')).toBe(true)
    expect(describesDarkScreens('monitors powered off after the attack')).toBe(true)
    expect(describesDarkScreens('busy concourse with departure boards')).toBe(false)
    expect(describesDarkScreens('dark winter morning, departure boards showing delays')).toBe(false)
  })

  it('removes every mention of screens while keeping the rest of the scene', () => {
    expect(withoutScreens('Crowd under dark screens')).toBe('Crowd')
    expect(
      withoutScreens(
        'Passengers staring upward at a row of dark, unlit departure boards; some are shouting, high ceilings.',
      ),
    ).toBe('Passengers, some are shouting, high ceilings.')
  })

  it('sample run I-10: no screens in the positive prompt, lit screens in the negative', () => {
    const inject = sampleInject('I-10')
    const plan = planMedia(inject, row('I-10', 'Photo of the concourse as the FIDS go dark'))
    const brief = normalizeBrief(plan, undefined, inject, { orgType: 'airport' })
    expect(brief.imagePrompt).toMatch(/dim airport terminal concourse/)
    expect(brief.imagePrompt).toMatch(/crowded terminal concourse/i)
    expect(brief.imagePrompt).not.toMatch(/screen|board|display|monitor|dark|unlit|blank/i)
    expect(brief.negativePrompt).toContain(LIT_SCREEN_NEGATIVE)
  })

  it('sample run I-10: dark lighting and outage light words for the workflow (#162)', () => {
    const inject = sampleInject('I-10')
    const plan = planMedia(inject, row('I-10', 'Photo of the concourse as the FIDS go dark'))
    const brief = normalizeBrief(plan, undefined, inject, { orgType: 'airport' })
    expect(brief.lighting).toBe('dark')
    expect(brief.imagePrompt?.endsWith(`, ${DARK_SCENE_LIGHTING}`)).toBe(true)
    expect(brief.negativePrompt).toMatch(/digital signage, information screens/)
  })

  it('leaves scenes whose screens are not dark as they were', () => {
    const inject = sampleInject('I-10')
    const lit = { ...inject, fields: { sceneBrief: 'Busy concourse, travellers at check-in' } }
    const plan = planMedia(lit, row('I-10', 'Photo of the concourse'))
    const brief = normalizeBrief(plan, undefined, lit, { orgType: 'airport' })
    expect(brief.imagePrompt).toContain('airport passenger terminal')
    expect(brief.negativePrompt).not.toContain('illuminated screens')
    expect(brief.lighting).toBeUndefined()
    expect(brief.imagePrompt).not.toContain('power outage')
  })
})
