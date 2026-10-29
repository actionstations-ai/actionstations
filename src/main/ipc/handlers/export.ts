// export:* — distribution documents, media, ZIP and machine-readable files (#42, #43, #44).
import { defineHandlers } from '../registry'
import { ensureDefaultOutDir } from '../../export/default-dir'
import { completenessReport } from '../../export/completeness'
import { buildDocumentHtml } from '../../export/documents'
import { loadExportModel } from '../../export/model'
import { assertOutDir, runExport } from '../../export/run'
import { jobs } from '../../jobs/manager'
import { requireProject } from '../../project/guard'

export default defineHandlers({
  'export:run': async ({ projectPath, scenarioId, outDir, targets, surveyIds, options }) => {
    const root = await requireProject(projectPath)
    await ensureDefaultOutDir(outDir, [root, projectPath])
    await assertOutDir(outDir)
    const model = await loadExportModel(root, scenarioId)
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
