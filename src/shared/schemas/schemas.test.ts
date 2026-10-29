import { describe, expect, it } from 'vitest'
import {
  AppSettings,
  Inject,
  MselRow,
  Project,
  RelPath,
  Scenario,
  ScenarioDocKind,
  exerciseMinutes,
  formatExerciseTime,
} from './index'
import { INJECT_TYPES, PURPOSE_TAGS, injectTypeInfo } from '../taxonomy'
import { mediaUrl, parseMediaUrl } from '../media-url'

const now = '2026-10-21T12:00:00.000Z'

describe('schemas', () => {
  it('fills project defaults', () => {
    const p = Project.parse({
      id: 'p1',
      name: 'NCIA',
      createdAt: now,
      updatedAt: now,
      appVersion: '0.0.1',
    })
    expect(p.formatVersion).toBe(1)
    expect(p.brand.aliases).toEqual({})
    expect(p.documents).toEqual([])
  })

  it('accepts a Scenario 3 MSEL row and rejects bad times', () => {
    const row = {
      id: 'I-06',
      phaseId: 'ph2',
      time: '1:15',
      from: 'Automated PA',
      toRoleIds: ['all'],
      event: 'Flight 666 to Purgatory is now boarding at all gates.',
      expectedAction: 'Ops must silence the PA system immediately.',
      purposeTag: 'DECISION_POINT',
    }
    expect(MselRow.parse(row).locked).toBe(false)
    expect(() => MselRow.parse({ ...row, time: '1:75' })).toThrow()
    expect(() => MselRow.parse({ ...row, purposeTag: 'NOT_A_TAG' })).toThrow()
  })

  it('validates inject types as template type ids', () => {
    const base = { id: 'i1', mselRowId: 'I-04', title: 'Tweet', fields: {} }
    expect(Inject.parse({ ...base, type: 'tweet' }).deliveryMode).toBe('hand_to_role')
    // A pack type (or a project copy of one after the pack is gone) still loads (#261).
    expect(Inject.parse({ ...base, type: 'rail_dispatch_board' }).type).toBe('rail_dispatch_board')
    expect(() => Inject.parse({ ...base, type: 'Carrier Pigeon' })).toThrow()
    expect(() => Inject.parse({ ...base, type: '../etc' })).toThrow()
  })

  it('builds a minimal scenario', () => {
    const s = Scenario.parse({
      id: 's1',
      projectId: 'p1',
      title: 'Flight to Nowhere',
      createdAt: now,
      updatedAt: now,
      brief: {},
    })
    expect(s.brief.durationHours).toBe(4)
    expect(s.msel).toEqual([])
  })

  it('keeps older scenario documents and accepts the optional handout kinds (#224)', () => {
    const base = { id: 's1', projectId: 'p1', title: 'Countdown', createdAt: now, updatedAt: now }
    const old = Scenario.parse({
      ...base,
      brief: {},
      documents: { handbook: 'scenarios/s1/documents/handbook.md' },
    })
    expect(old.documents).toEqual({ handbook: 'scenarios/s1/documents/handbook.md' })
    const withHandouts = Scenario.parse({
      ...base,
      brief: {},
      documents: {
        handouts: 'scenarios/s1/documents/handouts.md',
        controller_handouts: 'scenarios/s1/documents/controller_handouts.md',
      },
    })
    expect(withHandouts.documents.handouts).toBe('scenarios/s1/documents/handouts.md')
    expect(ScenarioDocKind.options).toEqual(
      expect.arrayContaining(['handouts', 'controller_handouts']),
    )
  })

  it('rejects project-relative paths that escape', () => {
    expect(RelPath.safeParse('media/I-06/a.png').success).toBe(true)
    expect(RelPath.safeParse('../x').success).toBe(false)
    expect(RelPath.safeParse('/abs').success).toBe(false)
  })

  it('defaults app settings to the offline hash embedder', () => {
    expect(AppSettings.parse({}).embeddings.mode).toBe('hash')
  })

  it('turns tips on for settings files written before tips existed (#443)', () => {
    const tips = { enabled: true, nextIndex: 0 }
    expect(AppSettings.parse({}).ui.tips).toEqual(tips)
    expect(AppSettings.parse({ ui: { theme: 'dark' } }).ui).toEqual({ theme: 'dark', tips })
    expect(AppSettings.parse({ ui: { tips: { enabled: false } } }).ui.tips).toEqual({
      enabled: false,
      nextIndex: 0,
    })
  })
})

describe('taxonomy', () => {
  it('covers every MVP type from docs/03', () => {
    const mvp = INJECT_TYPES.filter((t) => t.mvp).map((t) => t.id)
    for (const id of [
      'tweet',
      'facebook_post',
      'helpdesk_ticket',
      'email_forward',
      'memo',
      'radio_call',
      'media_inquiry_phone_slip',
      'system_log',
      'error_dialog',
      'fids_board',
      'startex_card',
      'time_jump_card',
      'endex_card',
      'ics_201_prefill',
    ]) {
      expect(mvp).toContain(id)
    }
    expect(new Set(INJECT_TYPES.map((t) => t.id)).size).toBe(INJECT_TYPES.length)
  })
  it('includes the Scenario 3 purpose tags', () => {
    for (const t of [
      'NOISE',
      'RED_HERRING',
      'MISINFORMATION',
      'TECH_HURDLE',
      'OPERATIONAL_FRICTION',
      'END_GAME',
    ]) {
      expect(PURPOSE_TAGS).toContain(t)
    }
    expect(injectTypeInfo('fids_board')?.defaultDelivery).toBe('display_main_screen')
  })
})

describe('helpers', () => {
  it('converts exercise times', () => {
    expect(exerciseMinutes('3:45')).toBe(225)
    expect(formatExerciseTime(75)).toBe('1:15')
  })
  it('round-trips media URLs with spaces and unicode', () => {
    const url = mediaUrl('/Users/me/My Airport.asproj', 'scenarios/s1/media/I-06/board ü.png')
    expect(parseMediaUrl(url)).toEqual({
      projectPath: '/Users/me/My Airport.asproj',
      relPath: 'scenarios/s1/media/I-06/board ü.png',
    })
  })
})

describe('review #53 regressions', () => {
  it('SafeId rejects path-like ids', async () => {
    const { SafeId } = await import('./common')
    for (const bad of ['..', '.', '', 'a/b', '../x', '.hidden', 'a\\b'])
      expect(SafeId.safeParse(bad).success, bad).toBe(false)
    for (const ok of ['01JABCDEF', 'I-07b', 'msel_phase'])
      expect(SafeId.safeParse(ok).success, ok).toBe(true)
  })

  it('patchOf leaves omitted fields undefined instead of applying defaults', async () => {
    const { patchOf } = await import('./common')
    const { EmbeddingSettings } = await import('./settings')
    const { Brand } = await import('./project')
    expect(patchOf(EmbeddingSettings).parse({ providerId: 'x' })).toEqual({ providerId: 'x' })
    expect(patchOf(Brand).parse({ city: 'Akron' })).toEqual({ city: 'Akron' })
    expect(() => patchOf(EmbeddingSettings).parse({ mode: 'nope' })).toThrow()
  })

  it('settings:update request keeps a one-field patch to one field', async () => {
    const { channels } = await import('../ipc')
    expect(channels['settings:update'].req.parse({ ui: {} })).toEqual({ ui: {} })
    expect(channels['settings:update'].req.parse({ embeddings: { providerId: 'x' } })).toEqual({
      embeddings: { providerId: 'x' },
    })
  })

  it('mergeChannels refuses duplicate names', async () => {
    const { mergeChannels, channel } = await import('../ipc')
    const { z } = await import('zod')
    const a = { 'x:y': channel(z.void(), z.void()) }
    expect(() => mergeChannels(a, a)).toThrow(/Duplicate/)
  })

  it('provider base URLs must be http(s)', async () => {
    const { ProviderConfig } = await import('./provider')
    const base = { id: 'p', kind: 'openai-compatible', label: 'LM Studio' }
    expect(ProviderConfig.safeParse({ ...base, baseUrl: 'http://127.0.0.1:1234/v1' }).success).toBe(
      true,
    )
    expect(ProviderConfig.safeParse({ ...base, baseUrl: 'javascript:alert(1)' }).success).toBe(
      false,
    )
    expect(ProviderConfig.safeParse({ ...base, baseUrl: 'file:///etc/passwd' }).success).toBe(false)
  })

  it('explains newer project formats', () => {
    const r = Project.safeParse({
      formatVersion: 99,
      id: 'p1',
      name: 'X',
      createdAt: now,
      updatedAt: now,
      appVersion: '9',
    })
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toMatch(/newer version/)
  })
})
