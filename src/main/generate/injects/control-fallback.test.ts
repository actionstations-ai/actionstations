// Control cards built from the MSEL row when the model fails (#166), on the uas I-29 row.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import type { MselRow } from '@shared/schemas'
import { controlCardFields, jumpTime } from './control-fallback'

const I29: MselRow = {
  id: 'I-29',
  phaseId: 'p4',
  time: '3:00',
  wallClock: '12:00',
  from: 'Facilitator',
  toRoleIds: ['all'],
  event:
    'Time Jump: It is now 13:15. The drone has been identified and the operator apprehended. The problem has resolved, but the final steps of documentation, handover, and closure remain.',
  expectedAction: 'All roles confirm readiness for closure procedures.',
  purposeTag: 'TIME_JUMP',
  format: 'time_jump_card',
  citations: [],
  locked: false,
}

const schema = (type: string) =>
  JSON.parse(readFileSync(resolve('templates/injects', type, 'schema.json'), 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strict: false })

describe('controlCardFields', () => {
  it('builds a valid time_jump_card for the uas I-29 row', () => {
    const fields = controlCardFields('time_jump_card', I29, 'Sky Watcher')!
    expect(fields).toEqual({
      exerciseTime: '3:00',
      scenarioTitle: 'Sky Watcher',
      injectId: 'I-29',
      newTime: '13:15',
      narration: expect.stringMatching(/^It is now 13:15\. The drone has been identified/),
      worldState: [
        'The drone has been identified and the operator apprehended.',
        'The problem has resolved, but the final steps of documentation, handover, and closure remain.',
      ],
    })
    expect(ajv.compile(schema('time_jump_card'))(fields)).toBe(true)
  })

  it('builds valid STARTEX and ENDEX cards and nothing for other types', () => {
    const start = { ...I29, id: 'START', purposeTag: 'STARTEX', event: 'STARTEX: Normal shift.' }
    const startex = controlCardFields('startex_card', start as MselRow, 'S')!
    expect(startex).toMatchObject({ startTime: '12:00', narration: 'Normal shift.' })
    expect(ajv.compile(schema('startex_card'))(startex)).toBe(true)
    const endex = controlCardFields('endex_card', { ...I29, event: 'ENDEX: All clear.' }, 'S')!
    expect(endex).toMatchObject({ endTime: '12:00', resolution: 'All clear.' })
    expect(ajv.compile(schema('endex_card'))(endex)).toBe(true)
    expect(controlCardFields('memo', I29, 'S')).toBeUndefined()
  })

  it("takes the new clock from the event, else the row's clock", () => {
    expect(jumpTime({ ...I29, event: 'SCENARIO JUMP: It is now 10:00 AM. More errors.' })).toBe(
      '10:00 AM',
    )
    expect(jumpTime({ ...I29, event: 'Time jump: one hour later.' })).toBe('12:00')
  })
})
