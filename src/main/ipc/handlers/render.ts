import { defineHandlers } from '../registry'
import { requireProject } from '../../project/guard'
import { loadProject } from '../../project/store'
import { brandLogoFile } from '../../project/logo'
import { composeDocument } from '../../render/compose'
import { injectSlotFiles, renderAndSaveInject } from '../../render/inject'
import { ensurePacksLoaded } from '../../packs/state'
import { listTemplateInfos } from '../../render/template-copies'
import { clearEngagementCache, renderEngagement } from '../../render/engagement'
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
  if (!req.projectPath) return { brand: undefined, logo: undefined, assets: {}, root: undefined }
  const root = await requireProject(req.projectPath)
  const brand = (await loadProject(root)).brand
  const assets =
    req.scenarioId && req.injectId
      ? await injectSlotFiles(root, req.scenarioId, req.injectId, req.type)
      : {}
  return { brand, logo: await brandLogoFile(root, brand), assets, root }
}

export default defineHandlers({
  'templates:list': async (req) => {
    await ensurePacksLoaded()
    return listTemplateInfos(req?.projectPath ? await requireProject(req.projectPath) : undefined)
  },

  'render:preview': async (req) => {
    const { type, fields, brand, variant, scale } = req
    const ctx = await previewContext(req)
    const effectiveBrand = brand ?? ctx.brand
    const doc = composeDocument(
      {
        type,
        fields,
        ...(effectiveBrand ? { brand: effectiveBrand } : {}),
        ...(ctx.logo ? { logo: ctx.logo } : {}),
        ...(variant ? { variant } : {}),
        assets: ctx.assets,
        // The project's layer applies (its copies of pack templates, its own folders).
        ...(ctx.root ? { projectRoot: ctx.root } : {}),
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

  'render:engagement': async ({ projectPath, scenarioId, injectId, minutes, refreshMin }) => {
    const root = await requireProject(projectPath)
    return renderEngagement(root, scenarioId, injectId, minutes, refreshMin)
  },

  'render:engagement-clear': async ({ projectPath }) => {
    await clearEngagementCache(await requireProject(projectPath))
  },

  'render:inject': async ({ projectPath, scenarioId, injectId }) => {
    const root = await requireProject(projectPath)
    // A media job owning the scenario saves its own copy of the inject later (#206).
    assertNotGenerating(root, scenarioId)
    return renderAndSaveInject(root, scenarioId, injectId)
  },
})
