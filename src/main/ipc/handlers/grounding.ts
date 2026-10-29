// grounding:* and plan-check:* (#423).
import type { ProviderConfig } from '@shared/schemas'
import { defineHandlers } from '../registry'
import { readIdeaGrounding } from '../../generate/ideas'
import { readConflicts, setFindingStatus } from '../../grounding/conflicts-file'
import { runPlanCheck } from '../../grounding/plan-check-job'
import { contextFor, regroundScenario } from '../../grounding/project'
import { runVerifyJob } from '../../grounding/verify-job'
import { jobs } from '../../jobs/manager'
import { emit } from '../../lib/events'
import { AppError } from '../../lib/errors'
import { nowIso } from '../../lib/ids'
import { requireProject } from '../../project/guard'
import { getRoutingView } from '../../providers/resolve'
import { isLocalUrl } from '../../providers/text/common'
import { getSettings } from '../../settings/store'
import { getScenario, listInjects, updateScenario } from '../../scenario/store'

/** Whether a provider runs on this computer (no passage leaves it). */
export function isLocalProvider(p: Pick<ProviderConfig, 'kind' | 'baseUrl'>): boolean {
  if (p.kind === 'mock') return true
  if (p.kind === 'ollama') return !p.baseUrl || isLocalUrl(p.baseUrl)
  if (p.kind === 'openai-compatible') return !!p.baseUrl && isLocalUrl(p.baseUrl)
  return false
}

async function freshGrounding(root: string, scenarioId: string) {
  const scenario = await getScenario(root, scenarioId)
  const injects = await listInjects(root, scenarioId)
  const ctx = await contextFor(root, scenario)
  return regroundScenario(scenario, ctx, injects)
}

export default defineHandlers({
  'grounding:scenario': async ({ projectPath, scenarioId }) =>
    freshGrounding(await requireProject(projectPath), scenarioId),

  'grounding:ideas': async ({ projectPath }) =>
    readIdeaGrounding(await requireProject(projectPath)),

  'grounding:verify': async ({ projectPath, scenarioId, itemKeys }) => {
    const root = await requireProject(projectPath)
    await getScenario(root, scenarioId)
    const job = jobs.start(
      'grounding-verify',
      (ctx) => runVerifyJob(root, scenarioId, itemKeys, ctx),
      {
        projectPath: root,
        scenarioId,
        payload: { itemKeys: itemKeys ?? null },
      },
    )
    return { jobId: job.id }
  },

  'grounding:override': async ({ projectPath, scenarioId, itemKey, label, note }) => {
    const root = await requireProject(projectPath)
    const fresh = await freshGrounding(root, scenarioId)
    const current = fresh.items[itemKey]
    if (!current) throw new AppError('NOT_FOUND', `No grounding result for ${itemKey}`)
    if (current.label === 'none')
      throw new AppError('VALIDATION', 'This item makes no claim about the plans')
    const next = { ...current }
    if (label)
      next.override = { label, ...(note?.trim() ? { note: note.trim() } : {}), at: nowIso() }
    else delete next.override
    await updateScenario(
      root,
      scenarioId,
      (s) => {
        s.grounding = { ...(s.grounding ?? {}), items: { ...fresh.items, [itemKey]: next } }
      },
      {
        by: 'user',
        note: label ? `marked ${itemKey} ${label}` : `cleared the label of ${itemKey}`,
      },
    )
    return next
  },

  'plan-check:run': async ({ projectPath, confirmWithModel, withinDocument }) => {
    const root = await requireProject(projectPath)
    const job = jobs.start(
      'plan-check',
      (ctx) => runPlanCheck(root, { confirmWithModel, withinDocument }, ctx),
      { projectPath: root, payload: { confirmWithModel, withinDocument } },
    )
    return { jobId: job.id }
  },

  'plan-check:get': async ({ projectPath }) => readConflicts(await requireProject(projectPath)),

  'plan-check:defaults': async ({ projectPath }) => {
    const root = await requireProject(projectPath)
    const ref = (await getRoutingView(root)).effective.critique
    const provider = ref && (await getSettings()).providers.find((p) => p.id === ref.providerId)
    if (!provider)
      return {
        confirmWithModel: false,
        reason: 'No model is set for reviews, so candidates are listed without a model check.',
      }
    if (isLocalProvider(provider))
      return {
        confirmWithModel: true,
        providerLabel: provider.label,
        reason: `${provider.label} runs on this computer, so the passages stay here.`,
      }
    return {
      confirmWithModel: false,
      providerLabel: provider.label,
      reason: `${provider.label} is a cloud service: a full check can send up to 160 plan passages to it, so this is off unless you turn it on.`,
    }
  },

  'plan-check:set-status': async ({ projectPath, findingId, status, note }) => {
    const root = await requireProject(projectPath)
    const finding = await setFindingStatus(root, findingId, status, note)
    emit('project:changed', { path: root, what: 'plan-conflicts' })
    return finding
  },
})
