// Where each prompt layer lives on disk:
//   default  the core pack's prompts/<name>.md     (bundled with the app, read-only; ADR-0020)
//   pack     <userData>/packs/<id>/<version>/prompts/<name>.md (read-only; see pack-layer.ts)
//   global   <userData>/prompts/<name>.md          (user override for every project)
//   project  <project>/prompts/<name>.md           (override for one project)
import { promises as fs } from 'node:fs'
import { SafeId } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { safeJoin } from '../lib/fs'
import { userDataPath } from '../lib/paths'
import { coreFolder } from '../packs/bundled'

/** File-backed layers this module resolves; the pack layer lives in pack-layer.ts. */
export type PromptLayer = 'default' | 'global' | 'project'
export type OverrideScope = Exclude<PromptLayer, 'default'>

export const promptFileName = (name: string): string => `${name}.md`

export function assertPromptName(name: string): string {
  if (!SafeId.safeParse(name).success)
    throw new AppError('VALIDATION', `Invalid prompt name: ${name}`)
  return name
}

export const defaultsDir = (): string => coreFolder('prompts')
export const globalDir = (): string => userDataPath('prompts')
export const projectDir = (root: string): string => safeJoin(root, 'prompts')

/** Absolute path of one layer's file. `root` is required for the project layer. */
export function layerPath(layer: PromptLayer, name: string, root?: string): string {
  const file = promptFileName(assertPromptName(name))
  if (layer === 'default') return safeJoin(defaultsDir(), file)
  if (layer === 'global') return safeJoin(globalDir(), file)
  if (!root) throw new AppError('VALIDATION', 'A project is required for project overrides')
  return safeJoin(projectDir(root), file)
}

/** Raw text of a layer's file, or undefined when it does not exist. */
export async function readLayer(
  layer: PromptLayer,
  name: string,
  root?: string,
): Promise<string | undefined> {
  try {
    return await fs.readFile(layerPath(layer, name, root), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  }
}

/** Prompt names (file stems) shipped as defaults, sorted. */
export async function listDefaultNames(): Promise<string[]> {
  let files: string[]
  try {
    files = await fs.readdir(defaultsDir())
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  return files
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3))
    .filter((n) => SafeId.safeParse(n).success)
    .sort()
}

/** Human-readable location for error messages. */
export const layerLabel = (layer: PromptLayer, name: string): string =>
  layer === 'default'
    ? `prompts/${promptFileName(name)}`
    : `${layer} override ${promptFileName(name)}`
