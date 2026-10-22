import { defineHandlers } from '../registry'
import { requireProject } from '../../project/guard'
import { loadProject } from '../../project/store'
import { composeDocument } from '../../render/compose'
import { renderAndSaveInject } from '../../render/inject'
import { listTemplateTypes, loadTemplate, templateInfo } from '../../render/templates'
import { renderPng } from '../../render/window'

/** Brand of an opened project, so previews show the project's names and local outlets. */
async function projectBrand(projectPath: string | undefined) {
  if (!projectPath) return undefined
  const root = await requireProject(projectPath)
  return (await loadProject(root)).brand
}

export default defineHandlers({
  'templates:list': () => listTemplateTypes().map((t) => templateInfo(loadTemplate(t))),

  'render:preview': async ({ type, fields, brand, variant, scale, projectPath }) => {
    const effectiveBrand = brand ?? (await projectBrand(projectPath))
    const doc = composeDocument(
      {
        type,
        fields,
        ...(effectiveBrand ? { brand: effectiveBrand } : {}),
        ...(variant ? { variant } : {}),
      },
      { previewAssets: true },
    )
    const out = await renderPng(doc, scale)
    return {
      dataUrl: `data:image/png;base64,${out.png.toString('base64')}`,
      width: out.width,
      height: out.height,
    }
  },

  'render:inject': async ({ projectPath, scenarioId, injectId }) => {
    const root = await requireProject(projectPath)
    return renderAndSaveInject(root, scenarioId, injectId)
  },
})
