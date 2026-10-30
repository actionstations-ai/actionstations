// Export as pack (#271, ADR-0018): build an .aspack from the user's own content.
//
//   exportSources(projectPath?, { appVersion })       → what the wizard can offer
//   buildPackExport(request, { appVersion, builtins }) → { ok, buffer, built } | { ok: false, problems }
//
// The archive is deterministic: entries sorted by path (code units), one fixed timestamp,
// regular-file mode 0644, deflate, no folder entries and no time-dependent content, so two
// exports of the same content have the same sha256. The result is checked with readPack (the
// same reader install uses) before anyone can save it; a pack the reader refuses is never
// written, and the reader's problems are returned as they are.
import { createHash } from 'node:crypto'
import type { z } from 'zod'
import {
  PackExportRequest,
  type PackExportBuilt,
  type PackExportSources,
} from '@shared/ipc/pack-export'
import { ExampleMarker } from '@shared/ipc/examples'
import {
  manifestContents,
  packFormatVersionFor,
  PACK_MANIFEST_FILE,
  packArchiveName,
  type PackContents,
  type PackDocument,
  type PackProblem,
} from '@shared/schemas/pack'
import type { Project } from '@shared/schemas/project'
import { readJsonOr } from '../lib/fs'
import { EXPORT_ZIP_DATE, PACKS_SINCE_VERSION, packMinAppVersion, zipTree } from './archive'
import { join } from 'node:path'
import { loadProject } from '../project/store'
import { MARKER_FILE } from '../examples/open'
import { loadBuiltins, type PackBuiltins } from './builtins'
import { readPack } from './reader'
import { collectExample } from './export-example'
import {
  collectDocuments,
  collectDomain,
  collectPrompts,
  collectTemplates,
  collectWorkflows,
  emptyCollected,
  exportableProject,
  suggestedUser,
  userPromptItems,
  userTemplateItems,
  userWorkflowItems,
  type Collected,
} from './export-collect'

export { EXPORT_ZIP_DATE, PACKS_SINCE_VERSION, packMinAppVersion, zipTree }

export type ParsedExportRequest = z.output<typeof PackExportRequest>

export interface ExportContext {
  appVersion: string
  builtins?: PackBuiltins
}

export type ExportOutcome =
  { ok: true; buffer: Buffer; built: PackExportBuilt } | { ok: false; problems: PackProblem[] }

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex')
const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export async function exportSources(
  projectPath: string | undefined,
  ctx: ExportContext,
): Promise<PackExportSources> {
  const builtins = ctx.builtins ?? (await loadBuiltins())
  const [templates, prompts, workflows] = await Promise.all([
    userTemplateItems(),
    userPromptItems(builtins.prompts),
    userWorkflowItems(),
  ])
  let project: PackExportSources['project']
  if (projectPath) {
    const p = await loadProject(projectPath)
    const marker = await readJsonOr(
      join(projectPath, MARKER_FILE),
      ExampleMarker.nullable(),
      () => null,
    )
    project = exportableProject(projectPath, p, marker?.notice)
  }
  return {
    templates,
    prompts,
    workflows,
    ...(project ? { project } : {}),
    appVersion: ctx.appVersion,
    suggestedUser: suggestedUser(),
  }
}

function contentsOf(req: ParsedExportRequest): PackContents {
  return {
    templates: [...req.templates].sort(byPath),
    prompts: [...req.prompts].sort(byPath),
    domains: req.domain ? [req.domain.id] : [],
    workflows: [...req.workflows].sort(byPath),
    documents: [],
    examples: req.example ? [req.example.slug] : [],
    regulations: [],
    frameworks: [],
  }
}

/** pack.json, keys in a fixed order, optional fields only when set. */
function manifestJson(
  req: ParsedExportRequest,
  appVersion: string,
  contents: PackContents,
  documents: PackDocument[],
  files: ReadonlyMap<string, Buffer>,
): Buffer {
  const m = req.metadata
  const manifest = {
    formatVersion: packFormatVersionFor(contents),
    id: m.id,
    name: m.name,
    version: m.version,
    summary: m.summary,
    ...(m.description ? { description: m.description } : {}),
    author: {
      name: m.author.name,
      ...(m.author.url ? { url: m.author.url } : {}),
      ...(m.author.email ? { email: m.author.email } : {}),
    },
    ...(m.contributors.length ? { contributors: m.contributors } : {}),
    license: m.license,
    ...(m.homepage ? { homepage: m.homepage } : {}),
    minAppVersion: packMinAppVersion(appVersion),
    domains: m.domains,
    tags: m.tags,
    contents: manifestContents(contents),
    ...(documents.length
      ? { documents: [...documents].sort((a, b) => byPath(a.path, b.path)) }
      : {}),
    files: [...files.keys()].sort(byPath).map((path) => {
      const b = files.get(path)!
      return { path, sha256: sha256(b), size: b.length }
    }),
  }
  return Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
}

function requestProblems(req: ParsedExportRequest): PackProblem[] {
  const problems: PackProblem[] = []
  if (!req.redistributeConfirmed)
    problems.push({
      message:
        'Confirm that you may redistribute everything in this pack under the licenses you chose.',
    })
  const count =
    req.templates.length +
    req.prompts.length +
    req.workflows.length +
    req.documents.length +
    (req.domain ? 1 : 0) +
    (req.example ? 1 : 0)
  if (count === 0) problems.push({ message: 'Choose at least one item to export.' })
  if ((req.domain || req.example || req.documents.length) && !req.projectPath)
    problems.push({ message: 'Choose the project the domain, documents or example come from.' })
  return problems
}

async function collectProject(req: ParsedExportRequest, out: Collected): Promise<void> {
  if (!req.projectPath) return
  const root = req.projectPath
  const project: Project = await loadProject(root)
  if (req.domain) collectDomain(project, req.domain.id, req.domain.label, out)
  await collectDocuments(root, project, req.documents, out)
  if (req.example) {
    const ex = await collectExample({
      root,
      example: req.example,
      ...(req.domain ? { domainId: req.domain.id } : {}),
    })
    for (const [p, b] of ex.files) out.files.set(p, b)
    out.skipped.push(...ex.skipped)
    out.problems.push(...ex.problems)
  }
}

/** Collect, write pack.json, zip, and verify with the reader. */
export async function buildPackExport(
  request: z.input<typeof PackExportRequest>,
  ctx: ExportContext,
): Promise<ExportOutcome> {
  const req = PackExportRequest.parse(request)
  const early = requestProblems(req)
  if (early.length) return { ok: false, problems: early }
  const out = emptyCollected()
  await collectTemplates(req.templates, out)
  await collectPrompts(req.prompts, out)
  await collectWorkflows(req.workflows, out)
  await collectProject(req, out)
  if (out.problems.length) return { ok: false, problems: out.problems }
  const contents = contentsOf(req)
  contents.documents = [...new Set(out.documents.map((d) => d.path.split('/')[1]!))].sort(byPath)
  const entries = new Map(out.files)
  entries.set(
    PACK_MANIFEST_FILE,
    manifestJson(req, ctx.appVersion, contents, out.documents, out.files),
  )
  const buffer = await zipTree(entries)
  const builtins = ctx.builtins ?? (await loadBuiltins())
  // Checked as the oldest app the pack declares, so a dev build (0.1.0) can still self-check.
  const read = await readPack(
    { buffer },
    { appVersion: packMinAppVersion(ctx.appVersion), builtins },
  )
  if (!read.ok) return { ok: false, problems: read.problems }
  return {
    ok: true,
    buffer,
    built: {
      ok: true,
      fileName: packArchiveName(req.metadata.id, req.metadata.version),
      sha256: read.pack.archiveSha256,
      size: buffer.length,
      fileCount: read.pack.files.size,
      items: read.pack.items,
      skipped: out.skipped,
    },
  }
}
