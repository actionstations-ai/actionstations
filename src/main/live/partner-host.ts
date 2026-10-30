/**
 * The host's side of a partner organization joining as a co-controller (spec 0440 FR-19, FR-20,
 * spec 0406 `partner.receipt`).
 *
 * Receipts are sealed to the host alone, so a partner's app cannot read how players took the
 * injects it released. The host forwards them: for each receipt on a release a roster key signed,
 * it sends that partner one `partner.receipt` (staff key, signed by the host, addressed to the
 * partner's own connection) naming the row, the role and the status. Never a device id, a name
 * or a receipt for anyone else's release.
 */
import type { LiveClient } from '@shared/live/client'
import type { InjectReceiptPayload } from '@shared/live/schemas'
import type { SessionLogInput } from '@shared/schemas/live'

export interface PartnerHostDeps {
  /** Where the client remembers who signed each release (`LiveClient.scope`). */
  releases: LiveClient['scope']['releases']
  roleOf: (clientId: string) => string | undefined
  /** Whether the host itself released this id: its receipts are never forwarded. */
  isHostRelease?: (releaseId: string) => boolean
  /** What a seated device reads as its own (`all`, `client:<id>`, `role:<id>`); undefined if not seated. */
  destinationsOf?: (clientId: string) => ReadonlySet<string> | undefined
  /** Receipts already forwarded (`release:device:status`), so a repeat is not forwarded twice. */
  forwarded?: Set<string>
  send: (to: `client:${string}`, payload: Record<string, unknown>) => Promise<unknown>
  log: { append: (input: SessionLogInput) => Promise<unknown> }
}

const MAX_FORWARDED = 50_000

/** Forward one device receipt to the partner whose release it is for. Returns whether it went. */
export async function forwardReceipt(
  deps: PartnerHostDeps,
  from: string,
  receipt: InjectReceiptPayload,
): Promise<boolean> {
  const owner = deps.releases.get(receipt.releaseId)
  if (!owner || owner.signer === 'host' || deps.isHostRelease?.(receipt.releaseId)) return false
  // Only a seated device the release was addressed to, and only the first time per status.
  const dests = deps.destinationsOf?.(from)
  if (deps.destinationsOf && (!dests || !owner.targets.some((t) => dests.has(t)))) return false
  const key = `${receipt.releaseId}:${from}:${receipt.status}`
  if (deps.forwarded) {
    if (deps.forwarded.has(key) || deps.forwarded.size >= MAX_FORWARDED) return false
    deps.forwarded.add(key)
  }
  const roleId = deps.roleOf(from)
  await deps.send(`client:${owner.from}`, {
    releaseId: receipt.releaseId,
    mselRowId: owner.mselRowId,
    ...(roleId ? { roleId } : {}),
    status: receipt.status,
    at: receipt.at,
  })
  return true
}

/** Record a co-controller's release in the host's log: the host's log is the whole exercise's. */
export async function logPartnerRelease(
  deps: Pick<PartnerHostDeps, 'log'>,
  signer: string,
  release: { releaseId: string; mselRowId: string; targets: readonly string[]; injectId?: string },
): Promise<void> {
  await deps.log.append({
    kind: 'inject.release',
    actor: { kind: 'controller', persona: signer.slice(0, 80) },
    ref: {
      rowId: release.mselRowId,
      releaseId: release.releaseId,
      ...(release.injectId ? { injectId: release.injectId } : {}),
    },
    data: { targets: release.targets, signedBy: signer, partner: true },
  })
}
