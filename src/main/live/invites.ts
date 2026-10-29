/**
 * The two join links of a session (spec 0406: players link and staff link) with their QR codes
 * as module matrices, for the Facilitate page and the presentation window. The URL carries the
 * key in its fragment and is never logged; the QR is derived from the same URL.
 */
import QRCode from 'qrcode'
import type { SessionKeys } from '@shared/live/crypto/keys'
import { buildInvite } from '@shared/live/invite'
import type { KeyKind } from '@shared/live/protocol'
import type { InviteView, QrMatrix } from '@shared/schemas/live'

export function qrMatrix(text: string): QrMatrix {
  const code = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const { size, data } = code.modules
  const rows: string[] = []
  for (let y = 0; y < size; y++) {
    let row = ''
    for (let x = 0; x < size; x++) row += data[y * size + x] ? '1' : '0'
    rows.push(row)
  }
  return { size, rows }
}

export interface InviteMaterial {
  /** `https://192.168.4.20:8485` */
  origin: string
  sessionId: string
  keys: SessionKeys
  controllerPub: Uint8Array
}

export function inviteView(m: InviteMaterial, kind: KeyKind, now = new Date()): InviteView {
  const root = m.keys.root(kind)
  if (!root || !m.keys.controllerEcdhPub) throw new Error(`No ${kind} root for this epoch`)
  const url = buildInvite({
    base: m.origin,
    sessionId: m.sessionId,
    epoch: m.keys.currentEpoch,
    key: { kind, root },
    controllerPub: m.controllerPub,
    controllerEcdhPub: m.keys.controllerEcdhPub,
  })
  return { kind, url, epoch: m.keys.currentEpoch, issuedAt: now.toISOString(), qr: qrMatrix(url) }
}

export function inviteViews(m: InviteMaterial, now = new Date()) {
  return { players: inviteView(m, 'players', now), staff: inviteView(m, 'staff', now) }
}
