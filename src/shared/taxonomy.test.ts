// Inject type registry (#261): INJECT_TYPES stays built-in; registered types join the lookups.
import { afterEach, describe, expect, it } from 'vitest'
import {
  INJECT_TYPES,
  INJECT_TYPE_IDS,
  injectTypeInfo,
  injectTypes,
  injectTypesForDomain,
  injectTypesRevision,
  isInjectTypeId,
  registerInjectTypes,
  registeredInjectTypes,
  subscribeInjectTypes,
  type InjectTypeInfo,
} from './taxonomy'

const board: InjectTypeInfo = {
  id: 'rail_dispatch_board',
  label: 'Rail dispatch board',
  category: 'operational',
  render: ['template'],
  paper: false,
  mvp: false,
  defaultDelivery: 'display_main_screen',
  domains: ['heritage_rail'],
  source: 'pack',
  pack: { id: 'ai.actionstations.heritage-rail', version: '1.0.0', name: 'Freight Rail' },
}

afterEach(() => registerInjectTypes([]))

describe('inject type registry', () => {
  it('starts with the built-in list only', () => {
    expect(injectTypes()).toEqual(INJECT_TYPES)
    expect(isInjectTypeId('rail_dispatch_board')).toBe(false)
  })

  it('adds registered types to the lookups and domain filters', () => {
    let calls = 0
    const off = subscribeInjectTypes(() => calls++)
    const rev = injectTypesRevision()
    registerInjectTypes([board])
    off()
    expect(calls).toBe(1)
    expect(injectTypesRevision()).toBe(rev + 1)
    expect(injectTypeInfo('rail_dispatch_board')).toEqual(board)
    expect(isInjectTypeId('rail_dispatch_board')).toBe(true)
    expect(injectTypesForDomain('heritage_rail').map((t) => t.id)).toContain('rail_dispatch_board')
    expect(injectTypesForDomain('transit').map((t) => t.id)).not.toContain('rail_dispatch_board')
    expect(INJECT_TYPE_IDS).not.toContain('rail_dispatch_board')
  })

  it('never lets a registered entry shadow a built-in one, nor repeat an id', () => {
    registerInjectTypes([
      { ...board, id: 'tweet', label: 'Pack tweet' },
      board,
      { ...board, label: 'Second' },
      { ...board, id: '../x' },
    ])
    expect(injectTypeInfo('tweet')?.label).toBe('Tweet / X post')
    expect(registeredInjectTypes().map((t) => t.label)).toEqual(['Rail dispatch board'])
  })
})

describe('domain templates from the research dossiers (#324)', () => {
  it('tags the domain-specific types and leaves the cross-domain ones for every domain', () => {
    expect(injectTypeInfo('notam')?.domains).toEqual([
      'airport',
      'stadium_venue',
      'unmanned_systems',
    ])
    expect(injectTypeInfo('rider_service_alert')?.domains).toEqual(['transit'])
    expect(injectTypeInfo('boil_water_notice')?.domains).toContain('water_utility')
    const generic = injectTypesForDomain('generic').map((t) => t.id)
    for (const id of [
      'alarm_summary',
      'service_status_page',
      'leak_site_post',
      'security_advisory',
      'nws_weather_warning',
      'ics_213_general_message',
      'ics_214_activity_log',
      'chain_of_custody_form',
      'regulatory_report_form',
      'lab_result_report',
      'breach_notification_letter',
      'downtime_notice',
    ])
      expect(generic, id).toContain(id)
    expect(generic).not.toContain('rider_service_alert')
    expect(injectTypesForDomain('transit').map((t) => t.id)).toContain('rider_service_alert')
  })
})

describe('second domain template batch and profile inject types (#331)', () => {
  const profiles = Object.values(
    import.meta.glob<{ id: string; injectTypes: string[] }>('../../packs/domains/*.json', {
      eager: true,
      import: 'default',
    }),
  )

  it('tags the single-domain types and leaves the cross-domain ones for every domain', () => {
    expect(injectTypeInfo('track_bulletin')?.domains).toEqual(['freight_rail'])
    expect(injectTypeInfo('msib_cotp_order')?.domains).toEqual(['port_maritime'])
    expect(injectTypeInfo('hl7_interface_monitor')?.domains).toEqual(['healthcare'])
    expect(injectTypeInfo('gcs_telemetry_screen')?.domains).toEqual(['unmanned_systems'])
    expect(injectTypeInfo('election_results_page')?.domains).toEqual(['elections'])
    const generic = injectTypesForDomain('generic').map((t) => t.id)
    for (const id of [
      'wire_transfer_request',
      'sds_excerpt',
      'emergency_declaration',
      'reunification_notice',
    ])
      expect(generic, id).toContain(id)
    expect(generic).not.toContain('track_bulletin')
  })

  it('every profile offers only known types that its domain may use, once each', () => {
    expect(profiles.length).toBeGreaterThanOrEqual(25)
    for (const p of profiles) {
      const allowed = new Set(injectTypesForDomain(p.id).map((t) => t.id))
      for (const t of p.injectTypes) {
        expect(isInjectTypeId(t), `${p.id}: ${t}`).toBe(true)
        expect(allowed.has(t), `${p.id}: ${t} is tagged for other domains`).toBe(true)
      }
      expect(new Set(p.injectTypes).size, `${p.id}: duplicates`).toBe(p.injectTypes.length)
    }
  })

  it('every domain-tagged template type is offered by the profiles of its domains', () => {
    const byId = new Map(profiles.map((p) => [p.id, p]))
    for (const t of INJECT_TYPES.filter((x) => x.domains?.length && x.render.includes('template')))
      for (const d of t.domains!)
        expect(byId.get(d)?.injectTypes, `${d} should offer ${t.id}`).toContain(t.id)
  })
})
