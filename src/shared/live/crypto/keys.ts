/**
 * Session key material per epoch. Two roots: the staff root (controllers, evaluators, SimCell)
 * and the players root derived from it with HKDF, so a staff link can read everything and a
 * player link cannot read staff material. Each root derives its own AES-256-GCM key.
 */
import { bytesEqual, toBase64Url, toHex } from '../bytes'
import {
  EC_PUBLIC_KEY_BYTES,
  HKDF_INFO,
  JOIN_TOKEN_BYTES,
  MAX_EPOCH,
  SESSION_KEY_BYTES,
  STAFF_PROOF_BYTES,
  type KeyKind,
} from '../protocol'
import type { KeyName } from '../schemas/envelope'
import type { CryptoProvider, KeyPair } from './provider'

export interface EpochKeys {
  epoch: number
  playersRoot: Uint8Array
  playersEnc: Uint8Array
  staffRoot?: Uint8Array
  staffEnc?: Uint8Array
}

export type KeyLookup =
  | { ok: true; key: Uint8Array; kind: KeyKind; epoch: number }
  | { ok: false; reason: 'UNKNOWN_EPOCH' | 'STAFF_ONLY' }

export function keyName(kind: KeyKind, epoch: number): KeyName {
  return `${kind === 'staff' ? 't' : 's'}${epoch}`
}

export function parseKeyName(name: string): { kind: KeyKind; epoch: number } | undefined {
  const m = /^([st])([1-9]\d{0,3})$/.exec(name)
  if (!m) return undefined
  return { kind: m[1] === 't' ? 'staff' : 'players', epoch: Number(m[2]) }
}

export interface SessionKeysOptions {
  /** The controller's ECDH public key from the invite: frames to the controller are sealed to it. */
  controllerEcdhPub?: Uint8Array
  /** Controller only: the matching key pair, to open frames sealed to it. */
  controllerEcdh?: KeyPair
}

export class SessionKeys {
  private readonly epochs = new Map<number, EpochKeys>()
  private current = 0
  /** Public key frames to the controller are sealed to; the controller's own when `controllerEcdh` is set. */
  readonly controllerEcdhPub: Uint8Array | undefined
  /** Set only on the controller. */
  readonly controllerEcdh: KeyPair | undefined

  constructor(
    readonly sessionId: string,
    private readonly crypto: CryptoProvider,
    options: SessionKeysOptions = {},
  ) {
    this.controllerEcdh = options.controllerEcdh
    this.controllerEcdhPub = options.controllerEcdh?.publicKey ?? options.controllerEcdhPub
    if (this.controllerEcdhPub && this.controllerEcdhPub.length !== EC_PUBLIC_KEY_BYTES) {
      throw new Error('Controller ECDH public key must be 65 bytes')
    }
  }

  /** Controller: a fresh staff root for epoch 1 and a fresh ECDH key pair. */
  static async create(crypto: CryptoProvider, sessionId: string): Promise<SessionKeys> {
    const keys = new SessionKeys(sessionId, crypto, { controllerEcdh: await crypto.ecdhGenerate() })
    await keys.addEpoch(1, 'staff', crypto.random(SESSION_KEY_BYTES))
    return keys
  }

  /** True on the controller: it can open frames sealed to it. */
  get isController(): boolean {
    return this.controllerEcdh !== undefined
  }

  /** The root a link or a rekey carries, for one epoch. Derives everything else. */
  async addEpoch(epoch: number, kind: KeyKind, root: Uint8Array): Promise<EpochKeys> {
    if (!Number.isInteger(epoch) || epoch < 1 || epoch > MAX_EPOCH) throw new Error('Bad epoch')
    if (root.length !== SESSION_KEY_BYTES) throw new Error('Root key must be 32 bytes')
    const keys =
      kind === 'staff'
        ? await this.deriveFromStaff(epoch, root)
        : await this.derivePlayers(epoch, root)
    this.epochs.set(epoch, keys)
    if (epoch > this.current) this.current = epoch
    return keys
  }

  private async derivePlayers(epoch: number, playersRoot: Uint8Array): Promise<EpochKeys> {
    const playersEnc = await this.crypto.hkdf(
      playersRoot,
      HKDF_INFO.enc('players', this.sessionId),
      32,
    )
    return { epoch, playersRoot, playersEnc }
  }

  private async deriveFromStaff(epoch: number, staffRoot: Uint8Array): Promise<EpochKeys> {
    const playersRoot = await this.crypto.hkdf(
      staffRoot,
      HKDF_INFO.players(this.sessionId),
      SESSION_KEY_BYTES,
    )
    const staffEnc = await this.crypto.hkdf(staffRoot, HKDF_INFO.enc('staff', this.sessionId), 32)
    return { ...(await this.derivePlayers(epoch, playersRoot)), staffRoot, staffEnc }
  }

  get currentEpoch(): number {
    return this.current
  }

  /** True when this holder can read staff material in the current epoch. */
  get hasStaff(): boolean {
    return this.epochs.get(this.current)?.staffRoot !== undefined
  }

  get knownEpochs(): number[] {
    return [...this.epochs.keys()].sort((a, b) => a - b)
  }

  epoch(epoch: number): EpochKeys | undefined {
    return this.epochs.get(epoch)
  }

  /** The root a holder would pass on (to wrap for a client, or to put in a link). */
  root(kind: KeyKind, epoch = this.current): Uint8Array | undefined {
    const e = this.epochs.get(epoch)
    return kind === 'staff' ? e?.staffRoot : e?.playersRoot
  }

  /** The AES key named by a ciphertext's `k`. */
  lookup(name: string): KeyLookup {
    const parsed = parseKeyName(name)
    if (!parsed) return { ok: false, reason: 'UNKNOWN_EPOCH' }
    const e = this.epochs.get(parsed.epoch)
    if (parsed.kind === 'staff') {
      // Holding no staff key in any epoch is a player's normal state, not an error.
      if (![...this.epochs.values()].some((x) => x.staffEnc)) {
        return { ok: false, reason: 'STAFF_ONLY' }
      }
      if (!e?.staffEnc) return { ok: false, reason: 'UNKNOWN_EPOCH' }
      return { ok: true, key: e.staffEnc, kind: 'staff', epoch: parsed.epoch }
    }
    if (!e) return { ok: false, reason: 'UNKNOWN_EPOCH' }
    return { ok: true, key: e.playersEnc, kind: 'players', epoch: parsed.epoch }
  }

  /** Key name and AES key for sealing in the current epoch. */
  sealingKey(kind: KeyKind, epoch = this.current): { name: KeyName; key: Uint8Array } {
    const e = this.epochs.get(epoch)
    if (!e) throw new Error(`Unknown epoch ${epoch}`)
    if (kind === 'staff') {
      if (!e.staffEnc) throw new Error('This client holds no staff key')
      return { name: keyName('staff', epoch), key: e.staffEnc }
    }
    return { name: keyName('players', epoch), key: e.playersEnc }
  }

  /** Presented on connect; the server stores only its SHA-256. Derived from the players root. */
  async joinToken(epoch = this.current): Promise<Uint8Array> {
    const e = this.epochs.get(epoch)
    if (!e) throw new Error(`Unknown epoch ${epoch}`)
    return this.crypto.hkdf(e.playersRoot, HKDF_INFO.join(this.sessionId), JOIN_TOKEN_BYTES)
  }

  async joinTokenHash(epoch = this.current): Promise<string> {
    return toHex(await this.crypto.sha256(await this.joinToken(epoch)))
  }

  /**
   * A staff device's proof that it holds the current staff root, bound to its client id and
   * ECDH public key (`join.staffProof`). Undefined when this holder has no staff key.
   */
  async staffProof(clientId: string, ecdhPub: Uint8Array): Promise<Uint8Array | undefined> {
    const root = this.root('staff')
    if (!root) return undefined
    const info = HKDF_INFO.staffProof(this.sessionId, clientId, toBase64Url(ecdhPub))
    return this.crypto.hkdf(root, info, STAFF_PROOF_BYTES)
  }

  /** Controller: whether `proof` is the current epoch's staff proof for this client. */
  async verifyStaffProof(
    clientId: string,
    ecdhPub: Uint8Array,
    proof: Uint8Array | undefined,
  ): Promise<boolean> {
    if (!proof) return false
    const expected = await this.staffProof(clientId, ecdhPub)
    return expected !== undefined && bytesEqual(expected, proof)
  }

  /** Drop every epoch before `epoch`; history sealed under them becomes unreadable. */
  forgetBefore(epoch: number): void {
    for (const e of this.epochs.keys()) if (e < epoch) this.epochs.delete(e)
  }
}

export async function hashJoinToken(crypto: CryptoProvider, token: Uint8Array): Promise<string> {
  return toHex(await crypto.sha256(token))
}
