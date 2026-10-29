// export:* — distribution documents, media, ZIP and machine-readable files (#42, #43, #44).
import { defineHandlers } from '../registry'
import { ensureDefaultOutDir } from '../../export/default-dir'
import { completenessReport } from '../../export/completeness'
import { buildDocumentHtml } from '../../export/documents'
import { loadExportModel } from '../../export/model'
import { assertOutDir, runExport } from '../../export/run'
import { assertSpanishReady } from '../../export/variants'
import { jobs } from '../../jobs/manager'
import { requireProject } from '../../project/guard'
import { contextFor, regroundScenario } from '../../grounding/project'
import { effectiveLabel, groundingKey, type Scenario } from '@shared/schemas'

const LABEL_TEXT = { grounded: 'Grounded', review: 'Needs review', unsupported: 'Unsupported' }

/** Row id → label text for the controller MSEL's Source check column (#423). */
async function sourceCheckColumn(
  root: string,
  scenario: Scenario,
): Promise<Record<string, string>> {
  const grounding = await regroundScenario(scenario, await contextFor(root, scenario)).catch(
    () => scenario.grounding,
  )
  const out: Record<string, string> = {}
  for (const r of scenario.msel) {
    const result = grounding?.items[groundingKey.row(r.id)]
    const label = result && effectiveLabel(result)
    out[r.id] = label && label !== 'none' ? LABEL_TEXT[label] : ''
  }
  return out
}

export default defineHandlers({
  'export:run': async ({ projectPath, scenarioId, outDir, targets, surveyIds, options }) => {
    const root = await requireProject(projectPath)
    await ensureDefaultOutDir(outDir, [root, projectPath])
    await assertOutDir(outDir)
    const model = await loadExportModel(root, scenarioId)
    // A translation nobody reviewed is refused here, before the job starts (spec 0435 FR-11).
    if (options) await assertSpanishReady(model, options)
    if (options?.sourceCheck) model.sourceCheck = await sourceCheckColumn(root, model.scenario)
    const job = jobs.start(
      'export',
      (ctx) =>
        runExport(model, outDir, targets, ctx, {
          ...(options ?? {}),
          ...(surveyIds ? { surveyIds } : {}),
        }),
      { projectPath: root, scenarioId, payload: { outDir, targets, options: options ?? {} } },
    )
    return { jobId: job.id }
  },

  'export:preview-html': async ({ projectPath, scenarioId, doc }) => {
    const root = await requireProject(projectPath)
    const model = await loadExportModel(root, scenarioId)
    return { html: buildDocumentHtml(model, doc, 'preview') }
  },

  'export:completeness': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    return completenessReport(await loadExportModel(root, scenarioId))
  },
})
