// Model-assisted control mapping (spec 0426 FR-12). Off unless the project switches it on. The
// routed critique model sees the text of the MSEL rows and the control list; it returns
// suggestions only, and nothing is stored: the editor shows them as chips a person accepts or
// removes. References the model invents are dropped.
import type { ComplianceMapOutput, MselRow } from '@shared/schemas'
import { leafControls } from '@shared/compliance/rules'
import type { JobContext } from '../jobs/manager'
import { AppError } from '../lib/errors'
import { pipelineDeps } from '../generate/deps'
import { escapeText } from '../generate/retrieval'
import { runStage } from '../generate/stage'
import { getRoutingView } from '../providers/resolve'
import { isLocalUrl } from '../providers/text/common'
import { getSettings } from '../settings/store'
import { getScenario } from '../scenario/store'
import { enabledFrameworks } from '../generate/control-suggestions'

const ROWS_PER_CALL = 25
const MAX_ROWS = 150
const CONTROL_TAGS = new Set(['STARTEX', 'ENDEX', 'TIME_JUMP'])

export interface ModelMappingInfo {
  providerLabel?: string
  local: boolean
  reason: string
}

/** Which provider a mapping would use, and whether the row text stays on this computer. */
export async function modelMappingInfo(root: string): Promise<ModelMappingInfo> {
  const ref = (await getRoutingView(root)).effective.critique
  const provider = ref && (await getSettings()).providers.find((p) => p.id === ref.providerId)
  if (!provider) return { local: true, reason: 'No model is set for reviews.' }
  const local =
    provider.kind === 'mock' ||
    (provider.kind === 'ollama' && (!provider.baseUrl || isLocalUrl(provider.baseUrl))) ||
    (provider.kind === 'openai-compatible' && !!provider.baseUrl && isLocalUrl(provider.baseUrl))
  return {
    providerLabel: provider.label,
    local,
    reason: local
      ? `${provider.label} runs on this computer, so the rows stay here.`
      : `${provider.label} is a cloud service: the text of the rows and the control list are sent to it.`,
  }
}

export interface SuggestedControl {
  rowId: string
  ref: string
}

/** Only references that name a control of an enabled framework; each row at most 5. */
export function checkedSuggestions(
  out: ComplianceMapOutput,
  rows: readonly MselRow[],
  valid: ReadonlySet<string>,
): SuggestedControl[] {
  const known = new Map(rows.map((r) => [r.id, r]))
  return out.rows.flatMap((o) => {
    const row = known.get(o.rowId)
    if (!row) return []
    const have = new Set(row.controls ?? [])
    return [...new Set(o.controls)]
      .filter((ref) => valid.has(ref) && !have.has(ref))
      .slice(0, 5)
      .map((ref) => ({ rowId: row.id, ref }))
  })
}

export async function runSuggestModel(
  root: string,
  scenarioId: string,
  rowIds: string[] | undefined,
  ctx: JobContext,
): Promise<{ suggestions: SuggestedControl[] }> {
  const deps = await pipelineDeps()
  const project = await deps.loadProject(root)
  if (!project.compliance?.modelMapping)
    throw new AppError('VALIDATION', 'Model-assisted mapping is off for this project')
  const frameworks = await enabledFrameworks(root, project)
  if (!frameworks.length) throw new AppError('VALIDATION', 'No control framework is switched on')
  const scenario = await getScenario(root, scenarioId)
  const wanted = rowIds ? new Set(rowIds) : undefined
  const rows = scenario.msel
    .filter((r) => !CONTROL_TAGS.has(r.purposeTag) && (!wanted || wanted.has(r.id)))
    .slice(0, MAX_ROWS)
  const controls = frameworks.flatMap((f) =>
    leafControls(f).map((c) => ({ ref: `${f.id}:${c.id}`, title: escapeText(c.title) })),
  )
  const valid = new Set(controls.map((c) => c.ref))
  const index = await deps.openIndex(root)
  const suggestions: SuggestedControl[] = []
  for (let i = 0; i < rows.length; i += ROWS_PER_CALL) {
    const chunk = rows.slice(i, i + ROWS_PER_CALL)
    ctx.progress(i / Math.max(1, rows.length), 'Suggesting controls')
    const r = await runStage<ComplianceMapOutput>({
      stage: 'compliance_map',
      itemId: String(i / ROWS_PER_CALL + 1),
      projectPath: root,
      vars: {
        project: { orgName: project.orgName || project.name },
        controls,
        rows: chunk.map((row) => ({
          id: row.id,
          purposeTag: row.purposeTag,
          event: escapeText(row.event),
          expectedAction: escapeText(row.expectedAction),
        })),
      },
      ctx,
      deps,
      index,
    })
    suggestions.push(...checkedSuggestions(r.output, chunk, valid))
  }
  ctx.progress(1, 'Done')
  return { suggestions }
}
