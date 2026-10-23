import { defineHandlers } from '../registry'
import { requireProject } from '../../project/guard'
import { loadProject } from '../../project/store'
import { composeDocument } from '../../render/compose'
import { injectSlotFiles, renderAndSaveInject } from '../../render/inject'
import { listTemplateTypes, loadTemplate, templateInfo } from '../../render/templates'
import { renderPng } from '../../render/window'
import { assertNotGenerating } from '../../scenario/busy'

interface PreviewContext {
  type: string
  projectPath?: string | undefined
  scenarioId?: string | undefined
  injectId?: string | undefined
}

/**
 * Project brand (names, local outlets) and, for an inject, its own AI images in their slots.
 * Slots without an AI image keep the template's sample image.
 */
async function previewContext(req: PreviewContext) {
  if (!req.projectPath) return { brand: undefined, assets: {} }
  const root = await requireProject(req.projectPath)
  const brand = (await loadProject(root)).brand
  const assets =
    req.scenarioId && req.injectId
      ? await injectSlotFiles(root, req.scenarioId, req.injectId, req.type)
      : {}
  return { brand, assets }
}

export default defineHandlers({
  'templates:list': () => listTemplateTypes().map((t) => templateInfo(loadTemplate(t))),

  'render:preview': async (req) => {
    const { type, fields, brand, variant, scale } = req
    const ctx = await previewContext(req)
    const effectiveBrand = brand ?? ctx.brand
    const doc = composeDocument(
      {
        type,
        fields,
        ...(effectiveBrand ? { brand: effectiveBrand } : {}),
        ...(variant ? { variant } : {}),
        assets: ctx.assets,
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
    // A media job owning the scenario saves its own copy of the inject later (#206).
    assertNotGenerating(root, scenarioId)
    return renderAndSaveInject(root, scenarioId, injectId)
  },
})
