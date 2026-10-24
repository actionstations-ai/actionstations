// Inject type registry, main side (ADR-0018, #261). INJECT_TYPES (src/shared/taxonomy.ts) is
// the built-in list; templates of the user layer and of enabled packs add types through the
// `taxonomy` block of their meta.json. Main registers those in the shared registry (so
// chooseInjectType, taxonomyVarsFor and injectTypeInfo see them), re-registers after every
// pack change and tells the renderer with `templates:changed`; the renderer refetches
// templates:taxonomy. Project-layer types (copies of pack templates, hand-made folders) are
// per project: listInjectTypes(projectRoot) adds them.
import {
  INJECT_TYPE_IDS,
  hiddenInjectTypes,
  injectTypes,
  registerInjectTypes,
  registeredInjectTypes,
  type InjectTypeInfo,
} from '@shared/taxonomy'
import type { TemplateTaxonomy } from '@shared/schemas/pack'
import { emit } from '../lib/events'
import { onPacksChanged } from '../packs/layers'
import { readProjectPacks } from '../packs/project-copies'
import {
  isHiddenTemplate,
  listTemplateTypes,
  loadTemplate,
  resolveTemplateLayer,
  type LoadedTemplate,
} from './templates'

/** A template of a new type without a taxonomy block (user or project folders) joins as this. */
const DEFAULT_TAXONOMY: TemplateTaxonomy = {
  category: 'documents',
  render: ['template'],
  defaultDelivery: 'hand_to_role',
}

/** The taxonomy entry a non-built-in template adds. */
export function injectTypeOfTemplate(
  t: LoadedTemplate,
  pack?: InjectTypeInfo['pack'],
): InjectTypeInfo {
  const tax = t.meta.taxonomy ?? DEFAULT_TAXONOMY
  const from = t.pack ?? pack
  return {
    id: t.meta.type,
    label: t.meta.label,
    category: tax.category,
    render: [...tax.render],
    paper: tax.paper ?? t.meta.paper,
    mvp: false,
    defaultDelivery: tax.defaultDelivery,
    ...(tax.domains ? { domains: [...tax.domains] } : {}),
    source: t.source === 'builtin' ? 'pack' : t.source,
    ...(from
      ? {
          pack: {
            id: from.id,
            version: from.version,
            ...(from.name ? { name: from.name } : {}),
            ...('bundled' in from && from.bundled ? { bundled: true } : {}),
          },
        }
      : {}),
  }
}

/** Types whose template (as `projectRoot` sees it) comes from a disabled bundled pack. */
export function hiddenTypes(projectRoot?: string): string[] {
  return listTemplateTypes(projectRoot).filter((type) => {
    const layer = resolveTemplateLayer(type, projectRoot)
    return !!layer && isHiddenTemplate(layer)
  })
}

/** Types the layers add to the built-in taxonomy, as the project (or no project) sees them. */
export async function layerInjectTypes(projectRoot?: string): Promise<InjectTypeInfo[]> {
  const copies = projectRoot ? (await readProjectPacks(projectRoot)).copies : []
  const out: InjectTypeInfo[] = []
  for (const type of listTemplateTypes(projectRoot)) {
    if (INJECT_TYPE_IDS.includes(type)) continue
    let t: LoadedTemplate
    try {
      t = loadTemplate(type, projectRoot)
    } catch {
      continue
    }
    const copy =
      t.source === 'project'
        ? copies.find((c) => c.kind === 'templates' && c.id === type)
        : undefined
    out.push(
      injectTypeOfTemplate(
        t,
        copy
          ? {
              id: copy.packId,
              version: copy.version,
              ...(copy.packName ? { name: copy.packName } : {}),
            }
          : undefined,
      ),
    )
  }
  return out
}

const signature = (types: readonly InjectTypeInfo[], hidden: readonly string[]): string =>
  JSON.stringify([
    types.map((t) => [t.id, t.label, t.source, t.pack?.id, t.pack?.version]),
    [...hidden].sort(),
  ])

/**
 * Register the user-layer and pack types (no project) and the hidden types in the shared
 * registry. Emits `templates:changed` when either changed.
 */
export async function syncInjectTypes(): Promise<readonly InjectTypeInfo[]> {
  const next = await layerInjectTypes()
  const hidden = hiddenTypes()
  if (signature(next, hidden) !== signature(registeredInjectTypes(), hiddenInjectTypes())) {
    registerInjectTypes(next, hidden)
    emit('templates:changed', { types: next.length })
  }
  return registeredInjectTypes()
}

let unsubscribe: (() => void) | undefined

/** Main startup: register now and after every pack change. */
export function initTemplateRegistry(): void {
  unsubscribe?.()
  unsubscribe = onPacksChanged(() => {
    syncInjectTypes().catch((e: unknown) => console.error('[templates] registry:', e))
  })
  syncInjectTypes().catch((e: unknown) => console.error('[templates] registry:', e))
}

/**
 * Built-in types, then the ones the layers add (with the project's own when given); types of
 * a disabled bundled pack carry `hidden` (the pickers leave them out).
 */
export async function listInjectTypes(
  projectRoot?: string,
): Promise<(InjectTypeInfo & { hidden?: boolean })[]> {
  await syncInjectTypes()
  const hidden = new Set(hiddenTypes(projectRoot))
  const mark = (t: InjectTypeInfo) => (hidden.has(t.id) ? { ...t, hidden: true } : t)
  if (!projectRoot) return injectTypes().map(mark)
  const seen = new Set(INJECT_TYPE_IDS)
  const extra = (await layerInjectTypes(projectRoot)).filter((t) => {
    if (seen.has(t.id)) return false
    seen.add(t.id)
    return true
  })
  return [...injectTypes().filter((t) => !t.source), ...extra].map(mark)
}
