// Optional node groups (#356): a workflow may use extra nodes (a custom node package and its
// model) only when the server can run them. Before queueing, every group whose node classes or
// model files the server lacks is left out and the workflow's fallback links take its place.
import { isLink, optionalGroups, withoutGroups, type ApiWorkflow } from '../../../comfy/workflow'

/** One entry of ComfyUI's GET /object_info/<class>. */
export interface NodeInfo {
  input?: { required?: Record<string, unknown>; optional?: Record<string, unknown> }
}

export type NodeInfoLookup = (classType: string) => Promise<NodeInfo | undefined>

/** The options of a combo input spec: old style [[...options], {}] or ["COMBO", { options }]. */
export function comboOptions(spec: unknown): unknown[] | undefined {
  if (!Array.isArray(spec)) return undefined
  if (Array.isArray(spec[0])) return spec[0] as unknown[]
  const opts = (spec[1] as { options?: unknown } | undefined)?.options
  return spec[0] === 'COMBO' && Array.isArray(opts) ? opts : undefined
}

/** Why the server cannot run this node as written, or undefined when it can. */
function nodeProblem(node: ApiWorkflow[string], info: NodeInfo | undefined): string | undefined {
  if (!info) return `node ${node.class_type} is not installed`
  const specs = { ...info.input?.optional, ...info.input?.required }
  for (const [name, value] of Object.entries(node.inputs)) {
    if (isLink(value)) continue
    const options = comboOptions(specs[name])
    if (options && !options.includes(value))
      return `${node.class_type} has no ${name} "${String(value)}"`
  }
  return undefined
}

export interface OptionalCheck {
  /** Groups the server cannot run, with the first reason found. */
  unavailable: { group: string; reason: string }[]
}

/** Check every optional group against the server's node info (one lookup per class). */
export async function checkOptionalGroups(
  workflow: ApiWorkflow,
  lookup: NodeInfoLookup,
): Promise<OptionalCheck> {
  const cache = new Map<string, Promise<NodeInfo | undefined>>()
  const info = (cls: string) => {
    if (!cache.has(cls)) cache.set(cls, lookup(cls))
    return cache.get(cls)!
  }
  const unavailable: OptionalCheck['unavailable'] = []
  for (const [group, ids] of optionalGroups(workflow)) {
    for (const id of ids) {
      const node = workflow[id]!
      const reason = nodeProblem(node, await info(node.class_type))
      if (reason) {
        unavailable.push({ group, reason })
        break
      }
    }
  }
  return { unavailable }
}

/** The workflow the server can run: unavailable optional groups left out, fallbacks wired. */
export async function runnableWorkflow(
  workflow: ApiWorkflow,
  lookup: NodeInfoLookup,
): Promise<{ workflow: ApiWorkflow } & OptionalCheck> {
  if (!optionalGroups(workflow).size) return { workflow, unavailable: [] }
  const check = await checkOptionalGroups(workflow, lookup)
  return {
    workflow: withoutGroups(
      workflow,
      check.unavailable.map((u) => u.group),
    ),
    ...check,
  }
}
