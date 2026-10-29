// Engagement applied to every mapped template must still satisfy that template's schema
// (spec 0428 §3), so a render never fails halfway through an exercise.
import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { EngagementPlan } from '@shared/schemas/inject'
import { applyEngagement } from '@shared/facilitator/engagement'
import { ENGAGEMENT_FIELDS } from '@shared/facilitator/engagement-fields'
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { engagementCacheFile, engagementMap } = await import('./engagement')
const { loadTemplate, previewFields, validateFields } = await import('./templates')

const plan = EngagementPlan.parse({
  curve: 'surge',
  start: { likes: 3, reposts: 1, views: 40, reactions: 5, comments: 1, shares: 0, upvotes: 2 },
  peak: {
    likes: 5400,
    reposts: 900,
    views: 80000,
    reactions: 2300,
    comments: 310,
    shares: 640,
    upvotes: 4100,
    replies: 120,
  },
  peakAtMin: 30,
  replies: Array.from({ length: 6 }, (_, i) => ({
    id: `r${i}`,
    atMin: i * 2,
    author: `Person ${i}`,
    handle: `person_${i}`,
    text: `Reply number ${i}`,
  })),
})

describe.each(Object.keys(ENGAGEMENT_FIELDS))('%s with engagement', (type) => {
  it.each([0, 7, 30, 90])('still validates at %d minutes', (minutes) => {
    const t = loadTemplate(type)
    const fields = applyEngagement(
      previewFields(t.preview),
      plan,
      engagementMap(type, t.meta)!,
      minutes,
    )
    expect(validateFields(type, fields)).toEqual([])
  })
})

describe('engagementCacheFile', () => {
  it('accepts only a numbered PNG under .cache/engagement', () => {
    expect(() => engagementCacheFile('/nowhere', '../x.png')).toThrow()
    expect(() => engagementCacheFile('/nowhere', '.cache/engagement/a/../../x.png')).toThrow()
    expect(() => engagementCacheFile('/nowhere', 'scenarios/s1/inject.json')).toThrow()
    expect(() => engagementCacheFile('/nowhere', '.cache/engagement/I-1/abc.png')).toThrow()
  })
})
