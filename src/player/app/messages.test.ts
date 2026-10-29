import { describe, expect, it } from 'vitest'
import type { Opened } from '../../shared/live/codec'
import type { SeatView } from './items'
import { chatFromFrame, threadChannels, upsertMessage, type ChatMessage } from './messages'

const seat: SeatView = { clientId: 'c'.repeat(22), kind: 'player', roleId: 'pio', teamId: 'ops' }
const clock = () => 94

function frame(
  payload: Record<string, unknown>,
  over: { signedBy?: string; to?: string; ts?: number } = {},
): Opened<'message.send'> {
  return {
    type: 'message.send',
    from: 'ctrl',
    to: over.to ?? 'role:pio',
    seq: 1,
    ts: over.ts ?? 1000,
    signedBy: 'signedBy' in over ? over.signedBy : 'host',
    payload: {
      messageId: 'm'.repeat(22),
      channel: 'role:pio',
      text: 'Hi',
      attachments: [],
      ...payload,
    },
  } as unknown as Opened<'message.send'>
}

const chat = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'a',
  channel: 'role:pio',
  mine: true,
  playedBy: false,
  text: 'Hi',
  attachments: [],
  pendingPhotos: 0,
  exerciseTime: '1:30',
  ts: 100,
  status: 'sending',
  ...over,
})

describe('chatFromFrame', () => {
  it('shows a signed controller message with its persona and caption flag', () => {
    const m = chatFromFrame(frame({ persona: 'Channel 5 newsroom' }), seat, clock)
    expect(m).toMatchObject({
      mine: false,
      persona: 'Channel 5 newsroom',
      playedBy: true,
      exerciseTime: '1:34',
      status: 'sent',
    })
  })

  it('honours showPlayedBy false', () => {
    expect(chatFromFrame(frame({ persona: 'X', showPlayedBy: false }), seat, clock)!.playedBy).toBe(
      false,
    )
  })

  it('ignores a frame the controller did not sign', () => {
    expect(
      chatFromFrame(frame({ persona: 'X' }, { signedBy: undefined }), seat, clock),
    ).toBeUndefined()
  })

  it('ignores a channel the seat does not read', () => {
    expect(chatFromFrame(frame({ channel: 'role:ops' }), seat, clock)).toBeUndefined()
  })

  it('reads an echo of this seat as its own message under the original id', () => {
    const m = chatFromFrame(frame({ echoOf: 'o'.repeat(22), fromRole: 'pio' }), seat, clock)
    expect(m).toMatchObject({ id: 'o'.repeat(22), mine: true })
  })

  it('ignores an echo that names another seat', () => {
    expect(
      chatFromFrame(frame({ echoOf: 'o'.repeat(22), fromRole: 'ops' }), seat, clock),
    ).toBeUndefined()
  })
})

describe('upsertMessage', () => {
  it('settles a sending message when the echo arrives, keeping its place', () => {
    const list = upsertMessage([], chat({ pendingPhotos: 1 }))
    const next = upsertMessage(list, chat({ status: 'sent', ts: 5000, exerciseTime: '9:99' }))
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      status: 'sent',
      ts: 100,
      pendingPhotos: 0,
      exerciseTime: '1:30',
    })
  })

  it('keeps messages oldest first', () => {
    const list = upsertMessage(
      upsertMessage([], chat({ id: 'b', ts: 200 })),
      chat({ id: 'a', ts: 100 }),
    )
    expect(list.map((m) => m.id)).toEqual(['a', 'b'])
  })
})

describe('threadChannels', () => {
  it("always has the seat's own channel, then any other channel with messages", () => {
    expect(threadChannels([], 'role:pio')).toEqual(['role:pio'])
    expect(threadChannels([chat({ channel: 'team:ops' })], 'role:pio')).toEqual([
      'role:pio',
      'team:ops',
    ])
  })
})
