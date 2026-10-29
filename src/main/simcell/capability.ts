// The model capability gate (spec 0429 FR-21, FR-22). Runs the eight probes against the model
// routed to `roleplay`, scores them with code, and caches the level per provider and model.
import type { CapabilityResult, SimcellDraftOutput } from '@shared/schemas'
import { nowIso } from '../lib/ids'
import { getSettings, updateSettings } from '../settings/store'
import { callRoleplay, type DraftEnv } from './draft'
import { buildPersonaView } from './context'
import { PROBES } from './probes'

export const capabilityKey = (providerId: string, model: string): string => `${providerId}/${model}`

/** 7 or 8 passed: suited. 4 to 6: limited. 0 to 3: not suited. */
export function levelFor(passed: number): CapabilityResult['level'] {
  if (passed >= 7) return 'suited'
  return passed >= 4 ? 'limited' : 'not_suited'
}

/** Score recorded outputs by probe id; a missing or null output fails that probe. */
export function scoreProbes(
  outputs: Readonly<Record<string, SimcellDraftOutput | null | undefined>>,
  checkedAt: string = nowIso(),
): CapabilityResult {
  const passed: string[] = []
  const failed: string[] = []
  for (const probe of PROBES) {
    const ok = (() => {
      try {
        return probe.passes(outputs[probe.id] ?? null)
      } catch {
        return false
      }
    })()
    ;(ok ? passed : failed).push(probe.id)
  }
  return { level: levelFor(passed.length), passed, failed, checkedAt }
}

/** Run every probe, one at a time. A probe whose call fails counts as failed. */
export async function runProbes(env: DraftEnv): Promise<CapabilityResult> {
  const outputs: Record<string, SimcellDraftOutput | null> = {}
  for (const probe of PROBES) {
    const vars = buildPersonaView({
      card: probe.card,
      scenario: { msel: [] },
      releasedRowIds: new Set(),
      thread: [],
      clock: probe.clock,
      channel: probe.channel,
      trigger: 'The players wrote to this character.',
      playerMessage: probe.playerMessage,
    })
    try {
      outputs[probe.id] = (await callRoleplay(env, vars)).output
    } catch {
      outputs[probe.id] = null
    }
  }
  return scoreProbes(outputs)
}

export async function cachedCapability(
  providerId: string,
  model: string,
): Promise<CapabilityResult | undefined> {
  return (await getSettings()).simcell.capability[capabilityKey(providerId, model)]
}

export async function storeCapability(
  providerId: string,
  model: string,
  result: CapabilityResult,
): Promise<void> {
  await updateSettings((s) => {
    s.simcell.capability[capabilityKey(providerId, model)] = result
  })
}

export function probeLabels(): Record<string, string> {
  return Object.fromEntries(PROBES.map((p) => [p.id, p.label]))
}
