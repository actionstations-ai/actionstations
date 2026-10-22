// export:* — distribution documents, media, ZIP and machine-readable files (#42, #43, #44).
import { defineHandlers } from '../registry'
import { buildDocumentHtml } from '../../export/documents'
import { loadExportModel } from '../../export/model'
import { assertOutDir, runExport } from '../../export/run'
import { jobs } from '../../jobs/manager'
import { requireProject } from '../../project/guard'

export default defineHandlers({
  'export:run': async ({ projectPath, scenarioId, outDir, targets }) => {
    const root = await requireProject(projectPath)
    await assertOutDir(outDir)
    const model = await loadExportModel(root, scenarioId)
    const job = jobs.start('export', (ctx) => runExport(model, outDir, targets, ctx), {
      projectPath: root,
      scenarioId,
      payload: { outDir, targets },
    })
    return { jobId: job.id }
  },

  'export:preview-html': async ({ projectPath, scenarioId, doc }) => {
    const root = await requireProject(projectPath)
    const model = await loadExportModel(root, scenarioId)
    return { html: buildDocumentHtml(model, doc, 'preview') }
  },
})
