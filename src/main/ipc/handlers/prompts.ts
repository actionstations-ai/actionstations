// Prompt library handlers (#23): list, get (every layer + raw), save and reset overrides.
import { defineHandlers } from '../registry'
import { requireProject } from '../../project/guard'
import {
  getPromptLayers,
  listPrompts,
  resetPromptOverride,
  savePromptOverride,
} from '../../prompts'

/** projectPath is optional on these channels; when present it must pass the project guard. */
const guarded = async (projectPath?: string): Promise<{ projectPath?: string }> =>
  projectPath ? { projectPath: await requireProject(projectPath) } : {}

export default defineHandlers({
  'prompts:list': async ({ projectPath }) => {
    const root = await guarded(projectPath)
    return listPrompts(root.projectPath)
  },
  'prompts:get': async ({ name, projectPath }) => {
    const root = await guarded(projectPath)
    return getPromptLayers(name, root.projectPath)
  },
  'prompts:save': async ({ name, scope, projectPath, raw }) => {
    const root = await guarded(projectPath)
    return savePromptOverride({ name, scope, raw, ...root })
  },
  'prompts:reset': async ({ name, scope, projectPath }) => {
    const root = await guarded(projectPath)
    await resetPromptOverride({ name, scope, ...root })
  },
})
