// Per-kind content checks for a pack (docs/packs-format.md "Per-kind content checks"). Each
// kind is parsed with the code the app uses for its own files; this module only decides what
// a pack may add on top (no built-in domain ids, shipped prompt names only…) and builds the
// item summaries the review screen shows.
import Ajv2020 from 'ajv/dist/2020.js'
import { z } from 'zod'
import {
  DomainProfile,
  builtinByKey,
  bundledDomainIds,
  domainProfileRegexProblems,
} from '@shared/domains'
import { ExampleManifest } from '@shared/ipc/examples'
import { Project } from '@shared/schemas/project'
import {
  PACK_KINDS,
  TemplateTaxonomy,
  type PackItemSummary,
  type PackKind,
  type PackManifest,
  type PackProblem,
} from '@shared/schemas/pack'
import { INJECT_TYPE_IDS } from '@shared/taxonomy'
import { WorkflowSidecar } from '../comfy/sidecar'
import { parseApiWorkflow, requiredNodes } from '../comfy/workflow'
import { toAppError } from '../lib/errors'
import { parsePromptRaw, type PromptIssue } from '../prompts/format'
import { TemplateMeta, TemplatePreview } from '../render/templates'
import type { PackBuiltins } from './builtins'
import { customNodeClasses } from './comfy-core-nodes'
import { schemaRegexProblems } from './schema-regex'
import { checkTemplateFiles } from './template-check'

export type PackFiles = ReadonlyMap<string, Buffer>

interface Ctx {
  manifest: PackManifest
  files: PackFiles
  builtins: PackBuiltins
  /** A bundled pack built from the repo (ADR-0020): it may provide the built-in domains. */
  trusted: boolean
  problems: PackProblem[]
}

interface ItemResult {
  title: string
  replacesBuiltin: boolean
  license?: string
  customNodes?: string[]
}

// Same options as the template field validator (src/main/render/templates.ts).
const ajv = new Ajv2020({ allErrors: true, strict: false })

const text = (ctx: Ctx, path: string): string | undefined => ctx.files.get(path)?.toString('utf8')

function json(ctx: Ctx, path: string): unknown {
  const raw = text(ctx, path)
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw)
  } catch (e) {
    ctx.problems.push({ path, message: `not valid JSON: ${(e as Error).message}` })
    return undefined
  }
}

function zodProblems(ctx: Ctx, path: string, error: z.ZodError): void {
  for (const issue of error.issues.slice(0, 10)) {
    const where = issue.path.length ? `${issue.path.join('.')}: ` : ''
    ctx.problems.push({ path, message: `${where}${issue.message}` })
  }
}

function parseWith<T extends z.ZodType>(ctx: Ctx, path: string, schema: T): z.infer<T> | undefined {
  const data = json(ctx, path)
  if (data === undefined) return undefined
  const r = schema.safeParse(data)
  if (!r.success) {
    zodProblems(ctx, path, r.error)
    return undefined
  }
  return r.data
}

function templateFiles(ctx: Ctx, id: string): Map<string, Buffer> {
  const prefix = `templates/${id}/`
  const out = new Map<string, Buffer>()
  for (const [p, b] of ctx.files) if (p.startsWith(prefix)) out.set(p.slice(prefix.length), b)
  return out
}

function checkTemplate(ctx: Ctx, id: string): ItemResult {
  const dir = `templates/${id}`
  for (const p of checkTemplateFiles(templateFiles(ctx, id)))
    ctx.problems.push({ path: p.path ? `${dir}/${p.path}` : dir, message: p.message })
  const meta = parseWith(ctx, `${dir}/meta.json`, TemplateMeta)
  if (meta && meta.type !== id)
    ctx.problems.push({
      path: `${dir}/meta.json`,
      message: `type "${meta.type}" must equal the folder name "${id}"`,
    })
  if (meta && !INJECT_TYPE_IDS.includes(id)) {
    const raw = (json(ctx, `${dir}/meta.json`) as { taxonomy?: unknown }).taxonomy
    const tax = TemplateTaxonomy.safeParse(raw)
    if (raw === undefined)
      ctx.problems.push({
        path: `${dir}/meta.json`,
        message: `"${id}" is not a built-in inject type, so meta.json needs a taxonomy block (category, render, defaultDelivery)`,
      })
    else if (!tax.success) zodProblems(ctx, `${dir}/meta.json`, prefixIssues(tax.error, 'taxonomy'))
  }
  const schema = json(ctx, `${dir}/schema.json`)
  if (schema !== undefined) {
    for (const p of schemaRegexProblems(schema))
      ctx.problems.push({ path: `${dir}/schema.json`, message: p.message })
    try {
      ajv.compile(schema as object)
    } catch (e) {
      ctx.problems.push({
        path: `${dir}/schema.json`,
        message: `not a valid JSON Schema: ${(e as Error).message}`,
      })
    }
  }
  if (ctx.files.has(`${dir}/preview.json`)) parseWith(ctx, `${dir}/preview.json`, TemplatePreview)
  return { title: meta?.label ?? id, replacesBuiltin: ctx.builtins.templates.includes(id) }
}

const prefixIssues = (error: z.ZodError, key: string): z.ZodError =>
  new z.ZodError(error.issues.map((i) => ({ ...i, path: [key, ...i.path] })))

function checkPrompt(ctx: Ctx, id: string): ItemResult {
  const path = `prompts/${id}.md`
  if (!ctx.builtins.prompts.includes(id))
    ctx.problems.push({
      path,
      message: `"${id}" is not a prompt the app ships; a pack can only replace a shipped prompt`,
    })
  let title = id
  try {
    const parsed = parsePromptRaw(text(ctx, path) ?? '', id, path)
    title = parsed.frontmatter.description ?? id
  } catch (e) {
    const err = toAppError(e)
    const issues = (err.details as PromptIssue[] | undefined) ?? []
    if (issues.length)
      for (const i of issues) ctx.problems.push({ path, message: `line ${i.line}: ${i.message}` })
    else ctx.problems.push({ path, message: err.message })
  }
  return { title, replacesBuiltin: true }
}

function checkDomain(ctx: Ctx, id: string): ItemResult {
  const path = `domains/${id}.json`
  const profile = parseWith(ctx, path, DomainProfile)
  if (!profile) return { title: id, replacesBuiltin: false }
  if (profile.id !== id)
    ctx.problems.push({ path, message: `id "${profile.id}" must equal the file name "${id}"` })
  for (const name of [profile.id, ...profile.aliases])
    if (!ctx.trusted && builtinByKey(name))
      ctx.problems.push({
        path,
        message: `"${name}" is a built-in domain id or alias; a pack domain needs its own id (use domainProfileOverrides to change a built-in domain)`,
      })
  // Its regexes run in the main process over every document and generated row (#351).
  for (const p of domainProfileRegexProblems(profile))
    ctx.problems.push({ path, message: `${p.path}: ${p.message}` })
  return { title: profile.label, replacesBuiltin: false }
}

function checkWorkflow(ctx: Ctx, id: string): ItemResult {
  const path = `workflows/${id}.json`
  let customNodes: string[] = []
  try {
    customNodes = customNodeClasses(requiredNodes(parseApiWorkflow(text(ctx, path) ?? '')))
  } catch (e) {
    ctx.problems.push({ path, message: toAppError(e).message })
  }
  const sidecar = parseWith(ctx, `workflows/${id}.bindings.json`, WorkflowSidecar)
  return {
    title: sidecar?.name ?? id,
    replacesBuiltin: ctx.builtins.workflows.includes(id),
    customNodes,
  }
}

function checkDocuments(ctx: Ctx, id: string): ItemResult {
  const docs = ctx.manifest.documents.filter((d) => d.path.startsWith(`documents/${id}/`))
  return {
    title:
      docs.length === 1
        ? docs[0]!.title
        : `${docs[0]?.title ?? id}${docs.length > 1 ? ` (+${docs.length - 1})` : ''}`,
    replacesBuiltin: false,
    license: [...new Set(docs.map((d) => d.license))].join(', '),
  }
}

/** ExampleManifest, with domainProfile also allowed to name a domain of the same pack. */
const PackExampleManifest = ExampleManifest.extend({ domainProfile: z.string() })

function checkExample(ctx: Ctx, id: string): ItemResult {
  const dir = `examples/${id}`
  const manifest = parseWith(ctx, `${dir}/example.json`, PackExampleManifest)
  if (manifest && manifest.id !== id)
    ctx.problems.push({
      path: `${dir}/example.json`,
      message: `id "${manifest.id}" must equal the folder name "${id}"`,
    })
  const d = (json(ctx, `${dir}/example.json`) as { domainProfile?: unknown } | undefined)
    ?.domainProfile
  if (typeof d === 'string') {
    if (!bundledDomainIds().includes(d) && !ctx.manifest.contents.domains.includes(d))
      ctx.problems.push({
        path: `${dir}/example.json`,
        message: `domainProfile "${d}" is neither a built-in domain nor a domain of this pack`,
      })
  }
  parseWith(ctx, `${dir}/project/project.json`, Project)
  return { title: manifest?.title ?? id, replacesBuiltin: ctx.builtins.examples.includes(id) }
}

const CHECKS: Record<PackKind, (ctx: Ctx, id: string) => ItemResult> = {
  templates: checkTemplate,
  prompts: checkPrompt,
  domains: checkDomain,
  workflows: checkWorkflow,
  documents: checkDocuments,
  examples: checkExample,
}

/** Archive paths that belong to one item. */
export function itemPaths(kind: PackKind, id: string, paths: Iterable<string>): string[] {
  const flat: Record<string, (p: string) => boolean> = {
    prompts: (p) => p === `prompts/${id}.md`,
    domains: (p) => p === `domains/${id}.json`,
    workflows: (p) => p === `workflows/${id}.json` || p === `workflows/${id}.bindings.json`,
  }
  const match = flat[kind] ?? ((p: string) => p.startsWith(`${kind}/${id}/`))
  return [...paths].filter(match)
}

/** Validate every item's content; returns the problems and the review summaries. */
export function checkPackContent(
  manifest: PackManifest,
  files: PackFiles,
  builtins: PackBuiltins,
  opts: { trusted?: boolean } = {},
): { problems: PackProblem[]; items: PackItemSummary[] } {
  const ctx: Ctx = { manifest, files, builtins, trusted: !!opts.trusted, problems: [] }
  const items: PackItemSummary[] = []
  for (const kind of PACK_KINDS) {
    for (const id of manifest.contents[kind]) {
      const r = CHECKS[kind](ctx, id)
      const size = itemPaths(kind, id, files.keys()).reduce((n, p) => n + files.get(p)!.length, 0)
      const owner = r.replacesBuiltin ? builtins.owners?.[kind]?.[id] : undefined
      items.push({
        kind,
        id,
        title: r.title,
        replacesBuiltin: r.replacesBuiltin,
        ...(owner ? { replacesPack: owner } : {}),
        license: r.license || manifest.license,
        ...(r.customNodes ? { customNodes: r.customNodes } : {}),
        size,
      })
    }
  }
  return { problems: ctx.problems, items }
}
