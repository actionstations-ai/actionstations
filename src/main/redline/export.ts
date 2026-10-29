// Redline export (#431, FR-4, FR-6): accepted proposals grouped by plan. A Word plan gets a copy
// with tracked changes; proposals that cannot be marked there, and every proposal for a plan
// that is not a Word file, go into a change memo. The ingested original is only read, and the
// files are written to the folder the user chose.
import { promises as fs } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import type {
  DocumentMeta,
  Redline,
  RedlineExportEntry,
  RedlineExportResult,
} from '@shared/schemas'
import { readAar } from '../aar/store'
import { loadProject } from '../project/store'
import { readableOriginal, sha256File } from '../ingest/storage'
import { AppError } from '../lib/errors'
import { ensureDir, safeJoin, slugify, writeFileAtomic } from '../lib/fs'
import { nowIso } from '../lib/ids'
import { applyTrackedChanges } from './docx-tracked'
import { changeMemoDocx, changeMemoHtml, type MemoEntry } from './memo'
import { getRedline, saveRedline, withStatus } from './store'

export type RedlineFormat = 'docx' | 'pdf'

export interface ExportRequest {
  root: string
  ids: string[]
  /** Folder for the files; empty means <project>/exports. */
  outDir: string
  formats: RedlineFormat[]
  author?: string
}

const NOT_DOCX = 'The plan is not a Word file, so the change is described in this memo.'

/** The folder to write to: never inside the project's own documents (the originals). */
export function exportFolder(root: string, outDir: string): string {
  const dir = outDir.trim() ? resolve(outDir) : safeJoin(root, 'exports')
  const rel = relative(resolve(root, 'documents'), dir)
  if (rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-zA-Z]:/.test(rel)))
    throw new AppError('VALIDATION', 'Choose a folder outside the project’s documents folder')
  return dir
}

async function actionLabels(root: string, r: Redline): Promise<string[]> {
  const aar = await readAar(root, r.source.scenarioId).catch(() => null)
  if (!aar) return r.source.aarCorrectiveActionIds
  const texts = new Map(
    aar.capabilities.flatMap((c) =>
      c.areasForImprovement.flatMap((f) =>
        f.correctiveActions.map((a) => [a.id, a.action] as const),
      ),
    ),
  )
  return r.source.aarCorrectiveActionIds.flatMap((id) => texts.get(id) ?? [])
}

interface DocGroup {
  doc: DocumentMeta
  redlines: Redline[]
}

function groupByDocument(redlines: Redline[], docs: DocumentMeta[]): DocGroup[] {
  const groups = new Map<string, DocGroup>()
  for (const r of redlines) {
    const doc = docs.find((d) => d.id === r.target.documentId)
    if (!doc)
      throw new AppError('NOT_FOUND', `${r.target.documentTitle} is no longer in the project`)
    const g = groups.get(doc.id) ?? { doc, redlines: [] }
    g.redlines.push(r)
    groups.set(doc.id, g)
  }
  return [...groups.values()]
}

interface Written {
  files: string[]
  entries: RedlineExportEntry[]
  /** redline id → file and mode, for the status update. */
  placed: Map<string, { file: string; mode: 'tracked' | 'memo' }>
}

async function writeTracked(
  root: string,
  group: DocGroup,
  dir: string,
  req: ExportRequest,
  out: Written,
): Promise<{ id: string; reason: string }[]> {
  const bytes = new Uint8Array(await fs.readFile(readableOriginal(root, group.doc)))
  const result = await applyTrackedChanges(
    bytes,
    group.redlines.map((r) => ({
      id: r.id,
      originalExcerpt: r.originalExcerpt,
      proposedText: r.proposedText,
    })),
    { author: req.author?.trim() || 'Action Stations', date: nowIso() },
  )
  if (result.applied.length) {
    const file = join(dir, `${slugify(group.doc.title)}-redline.docx`)
    await writeFileAtomic(file, result.bytes)
    out.files.push(file)
    for (const id of result.applied) {
      out.placed.set(id, { file, mode: 'tracked' })
      out.entries.push({ id, mode: 'tracked', file })
    }
  }
  return result.unmatched
}

async function writeMemo(
  root: string,
  group: DocGroup,
  dir: string,
  req: ExportRequest,
  reasons: Map<string, string>,
  out: Written,
): Promise<void> {
  const entries: MemoEntry[] = []
  for (const r of group.redlines) {
    entries.push({
      redline: r,
      reason: reasons.get(r.id) ?? NOT_DOCX,
      actions: await actionLabels(root, r),
    })
  }
  const project = await loadProject(root)
  const first = group.redlines[0]!
  const model = {
    orgName: project.orgName,
    planTitle: group.doc.title,
    planVersion: group.doc.ingestedAt
      ? `Imported ${group.doc.ingestedAt.slice(0, 10)}`
      : 'Not recorded',
    exercise: first.source.scenarioTitle,
    date: nowIso().slice(0, 10),
    entries,
  }
  const base = join(dir, `${slugify(group.doc.title)}-change-memo`)
  const files: string[] = []
  if (req.formats.includes('docx') || !req.formats.length) {
    await writeFileAtomic(`${base}.docx`, await changeMemoDocx(model))
    files.push(`${base}.docx`)
  }
  if (req.formats.includes('pdf')) {
    const { htmlToPdf } = await import('../export/pdf')
    const { embeddedFontsCss } = await import('../export/page')
    const { printCss } = await import('../export/templates')
    const html = changeMemoHtml(model, `${embeddedFontsCss()}\n${printCss()}`)
    await writeFileAtomic(`${base}.pdf`, await htmlToPdf(html, 'Change memo PDF'))
    files.push(`${base}.pdf`)
  }
  out.files.push(...files)
  for (const e of entries)
    if (files[0]) {
      out.placed.set(e.redline.id, { file: files[0], mode: 'memo' })
      out.entries.push({ id: e.redline.id, mode: 'memo', file: files[0], reason: e.reason })
    }
}

async function exportGroup(
  root: string,
  group: DocGroup,
  dir: string,
  req: ExportRequest,
  out: Written,
) {
  let memoReasons = new Map<string, string>()
  let memoed = group.redlines
  if (group.doc.filename.toLowerCase().endsWith('.docx')) {
    const unmatched = await writeTracked(root, group, dir, req, out)
    memoReasons = new Map(unmatched.map((u) => [u.id, u.reason]))
    memoed = group.redlines.filter((r) => memoReasons.has(r.id))
  }
  if (memoed.length)
    await writeMemo(root, { ...group, redlines: memoed }, dir, req, memoReasons, out)
}

/** Export the accepted redlines in `req.ids`; statuses and file records are updated on success. */
export async function exportRedlines(req: ExportRequest): Promise<RedlineExportResult> {
  const { root } = req
  const redlines = await Promise.all(req.ids.map((id) => getRedline(root, id)))
  const unaccepted = redlines.filter((r) => r.status !== 'accepted' && r.status !== 'exported')
  if (unaccepted.length)
    throw new AppError('VALIDATION', 'Accept the proposals before exporting them')
  const dir = exportFolder(root, req.outDir)
  await ensureDir(dir)
  const project = await loadProject(root)
  const out: Written = { files: [], entries: [], placed: new Map() }
  for (const group of groupByDocument(redlines, project.documents)) {
    await exportGroup(root, group, dir, req, out)
    const sha = await sha256File(readableOriginal(root, group.doc))
    for (const r of group.redlines) await markExported(root, r.id, out.placed.get(r.id), sha)
  }
  return { files: out.files, perRedline: out.entries }
}

async function markExported(
  root: string,
  id: string,
  placed: { file: string; mode: 'tracked' | 'memo' } | undefined,
  originalSha256: string,
): Promise<void> {
  if (!placed) return
  const current = await getRedline(root, id)
  const next = withStatus(
    current,
    'exported',
    placed.mode === 'tracked' ? 'Tracked changes' : 'Change memo',
  )
  await saveRedline(root, {
    ...next,
    export: { at: nowIso(), file: placed.file, mode: placed.mode, originalSha256 },
  })
}
