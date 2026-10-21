import { defineHandlers } from '../registry'
import { composeDocument } from '../../render/compose'
import { listTemplateTypes, loadTemplate, templateInfo } from '../../render/templates'
import { renderPng } from '../../render/window'

// render:inject (writing assets into a scenario) is added by the renderer workstream (#30).
export default defineHandlers({
  'templates:list': () => listTemplateTypes().map((t) => templateInfo(loadTemplate(t))),

  'render:preview': async ({ type, fields, brand, variant, scale }) => {
    const doc = composeDocument(
      { type, fields, ...(brand ? { brand } : {}), ...(variant ? { variant } : {}) },
      { previewAssets: true },
    )
    const out = await renderPng(doc, scale)
    return {
      dataUrl: `data:image/png;base64,${out.png.toString('base64')}`,
      width: out.width,
      height: out.height,
    }
  },
})
