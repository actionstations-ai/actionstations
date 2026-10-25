// ComfyUI workflow JSON helpers: API-format validation, UI-format detection, node listing.
// API format = { "<nodeId>": { class_type, inputs, _meta? } } — what POST /prompt accepts.
// UI format  = { nodes: [...], links: [...] } — what "Save" in the ComfyUI editor writes.
// Optional nodes (#356): `_meta.optional` names a group of nodes the workflow uses only when
// the server has them; `_meta.fallback` on another node gives the input value to use instead
// of a link into a group that is left out. ComfyUI ignores `_meta`.
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { AppError } from '../lib/errors'

export const ApiNode = z.looseObject({
  class_type: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()).default({}),
  _meta: z
    .looseObject({
      title: z.string().optional(),
      /** Optional group this node belongs to (#356): left out when the server cannot run it. */
      optional: z.string().min(1).optional(),
      /** Input → value used when the input's link points into a group that was left out. */
      fallback: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
})
export type ApiNode = z.infer<typeof ApiNode>

export const ApiWorkflow = z.record(z.string(), ApiNode)
export type ApiWorkflow = z.infer<typeof ApiWorkflow>

/** A link to another node's output: ["<nodeId>", outputIndex]. Not a literal value. */
export function isLink(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'number'
  )
}

export type WorkflowFormat = 'api' | 'ui' | 'unknown'

export function detectWorkflowFormat(json: unknown): WorkflowFormat {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return 'unknown'
  const obj = json as Record<string, unknown>
  if (Array.isArray(obj.nodes) && ('links' in obj || 'last_node_id' in obj || 'version' in obj))
    return 'ui'
  const values = Object.values(obj)
  if (values.length && values.every((v) => ApiNode.safeParse(v).success)) return 'api'
  return 'unknown'
}

const UI_FORMAT_HELP =
  'This is a ComfyUI editor (UI) workflow. Export the API format instead: in ComfyUI open the ' +
  'workflow, then Workflow → Export (API) (older versions: enable Dev mode in settings and use ' +
  '"Save (API Format)"). The API file maps node ids to { class_type, inputs }.'

/** Parse workflow text; explains UI-format files instead of failing obscurely. */
export function parseApiWorkflow(text: string): ApiWorkflow {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (e) {
    throw new AppError('VALIDATION', `Workflow is not valid JSON: ${(e as Error).message}`)
  }
  const format = detectWorkflowFormat(json)
  if (format === 'ui') throw new AppError('VALIDATION', UI_FORMAT_HELP, { format })
  if (format !== 'api')
    throw new AppError(
      'VALIDATION',
      'Not a ComfyUI API-format workflow: expected an object of nodes with "class_type" and "inputs".',
      { format },
    )
  return ApiWorkflow.parse(json)
}

const sortedUnique = (values: Iterable<string>): string[] => [...new Set(values)].sort()

/** Node class names the workflow needs, sorted and unique. Optional groups are not counted. */
export function requiredNodes(workflow: ApiWorkflow): string[] {
  return sortedUnique(
    Object.values(workflow)
      .filter((n) => !n._meta?.optional)
      .map((n) => n.class_type),
  )
}

/** Node classes only optional groups use (#356): the workflow runs without them. */
export function optionalNodes(workflow: ApiWorkflow): string[] {
  const required = new Set(requiredNodes(workflow))
  return sortedUnique(
    Object.values(workflow)
      .filter((n) => n._meta?.optional && !required.has(n.class_type))
      .map((n) => n.class_type),
  )
}

/** Optional groups → their node ids. */
export function optionalGroups(workflow: ApiWorkflow): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const [id, node] of Object.entries(workflow)) {
    const group = node._meta?.optional
    if (group) groups.set(group, [...(groups.get(group) ?? []), id])
  }
  return groups
}

/**
 * Copy of the workflow without the nodes of `groups`. An input linked to a removed node takes
 * its node's `_meta.fallback` value; without one the workflow cannot run and this throws.
 */
export function withoutGroups(workflow: ApiWorkflow, groups: Iterable<string>): ApiWorkflow {
  const drop = new Set(groups)
  if (!drop.size) return workflow
  const out: ApiWorkflow = {}
  const removed = new Set<string>()
  for (const [id, node] of Object.entries(workflow)) {
    const group = node._meta?.optional
    if (group && drop.has(group)) removed.add(id)
    else out[id] = structuredClone(node)
  }
  for (const [id, node] of Object.entries(out)) {
    for (const [input, value] of Object.entries(node.inputs)) {
      if (!isLink(value) || !removed.has((value as [string, number])[0])) continue
      const fallback = node._meta?.fallback
      if (!fallback || !Object.hasOwn(fallback, input))
        throw new AppError(
          'VALIDATION',
          `Workflow node "${id}" input "${input}" needs optional nodes that are not available and names no fallback`,
        )
      node.inputs[input] = fallback[input]
    }
  }
  return out
}

export function missingNodes(required: string[], available: Set<string>): string[] {
  return required.filter((c) => !available.has(c))
}

export interface WorkflowInput {
  nodeId: string
  classType: string
  title?: string
  inputName: string
  value: unknown
}

/** Literal (widget) inputs of every node — the rows a binding can target. Links are skipped. */
export function literalInputs(workflow: ApiWorkflow): WorkflowInput[] {
  const rows: WorkflowInput[] = []
  for (const [nodeId, node] of sortedNodes(workflow)) {
    for (const [inputName, value] of Object.entries(node.inputs)) {
      if (isLink(value)) continue
      rows.push({
        nodeId,
        classType: node.class_type,
        ...(node._meta?.title ? { title: node._meta.title } : {}),
        inputName,
        value,
      })
    }
  }
  return rows
}

function sortedNodes(workflow: ApiWorkflow): [string, ApiNode][] {
  return Object.entries(workflow).sort(([a], [b]) => {
    const na = Number(a)
    const nb = Number(b)
    return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b)
  })
}

/** Stable JSON (sorted keys) so equal workflows hash equally regardless of key order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function workflowSha256(workflow: ApiWorkflow): string {
  return createHash('sha256').update(stableStringify(workflow)).digest('hex')
}

const MODEL_INPUTS = ['ckpt_name', 'unet_name', 'model_name', 'checkpoint']

/** First checkpoint / diffusion model file named in the workflow (for provenance). */
export function modelNameOf(workflow: ApiWorkflow): string | undefined {
  for (const [, node] of sortedNodes(workflow)) {
    for (const key of MODEL_INPUTS) {
      const v = node.inputs[key]
      if (typeof v === 'string' && v) return v
    }
  }
  return undefined
}
