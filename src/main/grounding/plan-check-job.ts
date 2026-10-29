// The plan-check job (#423, FR-10 to FR-14): extract → pair → confirm → write. Candidates are
// found without a model; when confirmation is on, at most MAX_PAIRS go to the routed critique
// provider, which must quote both passages word for word or its verdict is discarded and the
// pair stays unconfirmed. Decisions from earlier runs carry over (conflicts-file.ts).
import type {
  DocumentKind,
  PlanConflictOutput,
  PlanConflictsFile,
  PlanFinding,
  Project,
} from '@shared/schemas'
import type { JobContext } from '../jobs/manager'
import { emit } from '../lib/events'
import { toAppError } from '../lib/errors'
import { nowIso } from '../lib/ids'
import { pipelineDeps, type PipelineDeps } from '../generate/deps'
import { escapeText } from '../generate/retrieval'
import { runStage } from '../generate/stage'
import type { IndexStore } from '../retrieve/types'
import { mergeFindings, needsVerdict, readConflicts, writeConflicts } from './conflicts-file'
import { MAX_PAIRS } from './constants'
import { candidatePairs, danglingFindings, type Candidate, type PlanDocument } from './plan-check'
import { quoteInPassages } from './verify'

/** Kinds the plan check reads (FR-10). */
export const PLAN_KINDS: readonly DocumentKind[] = ['plan', 'policy', 'form']
const MAX_CHUNKS_PER_DOC = 5000

export interface PlanCheckOptions {
  confirmWithModel: boolean
  withinDocument: boolean
}

export interface PlanCheckSummary {
  candidates: number
  sent: number
  skipped: number
  dangling: number
  listed: number
}

type ChunkIndex = Pick<IndexStore, 'chunks'>

/** The project's plans, policies and forms with every chunk's text. */
export function planDocuments(project: Project, index: ChunkIndex): PlanDocument[] {
  return project.documents
    .filter((d) => PLAN_KINDS.includes(d.kind) && d.status === 'ok')
    .map((d) => ({
      id: d.id,
      title: d.title,
      ...(d.shortName ? { shortName: d.shortName } : {}),
      chunks: index.chunks(d.id, MAX_CHUNKS_PER_DOC, 0).map((c) => ({
        chunkId: c.id,
        documentId: d.id,
        documentTitle: d.title,
        headingPath: c.headingPath,
        ...(c.page !== undefined ? { page: c.page } : {}),
        text: c.text,
      })),
    }))
}

const escapeAttr = (s: string): string => s.replace(/["<>&]/g, (c) => `&#${c.charCodeAt(0)};`)

const passageVars = (c: Candidate['chunkA']) => ({
  documentTitle: escapeAttr(c.documentTitle),
  headingPath: escapeAttr(c.headingPath),
  text: escapeText(c.text),
})

/** FR-10.3: one model call; the verdict counts only with both quotes found in their passages. */
async function confirm(
  c: Candidate,
  env: { root: string; project: Project; deps: PipelineDeps; index: IndexStore },
  ctx: JobContext,
): Promise<PlanFinding> {
  const f = c.finding
  const r = await runStage<PlanConflictOutput>({
    stage: 'plan_conflict',
    itemId: f.id,
    projectPath: env.root,
    vars: {
      project: { orgName: env.project.orgName || env.project.name },
      slotLabel: escapeText(f.slotLabel),
      subject: escapeText(f.subject),
      values: { a: escapeText(f.values?.[0] ?? ''), b: escapeText(f.values?.[1] ?? '') },
      passageA: passageVars(c.chunkA),
      passageB: passageVars(c.chunkB),
    },
    ctx,
    deps: env.deps,
    index: env.index,
  })
  const out = r.output
  if (!quoteInPassages(out.quoteA, [c.chunkA]) || !quoteInPassages(out.quoteB, [c.chunkB])) {
    ctx.log(
      `${f.slotLabel}: verdict "${out.verdict}" discarded; a quote is not in its passage`,
      'warn',
      {
        stage: 'plan_conflict',
        itemId: f.id,
      },
    )
    return f
  }
  return {
    ...f,
    verdict: out.verdict,
    verdictQuotes: { a: out.quoteA, b: out.quoteB },
    ...(out.explanation.trim() ? { explanation: out.explanation.trim().slice(0, 500) } : {}),
  }
}

export async function runPlanCheck(
  root: string,
  opts: PlanCheckOptions,
  ctx: JobContext,
): Promise<PlanCheckSummary> {
  const deps = await pipelineDeps()
  const project = await deps.loadProject(root)
  const { openIndex } = await import('../retrieve')
  const index = await openIndex(root)
  const now = nowIso()
  ctx.progress(0.05, 'Reading the plans')
  const docs = planDocuments(project, index)
  const others = project.documents
    .filter((d) => !docs.some((x) => x.id === d.id))
    .map((d) => ({
      title: d.title,
      ...(d.shortName ? { shortName: d.shortName } : {}),
      headings: d.headingsPreview,
    }))
  const candidates = candidatePairs(docs, { withinDocument: opts.withinDocument, now })
  const dangling = danglingFindings(docs, others, now)
  const previous = (await readConflicts(root))?.findings ?? []
  const before = new Map(previous.map((f) => [f.id, f]))
  const toAsk = opts.confirmWithModel
    ? candidates.filter((c) => needsVerdict(c.finding, before))
    : []
  const sent = toAsk.slice(0, MAX_PAIRS)
  ctx.log(
    `plan check: ${docs.length} document(s), ${candidates.length} candidate conflict(s), ${dangling.length} missing reference(s); ${sent.length} sent to the model, ${toAsk.length - sent.length} skipped (limit ${MAX_PAIRS})`,
    'info',
    { stage: 'plan_conflict' },
  )
  const judged = new Map<string, PlanFinding>()
  for (const [n, c] of sent.entries()) {
    ctx.throwIfCancelled()
    ctx.progress(0.1 + (0.85 * n) / sent.length, `Comparing passages (${n + 1}/${sent.length})`)
    try {
      judged.set(c.finding.id, await confirm(c, { root, project, deps, index }, ctx))
    } catch (err) {
      if (toAppError(err).code === 'CANCELLED') throw err
      ctx.log(`${c.finding.slotLabel}: ${toAppError(err).message}`, 'warn', {
        stage: 'plan_conflict',
      })
    }
  }
  const next = [...candidates.map((c) => judged.get(c.finding.id) ?? c.finding), ...dangling]
  const findings = mergeFindings(previous, next)
  const file: PlanConflictsFile = {
    formatVersion: 1,
    checkedAt: now,
    documents: project.documents
      .filter((d) => docs.some((x) => x.id === d.id))
      .map((d) => ({ id: d.id, sha256: d.sha256 ?? '' })),
    stats: {
      candidates: candidates.length,
      sent: sent.length,
      skipped: toAsk.length - sent.length,
    },
    findings,
  }
  await writeConflicts(root, file)
  emit('project:changed', { path: root, what: 'plan-conflicts' })
  const listed = findings.filter(
    (f) => f.status !== 'outdated' && f.verdict !== 'consistent' && f.verdict !== 'unrelated',
  ).length
  ctx.progress(1, `${listed} finding(s)`)
  return {
    candidates: candidates.length,
    sent: sent.length,
    skipped: toAsk.length - sent.length,
    dangling: dangling.length,
    listed,
  }
}
