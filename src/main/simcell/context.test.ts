import { describe, expect, it } from 'vitest'
import type { Scenario } from '@shared/schemas'
import { buildPersonaView, silentFor, THREAD_LINES, type ThreadLine } from './context'
import { reporter } from './test-fixtures'

const msel = [
  {
    id: 'I-05',
    time: '1:15',
    event: 'A reporter calls the press desk about long queues.',
    expectedAction: 'EXPECTED-ACTION-SECRET: PIO issues holding statement',
  },
  { id: 'I-09', time: '2:00', event: 'Another party writes about the cause.', expectedAction: 'x' },
] as unknown as Scenario['msel']

const line = (who: ThreadLine['who'], text: string, at: number): ThreadLine => ({
  who,
  text,
  exerciseTime: '1:20',
  at,
})

function view(over: Partial<Parameters<typeof buildPersonaView>[0]> = {}) {
  return buildPersonaView({
    card: reporter,
    scenario: { msel },
    releasedRowIds: new Set(['I-05']),
    thread: [line('player', 'We are looking into it.', 1)],
    clock: { minutes: 95, label: '1:35' },
    channel: 'message',
    trigger: 'The players wrote to this character.',
    playerMessage: 'We are looking into it.',
    nowMs: 10 * 60_000,
    ...over,
  })
}

describe('a persona view', () => {
  it('never carries expected actions or MSEL rows that are not linked and released', () => {
    const text = JSON.stringify(view())
    expect(text).not.toContain('EXPECTED-ACTION-SECRET')
    expect(text).not.toContain('Another party writes about the cause')
    expect(text).toContain('A reporter calls the press desk')
  })

  it('leaves out a linked row that has not been released', () => {
    const v = view({ releasedRowIds: new Set() })
    expect(v.events).toEqual([])
  })

  it('holds only the fields on the card, the clock, its thread and the trigger', () => {
    expect(Object.keys(view()).sort()).toEqual([
      'channel',
      'clock',
      'events',
      'instruction',
      'limit',
      'persona',
      'playerMessage',
      'thread',
      'trigger',
    ])
  })

  it('marks a passed deadline and a time-based rule from the clock', () => {
    const v = view() as { persona: { deadlines: { status: string }[] } }
    expect(v.persona.deadlines[0]!.status).toBe('passed')
    expect(view({ clock: { minutes: 30, label: '0:30' } })).toMatchObject({
      persona: { deadlines: [{ status: 'not yet' }] },
    })
  })

  it('says whether a no-reply rule and a row rule are true now', () => {
    const quiet = [line('persona', 'Any word?', 0)]
    const v = view({ thread: quiet, nowMs: 11 * 60_000 }) as {
      persona: { escalationRules: { id: string; status: string }[] }
    }
    const status = Object.fromEntries(v.persona.escalationRules.map((r) => [r.id, r.status]))
    expect(status).toEqual({ r1: 'true now', r2: 'true now' })
  })

  it('keeps the last 20 thread lines and labels who spoke', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      line(i % 2 ? 'persona' : 'player', `m${i}`, i),
    )
    const v = view({ thread: many }) as { thread: { who: string; text: string }[] }
    expect(v.thread).toHaveLength(THREAD_LINES)
    expect(v.thread.at(-1)!.text).toBe('m29')
    expect(v.thread.at(-1)!.who).toBe('Dana Whitlock')
    expect(v.thread[0]!.text).toBe('m10')
  })
})

describe('silence', () => {
  it('counts only when the persona spoke last and enough time passed', () => {
    const spoke = [line('persona', 'Hello?', 0)]
    expect(silentFor(spoke, 10, 9 * 60_000)).toBe(false)
    expect(silentFor(spoke, 10, 10 * 60_000)).toBe(true)
    expect(silentFor([...spoke, line('player', 'Here.', 5)], 10, 20 * 60_000)).toBe(false)
    expect(silentFor([], 10, 20 * 60_000)).toBe(false)
  })
})
