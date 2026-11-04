import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeController } from '@shared/live/fixtures/setup'
import { parseInvite, pinFromFingerprint } from '@shared/live/invite'
import { bytesEqual } from '@shared/live/bytes'
import { inviteViews } from './invites'

interface MobileVector {
  name: string
  url: string
  pageAccepts: boolean
  pin?: string
}

const FP = Array.from({ length: 32 }, () => 'AB').join(':')

describe('session invites', () => {
  it('carry the certificate pin for the player apps when the server has one (spec 0446 FR-2)', async () => {
    const ctl = await makeController()
    const material = {
      origin: 'https://192.168.4.20:8485',
      sessionId: ctl.sessionId,
      keys: ctl.keys,
      controllerPub: ctl.controllerPub,
    }
    const pinned = inviteViews({ ...material, fingerprintSha256: FP })
    for (const view of [pinned.players, pinned.staff]) {
      const pin = parseInvite(view.url).pin
      expect(pin && bytesEqual(pin, pinFromFingerprint(FP))).toBe(true)
    }
    expect(parseInvite(inviteViews(material).players.url).pin).toBeUndefined()
  })

  it('agree with the player apps on every shared vector (mobile/fixtures/invites.json)', () => {
    const file = resolve(__dirname, '../../../mobile/fixtures/invites.json')
    const { vectors } = JSON.parse(readFileSync(file, 'utf8')) as { vectors: MobileVector[] }
    for (const v of vectors) {
      let parsed: ReturnType<typeof parseInvite> | undefined
      try {
        parsed = parseInvite(v.url)
      } catch {
        parsed = undefined
      }
      expect(parsed !== undefined, v.name).toBe(v.pageAccepts)
      if (parsed && v.pin) {
        expect(bytesEqual(parsed.pin!, pinFromFingerprint(v.pin)), v.name).toBe(true)
      }
    }
  })
})
