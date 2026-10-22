// Domain-aware inject plumbing (ADR-0014): type choice honours the taxonomy's domain tags,
// and the media planner takes its scene anchors from the project's profile.
import { describe, expect, it } from 'vitest'
import type { Inject, MselRow } from '@shared/schemas'
import { builtinProfile } from '@shared/domains'
import { anchoredPrompt, normalizeBrief, planMedia, sceneKind } from './media-plan'
import { chooseInjectType, KEY_FIELDS, TYPE_FALLBACKS } from './type-map'
import { INJECT_TYPES } from '@shared/taxonomy'

const row = (format: string, from = 'Dispatcher'): MselRow => ({
  id: 'I-01',
  phaseId: 'p1',
  time: '0:10',
  from,
  toRoleIds: ['ops'],
  event: 'The arrivals board at the Central Transit Center shows every bus as DUE.',
  expectedAction: '',
  purposeTag: 'CORE_NARRATIVE',
  format,
  citations: [],
  locked: false,
})

const ALL = INJECT_TYPES.map((t) => t.id)

describe('chooseInjectType with a domain', () => {
  it('keeps a FIDS board for an airport and swaps it for the generic board elsewhere', () => {
    expect(chooseInjectType(row('fids_board'), ALL, 'airport')).toMatchObject({
      type: 'fids_board',
      hasTemplate: true,
    })
    const transit = chooseInjectType(row('fids_board'), ALL, 'transit')
    expect(transit).toMatchObject({
      type: 'info_display_board',
      hasTemplate: true,
      requested: 'fids_board',
    })
    expect(transit.note).toMatch(/another domain/)
    expect(chooseInjectType(row('bhs_scada_screen'), ALL, 'water_dam').type).toBe('scada_hmi')
    // Without a domain id (older callers), nothing changes.
    expect(chooseInjectType(row('fids_board'), ALL).type).toBe('fids_board')
  })

  it('falls back to a scenario update when neither the type nor its chain fits the domain', () => {
    const installed = ['fids_board', 'scenario_update']
    expect(chooseInjectType(row('fids_board'), installed, 'transit')).toMatchObject({
      type: 'scenario_update',
      hasTemplate: true,
      requested: 'fids_board',
    })
  })

  it('has fallbacks and key fields for every new generic type', () => {
    for (const id of [
      'info_display_board',
      'scada_hmi',
      'uas_detection_alert',
      'avl_fleet_map',
      'incident_alert_notification',
      'field_report',
    ]) {
      expect(TYPE_FALLBACKS[id], id).toBeDefined()
      expect(KEY_FIELDS[id], id).toBeDefined()
    }
  })
})

describe('scene anchors from the profile', () => {
  const inject = (fields: Record<string, unknown>): Inject => ({
    id: 'inj',
    mselRowId: 'I-01',
    type: 'scene_photo',
    title: 't',
    deliveryMode: 'display_main_screen',
    fields,
    citations: [],
    assets: [],
    versions: [],
    includeInDeck: true,
    locked: false,
  })

  it('classifies a prompt as public, control or exterior', () => {
    expect(sceneKind('riders waiting at the transit center')).toBe('public')
    expect(sceneKind('dispatchers at the console in the operations control center')).toBe('control')
    expect(sceneKind('a bus on the street with hazards on')).toBe('exterior')
  })

  it('prefixes the transit anchors, not the airport ones, for a transit project', () => {
    const transit = builtinProfile('transit').sceneAnchors
    const p = anchoredPrompt('a crowd of riders waiting', 'phone', {
      orgType: 'transit',
      anchors: transit,
    })
    expect(p).toContain('bus transit center')
    expect(p).not.toMatch(/airport|terminal/i)
    expect(anchoredPrompt('dispatchers at the console', 'press', { orgType: 'transit' })).toContain(
      'operations control center',
    )
    // The generic profile adds no setting anchor; the airport keeps its legacy one.
    expect(anchoredPrompt('a lobby', 'phone', { orgType: 'generic' })).toBe(
      'Candid smartphone snapshot, slight tilt, natural color balance, neutral white balance. a lobby',
    )
    expect(anchoredPrompt('a crowd', 'phone', { orgType: 'airport' })).toContain(
      'airport passenger terminal',
    )
  })

  it('drops the screens from a dam control-room anchor when the brief says the screens are dark', () => {
    const dam = builtinProfile('water_dam').sceneAnchors
    const plan = planMedia(
      inject({ sceneBrief: 'the control room with its monitors dark after the outage' }),
      row('scene_photo'),
    )
    const brief = normalizeBrief(
      plan,
      undefined,
      inject({ sceneBrief: 'the control room with its monitors dark after the outage' }),
      {
        orgType: 'water_dam',
        anchors: dam,
      },
    )
    expect(brief.imagePrompt).toContain('hydroelectric plant control room')
    expect(brief.imagePrompt).not.toMatch(/monitors/)
    expect(brief.negativePrompt).toContain('illuminated screens')
  })
})
