// The grounding-verify job (#423, FR-7): one grounding_verify call per item through the routed
// critique provider, quotes validated against the cited passages, the model's block written
// onto each item's result. Passages go to the model inside an escaped <documents> block.
import {
  effectiveLabel,
  type GroundingResult,
  type GroundingVerifyOutput,
  type ModelGrounding,
  type Scenario,
} from '@shared/schemas'
import type { JobContext } from '../jobs/manager'
import { AppError, toAppError } from '../lib/errors'
import { nowIso } from '../lib/ids'
import { pipelineDeps } from '../generate/deps'
import { escapeText } from '../generate/retrieval'
import { runStage } from '../generate/stage'
import { listInjects, updateScenario } from '../scenario/store'
import { splitClaims } from './claims'
import { contextFor, regroundScenario } from './project'
import { PassageResolver } from './resolve'
import { scenarioItems, type GroundingItem } from './scenario'
import { checkVerdicts, modelGrounding } from './verify'

/** A scenario-wide verify asks about at most this many items (the weakest first). */
export const MAX_VERIFY_ITEMS = 120

const escapeAttr = (s: string): string => s.replace(/["<>&]/g, (c) => `&#${c.charCodeAt(0)};`)

const ORDER = { unsupported: 0, review: 1, grounded: 2, none: 3 } as const

function itemLabel(item: GroundingItem): string {
  const [kind, id] = item.key.split(':')
  return kind === 'row' ? `MSEL row ${id}, expected action` : `Inject ${id}, controller note`
}

/** Items to verify: the requested keys, else every labelled row and inject, weakest first. */
function pick(
  items: GroundingItem[],
  results: Record<string, GroundingResult>,
  keys?: string[],
): GroundingItem[] {
  const wanted = keys ? new Set(keys) : undefined
  return items
    .filter((i) => (i.kind === 'row' || i.kind === 'inject') && (!wanted || wanted.has(i.key)))
    .filter((i) => results[i.key] && results[i.key]!.label !== 'none')
    .sort((a, b) => ORDER[effectiveLabel(results[a.key]!)] - ORDER[effectiveLabel(results[b.key]!)])
    .slice(0, MAX_VERIFY_ITEMS)
}

export interface VerifySummary {
  verified: number
  discarded: number
  failed: number
}

export async function runVerifyJob(
  root: string,
  scenarioId: string,
  keys: string[] | undefined,
  ctx: JobContext,
): Promise<VerifySummary> {
  const deps = await pipelineDeps()
  const [project, index] = await Promise.all([deps.loadProject(root), deps.openIndex(root)])
  const scenario = await deps.store.getScenario(root, scenarioId)
  const injects = await listInjects(root, scenarioId)
  const gctx = await contextFor(root, scenario, { index, project })
  const grounding = await regroundScenario(scenario, gctx, injects)
  const items = pick(scenarioItems(scenario, injects), grounding.items, keys)
  if (!items.length)
    throw new AppError('VALIDATION', 'Nothing to verify: no item makes a plan claim')
  const resolver = new PassageResolver(index)
  const models = new Map<string, ModelGrounding>()
  const summary: VerifySummary = { verified: 0, discarded: 0, failed: 0 }
  for (const [n, item] of items.entries()) {
    ctx.throwIfCancelled()
    ctx.progress(n / items.length, `Verifying ${item.key} (${n + 1}/${items.length})`, {
      stage: 'grounding_verify',
      itemId: item.key,
    })
    const passages = item.citations.flatMap((c) => resolver.resolve(c) ?? [])
    if (!passages.length) continue
    try {
      const r = await runStage<GroundingVerifyOutput>({
        stage: 'grounding_verify',
        itemId: item.key,
        projectPath: root,
        vars: {
          project: { orgName: project.orgName || project.name },
          item: { label: itemLabel(item) },
          claims: splitClaims(item.claimText).map(escapeText),
          passages: passages.map((p) => ({
            documentTitle: escapeAttr(p.documentTitle),
            headingPath: escapeAttr(p.headingPath),
            text: escapeText(p.text),
          })),
        },
        ctx,
        deps,
        index,
      })
      const checked = checkVerdicts(r.output.claims, passages)
      for (const d of checked.discarded)
        ctx.log(
          `${item.key}: verdict "${d.verdict}" discarded; its quote is not in the cited passage`,
          'warn',
          { stage: 'grounding_verify', itemId: item.key },
        )
      const provider = { providerId: r.run.providerRef?.providerId ?? '', model: r.run.model ?? '' }
      models.set(
        item.key,
        modelGrounding(grounding.items[item.key]!, item.claimText, checked, provider, nowIso()),
      )
      summary.verified += 1
      summary.discarded += checked.discarded.length
    } catch (err) {
      if (toAppError(err).code === 'CANCELLED') throw err
      summary.failed += 1
      ctx.log(`${item.key}: ${toAppError(err).message}`, 'error', { stage: 'grounding_verify' })
    }
  }
  await saveModels(root, scenarioId, grounding.items, models)
  ctx.progress(1, `${summary.verified} item(s) verified`)
  if (!summary.verified && summary.failed)
    throw new AppError('PROVIDER', 'Every verification failed')
  return summary
}

/** Write the fresh results with the model blocks onto scenario.json. */
async function saveModels(
  root: string,
  scenarioId: string,
  base: Record<string, GroundingResult>,
  models: Map<string, ModelGrounding>,
): Promise<Scenario | undefined> {
  if (!models.size) return undefined
  return updateScenario(
    root,
    scenarioId,
    (s) => {
      // The fresh results carry the stored overrides already (same fingerprint).
      const items = { ...(s.grounding?.items ?? {}), ...base }
      for (const [key, model] of models) if (items[key]) items[key] = { ...items[key]!, model }
      s.grounding = { ...(s.grounding ?? {}), items }
    },
    { by: 'ai', snapshot: false, note: 'source check with the model' },
  )
}
