// Layered prompt library: shipped default < global override < project override.
import { promises as fs } from 'node:fs'
import type { PromptEntry, PromptFile } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { emit } from '../lib/events'
import { writeFileAtomic } from '../lib/fs'
import { requireProject } from '../project/guard'
import { updateProject } from '../project/store'
import { hashRaw, parsePromptRaw, type ParsedPrompt } from './format'
import {
  layerLabel,
  layerPath,
  listDefaultNames,
  promptFileName,
  readLayer,
  type OverrideScope,
  type PromptLayer,
} from './layers'

/** sha256 of the raw file each loaded PromptFile came from (RenderedPrompt.hash). */
const rawHashes = new WeakMap<PromptFile, string>()
/** Parsed files by raw hash, so re-loading an unchanged file skips YAML + compile checks. */
const parsedByHash = new Map<string, ParsedPrompt>()

export const hashOfLoaded = (file: PromptFile): string | undefined => rawHashes.get(file)

function parseCached(raw: string, name: string, layer: PromptLayer): ParsedPrompt {
  const hash = hashRaw(raw)
  const hit = parsedByHash.get(hash)
  if (hit && hit.frontmatter.name === name) return hit
  const parsed = parsePromptRaw(raw, name, layerLabel(layer, name))
  parsedByHash.set(hash, parsed)
  return parsed
}

/** Parse one layer's raw text into a PromptFile (throws VALIDATION naming the file). */
export function toPromptFile(raw: string, name: string, layer: PromptLayer): PromptFile {
  const parsed = parseCached(raw, name, layer)
  const file: PromptFile = {
    name,
    frontmatter: structuredClone(parsed.frontmatter),
    body: parsed.body,
    source: layer,
  }
  rawHashes.set(file, hashRaw(raw))
  return file
}

export interface RawLayers {
  default: string
  global?: string
  project?: string
}

async function readAllLayers(name: string, root?: string): Promise<RawLayers> {
  const def = await readLayer('default', name)
  if (def === undefined) throw new AppError('NOT_FOUND', `No prompt named "${name}"`)
  const global = await readLayer('global', name)
  const project = root ? await readLayer('project', name, root) : undefined
  return {
    default: def,
    ...(global !== undefined ? { global } : {}),
    ...(project !== undefined ? { project } : {}),
  }
}

const effectiveLayer = (raw: RawLayers): PromptLayer =>
  raw.project !== undefined ? 'project' : raw.global !== undefined ? 'global' : 'default'

const guardOptional = async (projectPath?: string): Promise<string | undefined> =>
  projectPath ? requireProject(projectPath) : undefined

/** Effective prompt: project override > global override > shipped default. */
export async function loadEffectivePrompt(name: string, projectPath?: string): Promise<PromptFile> {
  const root = await guardOptional(projectPath)
  const raw = await readAllLayers(name, root)
  const layer = effectiveLayer(raw)
  return toPromptFile(raw[layer]!, name, layer)
}

/** Parse a layer for display, or undefined if it is invalid on disk (edited outside the app). */
function tryPromptFile(raw: string | undefined, name: string, layer: PromptLayer) {
  if (raw === undefined) return undefined
  try {
    return toPromptFile(raw, name, layer)
  } catch {
    return undefined
  }
}

/** Every layer of one prompt, parsed and raw, for the editor. */
export async function getPromptLayers(name: string, projectPath?: string) {
  const root = await guardOptional(projectPath)
  const raw = await readAllLayers(name, root)
  const def = toPromptFile(raw.default, name, 'default')
  const global = tryPromptFile(raw.global, name, 'global')
  const project = tryPromptFile(raw.project, name, 'project')
  return {
    default: def,
    ...(global ? { global } : {}),
    ...(project ? { project } : {}),
    effective: project ?? global ?? def,
    raw,
  }
}

/** One entry per shipped default, with override flags for the given project. */
export async function listPrompts(projectPath?: string): Promise<PromptEntry[]> {
  const root = await guardOptional(projectPath)
  const entries: PromptEntry[] = []
  for (const name of await listDefaultNames()) {
    const raw = await readAllLayers(name, root)
    const def = tryPromptFile(raw.default, name, 'default')
    if (!def) continue
    const description = def.frontmatter.description
    entries.push({
      name,
      stage: def.frontmatter.stage,
      ...(description ? { description } : {}),
      effectiveSource: effectiveLayer(raw),
      hasGlobalOverride: raw.global !== undefined,
      hasProjectOverride: raw.project !== undefined,
    })
  }
  return entries
}

async function scopeRoot(scope: OverrideScope, projectPath?: string) {
  if (scope === 'global') return undefined
  if (!projectPath) throw new AppError('VALIDATION', 'projectPath is required for project scope')
  return requireProject(projectPath)
}

async function syncProjectOverrides(root: string, name: string, present: boolean) {
  const file = promptFileName(name)
  await updateProject(root, (p) => {
    const rest = p.promptOverrides.filter((f) => f !== file)
    p.promptOverrides = present ? [...rest, file].sort() : rest
  })
  emit('project:changed', { path: root, what: 'prompts' })
}

/** Validate and write an override. Invalid text is rejected with line-specific issues. */
export async function savePromptOverride(input: {
  name: string
  scope: OverrideScope
  raw: string
  projectPath?: string
}): Promise<PromptFile> {
  const root = await scopeRoot(input.scope, input.projectPath)
  if ((await readLayer('default', input.name)) === undefined)
    throw new AppError('NOT_FOUND', `No prompt named "${input.name}"`)
  const file = toPromptFile(input.raw, input.name, input.scope)
  await writeFileAtomic(layerPath(input.scope, input.name, root), input.raw)
  if (root) await syncProjectOverrides(root, input.name, true)
  return file
}

/** Delete an override so the layer below takes effect again. Missing overrides are a no-op. */
export async function resetPromptOverride(input: {
  name: string
  scope: OverrideScope
  projectPath?: string
}): Promise<void> {
  const root = await scopeRoot(input.scope, input.projectPath)
  await fs.rm(layerPath(input.scope, input.name, root), { force: true })
  if (root) await syncProjectOverrides(root, input.name, false)
}
