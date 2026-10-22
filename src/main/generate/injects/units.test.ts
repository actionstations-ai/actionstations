import { describe, expect, it } from 'vitest'
import type { Inject, MselRow } from '@shared/schemas'
import { factsSoFar, formatFacts } from './facts'
import { normalizeBrief, planMedia, positivePrompt, voiceLinesFromFields } from './media-plan'
import { chooseInjectType, schemaHints } from './type-map'
import type { LoadedTemplate } from '../../render/templates'

const row = (
  id: string,
  event: string,
  format: string,
  purposeTag: MselRow['purposeTag'] = 'CORE_NARRATIVE',
): MselRow => ({
  id,
  phaseId: 'p1',
  time: '0:15',
  from: 'Helpdesk',
  toRoleIds: ['it'],
  event,
  expectedAction: 'x',
  purposeTag,
  format,
  citations: [],
  locked: false,
})

const inject = (type: string, mselRowId: string, fields: Record<string, unknown> = {}): Inject => ({
  id: `inj-${mselRowId}`,
  mselRowId,
  type,
  title: 't',
  deliveryMode: 'hand_to_role',
  fields,
  citations: [],
  assets: [],
  versions: [],
  includeInDeck: true,
  locked: false,
})

const template = (type: string, imageSlots: string[] = []): LoadedTemplate =>
  ({
    dir: '/tmp/x',
    meta: {
      type,
      label: type,
      version: '1',
      width: 600,
      paper: false,
      variants: [],
      background: '#fff',
      imageSlots,
    },
    schema: {},
    preview: { fields: {}, assets: {} },
    html: '',
    css: '',
  }) as LoadedTemplate

describe('chooseInjectType', () => {
  const installed = [
    'tweet',
    'memo',
    'helpdesk_ticket',
    'time_jump_card',
    'startex_card',
    'endex_card',
  ]
  it('keeps the format when its template is installed', () => {
    expect(chooseInjectType(row('I-01', 'e', 'tweet'), installed)).toEqual({
      type: 'tweet',
      hasTemplate: true,
    })
  })
  it('falls back deterministically to the closest installed template', () => {
    expect(chooseInjectType(row('I-02', 'e', 'instagram_post'), installed)).toEqual({
      type: 'tweet',
      hasTemplate: true,
      requested: 'instagram_post',
    })
    expect(chooseInjectType(row('I-03', 'e', 'email_forward'), installed)).toMatchObject({
      type: 'memo',
      requested: 'email_forward',
    })
    expect(chooseInjectType(row('I-03', 'e', 'press_release'), installed)).toMatchObject({
      type: 'memo',
    })
  })
  it('keeps the type without a template when the chain has none installed', () => {
    expect(chooseInjectType(row('I-04', 'e', 'scene_photo'), installed)).toEqual({
      type: 'scene_photo',
      hasTemplate: false,
    })
    expect(chooseInjectType(row('I-04', 'e', 'not_a_type'), installed)).toEqual({
      type: 'time_jump_card',
      hasTemplate: true,
      requested: 'scenario_update',
    })
  })
  it('control rows become control cards whatever the format says', () => {
    expect(chooseInjectType(row('START', 'e', 'memo', 'STARTEX'), installed).type).toBe(
      'startex_card',
    )
    expect(chooseInjectType(row('I-05', 'e', 'tweet', 'TIME_JUMP'), installed).type).toBe(
      'time_jump_card',
    )
    expect(chooseInjectType(row('END', 'e', '', 'ENDEX'), installed).type).toBe('endex_card')
  })
})

describe('schemaHints', () => {
  it('lists every field with type, required flag, description and example', () => {
    const hints = schemaHints({
      required: ['ticketNo'],
      properties: {
        ticketNo: { type: 'string', description: 'Ticket number', examples: ['4492'] },
        priority: { type: 'string', enum: ['Low', 'High'] },
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: { ts: { type: 'string' }, msg: { type: 'string' } },
          },
        },
      },
    })
    expect(hints).toContain('- ticketNo (string, required) — Ticket number — e.g. "4492"')
    expect(hints).toContain('- priority (one of "Low" | "High")')
    expect(hints).toContain('- lines (array of {ts: string, msg: string})')
  })
})

describe('factsSoFar', () => {
  const rows = [
    row(
      'I-01',
      'Ticket #4492: vending machines at Gate B2. Workstation OPS_INTERN_03 (192.168.1.55).',
      'helpdesk_ticket',
    ),
    row('I-02', 'Tweet (@TravelGuy99): "DL 1245 to Atlanta shows Gate A1" #NCIA', 'tweet'),
    row('I-03', 'Log on AODB_SQL_MASTER 10.66.0.10: random_gate_generator.ps1 ran.', 'system_log'),
  ]
  it('collects identifiers from rows up to the current one and from earlier injects only', () => {
    const prior = [
      inject('tweet', 'I-02', {
        handle: '@TravelGuy99',
        text: 'Flight 666 to PURGATORY at Gate C4',
      }),
      inject('system_log', 'I-03', { host: 'FIDS-WEB-01' }),
    ]
    const facts = factsSoFar(rows, rows[2]!, prior)
    const values = facts.map((f) => f.value)
    expect(values).toEqual(
      expect.arrayContaining([
        'Ticket #4492',
        'OPS_INTERN_03',
        '192.168.1.55',
        '@TravelGuy99',
        'DL 1245',
        'Gate A1',
        'AODB_SQL_MASTER',
        '10.66.0.10',
        'random_gate_generator.ps1',
        'Flight 666',
        'Gate C4',
      ]),
    )
    expect(values).not.toContain('FIDS-WEB-01')
    expect(facts.find((f) => f.value === 'Flight 666')?.source).toBe('I-02')
    expect(facts.find((f) => f.value === 'Ticket #4492')?.kind).toBe('ticket')
  })
  it('formats grouped one-liners', () => {
    const lines = formatFacts(factsSoFar(rows, rows[0]!, []))
    expect(lines.find((l) => l.startsWith('hosts:'))).toContain('OPS_INTERN_03 (I-01)')
    expect(lines.find((l) => l.startsWith('IP addresses:'))).toContain('192.168.1.55')
  })
})

describe('planMedia', () => {
  it('template only for a text type', () => {
    const plan = planMedia(
      inject('helpdesk_ticket', 'I-01'),
      row('I-01', 'Ticket', 'helpdesk_ticket'),
      template('helpdesk_ticket'),
    )
    expect(plan).toMatchObject({ paths: ['template'], needsModel: false })
  })
  it('adds an AI image for a tweet with a photo when the template has a slot', () => {
    const r = row('I-04', 'Tweet with a photo of the FIDS board', 'tweet')
    expect(planMedia(inject('tweet', 'I-04'), r, template('tweet', ['photo']))).toMatchObject({
      paths: ['template', 'ai_image'],
      imageSlot: 'photo',
      imageStyle: 'phone',
      needsModel: true,
    })
    expect(planMedia(inject('tweet', 'I-04'), r, template('tweet')).paths).toEqual(['template'])
    expect(
      planMedia(
        inject('tweet', 'I-04'),
        row('I-04', 'Tweet: boards are wrong', 'tweet'),
        template('tweet', ['photo']),
      ).paths,
    ).toEqual(['template'])
  })
  it('scene photos are always AI; voice types get tts with the right post-FX', () => {
    expect(
      planMedia(inject('scene_photo', 'I-10'), row('I-10', 'Visual', 'scene_photo')),
    ).toMatchObject({ paths: ['ai_image'], imageStyle: 'phone' })
    expect(
      planMedia(
        inject('cctv_still', 'I-11'),
        row('I-11', 'CCTV', 'cctv_still'),
        template('cctv_still', ['frame']),
      ),
    ).toMatchObject({ paths: ['template', 'ai_image'], imageStyle: 'cctv', imageSlot: 'frame' })
    expect(
      planMedia(
        inject('radio_call', 'I-05b'),
        row('I-05b', 'Radio', 'radio_call'),
        template('radio_call'),
      ),
    ).toMatchObject({ paths: ['template', 'tts'], postFx: ['radio'] })
    expect(
      planMedia(inject('pa_announcement', 'I-06'), row('I-06', 'PA', 'pa_announcement')),
    ).toMatchObject({ paths: ['tts'], postFx: ['pa', 'terminal_ambience'] })
    expect(
      planMedia(
        inject('phone_call', 'I-07'),
        row('I-07', 'Phone', 'phone_call'),
        template('phone_call'),
      ).postFx,
    ).toEqual(['phone'])
  })
  it('video only when the row asks for footage, or when forced', () => {
    const r = row('I-11b', 'Tweet with shaky video of people yelling', 'tiktok_video_card')
    expect(
      planMedia(inject('tiktok_video_card', 'I-11b'), r, template('tiktok_video_card', ['thumb']))
        .paths,
    ).toEqual(['template', 'ai_image', 'ai_video'])
    expect(
      planMedia(
        inject('tweet', 'I-04'),
        row('I-04', 'Tweet', 'tweet'),
        template('tweet', ['photo']),
        ['ai_image'],
      ).paths,
    ).toEqual(['template', 'ai_image'])
    expect(
      planMedia(inject('memo', 'I-07'), row('I-07', 'Memo', 'memo'), template('memo'), ['ai_image'])
        .paths,
    ).toEqual(['template'])
  })
})

describe('normalizeBrief', () => {
  it('strips negations from the image prompt and merges the standard negative prompt', () => {
    expect(
      positivePrompt(
        'Crowded concourse, no readable text, dark screens, without logos or signage, late light.',
      ),
    ).toBe('Crowded concourse, dark screens, late light.')
    const plan = planMedia(inject('scene_photo', 'I-10'), row('I-10', 'Visual', 'scene_photo'))
    const brief = normalizeBrief(
      plan,
      {
        paths: ['ai_image'],
        imagePrompt: 'A terminal with no text anywhere',
        negativePrompt: 'empty terminal, Blurry',
      },
      inject('scene_photo', 'I-10'),
    )
    expect(brief.imagePrompt).toBe('A terminal')
    expect(brief.negativePrompt).toMatch(/^text, letters/)
    expect(brief.negativePrompt).toContain('empty terminal')
    expect(brief.negativePrompt?.match(/blurry/g)).toHaveLength(1)
    expect(brief.imageStyle).toBe('phone')
  })
  it('forces the planned paths and falls back to voice lines from the fields', () => {
    const inj = inject('radio_call', 'I-05b', {
      callsign: 'Parking 3',
      transcript: [
        { speaker: 'Parking 3', text: 'Fire alarm Level 3.' },
        { speaker: 'Ops', text: 'Copy.' },
      ],
    })
    const plan = planMedia(inj, row('I-05b', 'Radio', 'radio_call'), template('radio_call'))
    const brief = normalizeBrief(plan, { paths: ['ai_video'], voiceLines: [] }, inj)
    expect(brief.paths).toEqual(['template', 'tts'])
    expect(brief.voiceLines).toEqual([
      { speaker: 'Parking 3', voiceStyle: '', text: 'Fire alarm Level 3.' },
      { speaker: 'Ops', voiceStyle: '', text: 'Copy.' },
    ])
    expect(brief.postFx).toEqual(['radio'])
    expect(brief.imagePrompt).toBeUndefined()
    expect(
      voiceLinesFromFields(
        inject('pa_announcement', 'I-06', { text: 'Flight 666 to Purgatory is now boarding.' }),
      ),
    ).toEqual([
      { speaker: 'Caller', voiceStyle: '', text: 'Flight 666 to Purgatory is now boarding.' },
    ])
  })
})
