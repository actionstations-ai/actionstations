import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Inject, MselRow } from '@shared/schemas'
import {
  DARK_SCENE_LIGHTING,
  describesDarkScreens,
  describesPowerLoss,
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

/** I-10 with the terminal's power out as well as its boards (#162). */
const POWER_LOSS = 'A power failure has cut the terminal lights; emergency lighting only.'
const withPowerLoss = (inject: Inject): Inject => ({
  ...inject,
  fields: { ...inject.fields, sceneBrief: `${String(inject.fields.sceneBrief)} ${POWER_LOSS}` },
})

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
    expect(brief.imagePrompt).toMatch(/inside an airport terminal concourse/)
    expect(brief.imagePrompt).toMatch(/crowded terminal concourse/i)
    expect(brief.imagePrompt).not.toMatch(/screen|board|display|monitor|dark|unlit|blank/i)
    expect(brief.negativePrompt).toContain(LIT_SCREEN_NEGATIVE)
  })

  it('detects a power loss, not just dark screens (#162)', () => {
    expect(describesPowerLoss('a power outage hits the concourse')).toBe(true)
    expect(describesPowerLoss('the terminal blackout enters its second hour')).toBe(true)
    expect(describesPowerLoss('after the power failure, backup generators kick in')).toBe(true)
    expect(describesPowerLoss('hallway lit by emergency lighting only')).toBe(true)
    expect(describesPowerLoss('the hospital lost power at 09:40')).toBe(true)
    expect(describesPowerLoss('every departure board goes dark')).toBe(false)
    expect(describesPowerLoss('FIDS screens show a ransom note; the screens are blank')).toBe(false)
    expect(describesPowerLoss('fluorescent lighting, mid-morning light')).toBe(false)
  })

  it('sample run I-10, boards blank with the power on: the room keeps its light (#162)', () => {
    const inject = sampleInject('I-10')
    const plan = planMedia(inject, row('I-10', 'Photo of the concourse as the FIDS go dark'))
    const brief = normalizeBrief(plan, undefined, inject, { orgType: 'airport' })
    expect(brief.lighting).toBeUndefined()
    expect(brief.imagePrompt).not.toMatch(/\bdim\b|power outage|blackout/i)
    expect(brief.imagePrompt).not.toMatch(/screen|board|display|monitor/i)
    expect(brief.negativePrompt).toContain(LIT_SCREEN_NEGATIVE)
  })

  it('sample run I-10 with a power loss: dark lighting and outage light words (#162)', () => {
    const inject = withPowerLoss(sampleInject('I-10'))
    const plan = planMedia(inject, row('I-10', 'Photo of the concourse as the FIDS go dark'))
    const brief = normalizeBrief(plan, undefined, inject, { orgType: 'airport' })
    expect(brief.lighting).toBe('dark')
    expect(brief.imagePrompt).toMatch(/dim airport terminal concourse/)
    expect(brief.imagePrompt?.endsWith(`, ${DARK_SCENE_LIGHTING}`)).toBe(true)
    expect(brief.imagePrompt).not.toMatch(/screen|board|display|monitor/i)
    expect(brief.negativePrompt).toContain(LIT_SCREEN_NEGATIVE)
  })

  it('a power loss with no screens in the scene still dims it (#162)', () => {
    const inject = sampleInject('I-10')
    const corridor = {
      ...inject,
      fields: { sceneBrief: 'Travellers in a corridor during a blackout' },
    }
    const plan = planMedia(corridor, row('I-10', 'Photo of the concourse'))
    const brief = normalizeBrief(plan, undefined, corridor, { orgType: 'airport' })
    expect(brief.lighting).toBe('dark')
    expect(brief.negativePrompt).toContain(LIT_SCREEN_NEGATIVE)
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
