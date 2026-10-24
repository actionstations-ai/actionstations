// Everything the inject stages need from other workstreams, behind one injectable object
// (same pattern as ../deps.ts): the pipeline deps plus the inject store, template access,
// the template renderer, media provider resolution and the optional audio post-FX chain.
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import type { Brand, Inject, MediaBrief, Scenario } from '@shared/schemas'
import type { ResolvedMedia } from '../../providers/resolve'
import type { RenderedInject } from '../../render/inject'
import type { LoadedTemplate, FieldIssue } from '../../render/templates'
import type { SaveOptions } from '../../scenario/store'
import { pipelineDeps, type PipelineDeps } from '../deps'

export type MediaTask = 'image' | 'video' | 'audio'

export interface InjectStoreDeps {
  listInjects(projectPath: string, scenarioId: string): Promise<Inject[]>
  saveInject(
    projectPath: string,
    scenarioId: string,
    inject: Inject,
    opts: SaveOptions,
  ): Promise<Inject>
  updateScenario(
    projectPath: string,
    scenarioId: string,
    mutate: (s: Scenario) => Scenario | void,
    opts: SaveOptions,
  ): Promise<Scenario>
}

/** Template access; `projectRoot` applies the project's template layer (ADR-0018, #261). */
export interface TemplateDeps {
  listTemplateTypes(projectRoot?: string): string[]
  loadTemplate(type: string, projectRoot?: string): LoadedTemplate
  validateFields(type: string, fields: unknown, projectRoot?: string): FieldIssue[]
}

/**
 * Template → PNG (+ PDF for paper types) written into the inject's media folder, with the
 * inject's template outputs replaced and AI assets kept in their slots (render/inject.ts
 * renderInjectAssets). Tests inject a fake that writes small PNGs without Electron.
 */
export type InjectRenderer = (
  root: string,
  scenarioId: string,
  inject: Inject,
  opts: { brand: Brand },
) => Promise<RenderedInject>

export interface PostFxInput {
  wavPath: string
  outDir: string
  effects: NonNullable<MediaBrief['postFx']>
}

/** Audio post-FX (radio band-pass, phone compression, PA + ambience). Absent until the
 *  audio-fx module (ComfyUI/audio workstream) is merged: the media job logs the skip. */
export type ApplyPostFx = (input: PostFxInput) => Promise<{ wavPath: string }>

export interface InjectDeps extends PipelineDeps {
  injects: InjectStoreDeps
  templates: TemplateDeps
  renderer: InjectRenderer
  resolveMediaProvider(task: MediaTask, projectPath?: string): Promise<ResolvedMedia>
  applyPostFx?: ApplyPostFx
}

type OwnKey = 'injects' | 'templates' | 'renderer' | 'resolveMediaProvider'

let overrides: Partial<InjectDeps> = {}

/** Tests inject fakes here; `undefined` restores the real modules. An explicit
 *  `applyPostFx: undefined` means "no FX chain installed" even when the module exists. */
export function setInjectDeps(deps: Partial<InjectDeps> | undefined): void {
  overrides = deps ?? {}
}

type AudioFxModule = {
  applyPostFx?: (wav: Uint8Array, fx: readonly string[]) => Uint8Array
}
// The audio-fx module is built by the ComfyUI/audio workstream; a glob keeps main building
// without it and picks it up as soon as it lands.
const audioFxModules = import.meta.glob<AudioFxModule>('../../providers/media/audio-fx/index.ts')

/** The real FX chain as a file-to-file step: <outDir>/<name>-fx.wav. */
async function realPostFx(): Promise<ApplyPostFx | undefined> {
  const load = Object.values(audioFxModules)[0]
  const mod = load ? await load() : undefined
  const apply = mod?.applyPostFx
  if (!apply) return undefined
  return async ({ wavPath, outDir, effects }) => {
    const out = join(outDir, `${basename(wavPath).replace(/\.wav$/i, '')}-fx.wav`)
    await fs.writeFile(out, apply(await fs.readFile(wavPath), effects))
    return { wavPath: out }
  }
}

/** Real modules are imported lazily and only for the keys a test did not override. */
async function realInjectDeps(missing: OwnKey[]): Promise<Partial<InjectDeps>> {
  const out: Partial<InjectDeps> = {}
  const need = (k: OwnKey): boolean => missing.includes(k)
  if (need('injects')) {
    const store = await import('../../scenario/store')
    out.injects = {
      listInjects: store.listInjects,
      saveInject: store.saveInject,
      updateScenario: store.updateScenario,
    }
  }
  if (need('templates')) {
    const t = await import('../../render/templates')
    out.templates = {
      listTemplateTypes: t.listTemplateTypes,
      loadTemplate: t.loadTemplate,
      validateFields: t.validateFields,
    }
  }
  if (need('renderer')) out.renderer = (await import('../../render/inject')).renderInjectAssets
  if (need('resolveMediaProvider')) {
    out.resolveMediaProvider = (await import('../../providers/resolve')).resolveMediaProvider
  }
  return out
}

const OWN_KEYS: OwnKey[] = ['injects', 'templates', 'renderer', 'resolveMediaProvider']

export async function injectDeps(): Promise<InjectDeps> {
  const base = await pipelineDeps()
  const missing = OWN_KEYS.filter((k) => overrides[k] === undefined)
  const real = await realInjectDeps(missing)
  const applyPostFx = Object.hasOwn(overrides, 'applyPostFx')
    ? overrides.applyPostFx
    : await realPostFx()
  return { ...base, ...real, ...overrides, applyPostFx } as InjectDeps
}
