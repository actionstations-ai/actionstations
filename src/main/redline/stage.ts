// The plan_redline stage (#431, FR-2): for each plan section an area for improvement cites,
// the section's full text and the finding go to the model, which proposes revised wording for
// passages it quotes word for word. A quote that is not in the section is sent back once; a
// proposal still unquoted after that is dropped on its own, never the others.
import {
  type Aar,
  type Citation,
  type DocumentMeta,
  type Finding,
  type GroundingLabel,
  type RedlineOutput,
  type RedlineSourceKind,
  type Scenario,
  type StageRun,
} from '@shared/schemas'
import { findExcerpt, normalizedForm } from '@shared/redline/excerpt'
import { pipelineDeps, type PipelineDeps, type SearchIndex } from '../generate/deps'
import { escapeText } from '../generate/retrieval'
import { runStage } from '../generate/stage'
import { contextFor } from '../grounding/project'
import { labelClaims } from '../grounding/label'
import { preparePassage } from '../grounding/support'
import { readAar } from '../aar/store'
import type { JobContext } from '../jobs/manager'
import { AppError, toAppError } from '../lib/errors'
import { sectionText, type ChunkSource, type SectionText } from './section-text'
import { createRedline } from './store'

const KINDS: Record<string, RedlineSourceKind> = {
  docx: 'docx',
  pdf: 'pdf',
  pptx: 'pptx',
  xlsx: 'xlsx',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  html: 'html',
  htm: 'html',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
}

/** What kind of file a document was ingested from, by its file name. */
export function sourceKindOf(doc: Pick<DocumentMeta, 'filename'>): RedlineSourceKind {
  const ext = doc.filename.split('.').pop()?.toLowerCase() ?? ''
  return KINDS[ext] ?? 'text'
}

export interface RedlineSummary {
  created: number
  /** Proposals dropped because their quote is not in the section. */
  dropped: number
  /** Cited sections that could not be read or drafted, with the reason. */
  skipped: string[]
}

interface Slot {
  finding: Finding
  capability: Aar['capabilities'][number]['capability']
}

function collectFindings(aar: Aar, ids: string[]): Slot[] {
  const wanted = new Set(ids)
  return aar.capabilities.flatMap((c) =>
    c.areasForImprovement
      .filter((f) => wanted.has(f.id))
      .map((finding) => ({ finding, capability: c.capability })),
  )
}

const sectionKey = (c: Citation): string => `${c.documentId}\0${normalizedForm(c.headingPath)}`

function uniqueSections(f: Finding): Citation[] {
  const seen = new Set<string>()
  return f.citations.filter((c) => !seen.has(sectionKey(c)) && !!seen.add(sectionKey(c)))
}

interface Env {
  root: string
  deps: PipelineDeps
  index: SearchIndex & ChunkSource
  scenario: Scenario
  docs: Map<string, DocumentMeta>
  ctx: JobContext
  projectId: string
  orgName: string
  instructions?: string
}

interface Quoted {
  originalExcerpt: string
  proposedText: string
  rationale: string
}

async function callOnce(
  env: Env,
  slot: Slot,
  cite: Citation,
  section: SectionText,
  rejected: string[],
): Promise<{ output: RedlineOutput; run: StageRun }> {
  const r = await runStage<RedlineOutput>({
    stage: 'plan_redline',
    itemId: `${slot.finding.id}:${cite.headingPath}`.slice(0, 120),
    projectPath: env.root,
    vars: {
      project: { orgName: env.orgName },
      finding: {
        title: slot.finding.title,
        analysisMd: escapeText(slot.finding.analysisMd),
        recommendation: escapeText(slot.finding.recommendation),
        actions: slot.finding.correctiveActions.map((a) => escapeText(a.action)),
      },
      section: {
        documentTitle: cite.documentTitle,
        headingPath: cite.headingPath,
        text: escapeText(section.text),
      },
      rejected: rejected.map((q) => q.slice(0, 200)),
      ...(env.instructions ? { instructions: env.instructions } : {}),
    },
    ctx: env.ctx,
    deps: env.deps,
    index: env.index,
  })
  return { output: r.output, run: r.run }
}

/** Anchor each proposal's quote to the section's own wording; the rest are the rejected quotes. */
function anchor(section: SectionText, proposals: RedlineOutput['proposals']) {
  const good: Quoted[] = []
  const rejected: string[] = []
  for (const p of proposals) {
    const span = findExcerpt(section.text, p.originalExcerpt)
    if (!span) rejected.push(p.originalExcerpt)
    else if (normalizedForm(p.proposedText) !== normalizedForm(p.originalExcerpt))
      good.push({ ...p, originalExcerpt: section.text.slice(span.start, span.end) })
  }
  return { good, rejected }
}

/** One call plus at most one repair round for quotes the section does not contain. */
async function proposalsFor(env: Env, slot: Slot, cite: Citation, section: SectionText) {
  const first = await callOnce(env, slot, cite, section, [])
  let { good, rejected } = anchor(section, first.output.proposals)
  let run = first.run
  if (rejected.length) {
    const again = await callOnce(env, slot, cite, section, rejected)
    const next = anchor(section, again.output.proposals)
    const have = new Set(good.map((g) => normalizedForm(g.originalExcerpt)))
    good = [...good, ...next.good.filter((g) => !have.has(normalizedForm(g.originalExcerpt)))]
    rejected = next.rejected
    run = again.run
  }
  return { good, dropped: rejected.length, run }
}

/** The grounding label of the proposed wording against the section it revises (#423). */
async function groundingOf(
  env: Env,
  cite: Citation,
  section: SectionText,
  proposedText: string,
): Promise<GroundingLabel | undefined> {
  try {
    const gctx = await contextFor(env.root, env.scenario, { index: env.index })
    const chunkId = section.chunkIds[0]
    const passage = {
      chunkId: chunkId ?? 0,
      documentId: cite.documentId,
      documentTitle: cite.documentTitle,
      headingPath: cite.headingPath,
      text: section.text,
    }
    return labelClaims({
      claimText: proposedText,
      citations: [cite],
      passages: [preparePassage(passage)],
      facts: gctx.facts,
      anchorOptions: { ignore: gctx.ignore },
    }).label
  } catch {
    // Grounding never blocks the work it follows.
    return undefined
  }
}

function criteriaCiting(scenario: Scenario, cite: Citation): string[] {
  const want = normalizedForm(cite.headingPath)
  return scenario.evaluation.eegs
    .flatMap((e) => e.criticalTasks)
    .filter(
      (t) =>
        t.citation.documentId === cite.documentId &&
        normalizedForm(t.citation.headingPath) === want,
    )
    .map((t) => t.id)
}

async function saveProposals(
  env: Env,
  slot: Slot,
  cite: Citation,
  section: SectionText,
  made: Awaited<ReturnType<typeof proposalsFor>>,
): Promise<number> {
  const doc = env.docs.get(cite.documentId)!
  for (const p of made.good) {
    const grounding = await groundingOf(env, cite, section, p.proposedText)
    const programIds = slot.finding.correctiveActions.flatMap((a) => a.programActionId ?? [])
    await createRedline(
      env.root,
      {
        projectId: env.projectId,
        source: {
          scenarioId: env.scenario.id,
          scenarioTitle: env.scenario.title,
          findingId: slot.finding.id,
          capability: slot.capability,
          aarCorrectiveActionIds: slot.finding.correctiveActions.map((a) => a.id),
          correctiveActionIds: programIds,
          criterionIds: criteriaCiting(env.scenario, cite),
        },
        target: {
          documentId: doc.id,
          documentTitle: doc.title,
          ...(doc.sha256 ? { documentSha256: doc.sha256 } : {}),
          headingPath: cite.headingPath,
          ...(section.page !== undefined ? { page: section.page } : {}),
          sourceKind: sourceKindOf(doc),
        },
        originalExcerpt: p.originalExcerpt,
        proposedText: p.proposedText.trim(),
        rationale: p.rationale.trim().slice(0, 2000),
        ...(grounding ? { grounding } : {}),
        provenance: made.run,
      },
      'ai',
    )
  }
  return made.good.length
}

async function openEnv(
  root: string,
  scenarioId: string,
  ctx: JobContext,
  instructions?: string,
): Promise<Env> {
  const deps = await pipelineDeps()
  const [project, index, scenario] = await Promise.all([
    deps.loadProject(root),
    deps.openIndex(root),
    deps.store.getScenario(root, scenarioId),
  ])
  return {
    root,
    deps,
    index: index as SearchIndex & ChunkSource,
    scenario,
    docs: new Map(project.documents.map((d) => [d.id, d])),
    ctx,
    projectId: project.id,
    orgName: project.orgName || project.name,
    ...(instructions ? { instructions } : {}),
  }
}

/** Draft redlines for the chosen areas for improvement of a scenario's AAR/IP. */
export async function generateRedlines(
  root: string,
  scenarioId: string,
  findingIds: string[],
  ctx: JobContext,
  instructions?: string,
): Promise<RedlineSummary> {
  const aar = await readAar(root, scenarioId)
  if (!aar) throw new AppError('NOT_FOUND', 'This scenario has no AAR/IP yet. Draft it first.')
  const slots = collectFindings(aar, findingIds)
  if (!slots.length)
    throw new AppError('VALIDATION', 'None of the chosen findings is in the AAR/IP')
  const env = await openEnv(root, scenarioId, ctx, instructions)
  const summary: RedlineSummary = { created: 0, dropped: 0, skipped: [] }
  const work = slots.flatMap((slot) => uniqueSections(slot.finding).map((cite) => ({ slot, cite })))
  if (!work.length)
    throw new AppError(
      'VALIDATION',
      'The chosen findings cite no plan section, so there is nothing to revise',
    )
  for (const [n, { slot, cite }] of work.entries()) {
    ctx.throwIfCancelled()
    ctx.progress(
      n / work.length,
      `Drafting wording for ${cite.headingPath} (${n + 1}/${work.length})`,
    )
    await draftSection(env, slot, cite, summary)
  }
  ctx.progress(1, `${summary.created} proposal(s) drafted`)
  if (!summary.created && summary.skipped.length)
    throw new AppError('PROVIDER', `No proposal could be drafted: ${summary.skipped[0]}`)
  return summary
}

async function draftSection(env: Env, slot: Slot, cite: Citation, summary: RedlineSummary) {
  const label = `${cite.documentTitle} › ${cite.headingPath}`
  if (!env.docs.has(cite.documentId)) {
    summary.skipped.push(`${label}: the document is no longer in the project`)
    return
  }
  const section = sectionText(env.index, cite.documentId, cite.headingPath)
  if (!section) {
    summary.skipped.push(`${label}: the section is not in the index (the plan was imported again)`)
    return
  }
  try {
    const made = await proposalsFor(env, slot, cite, section)
    summary.dropped += made.dropped
    summary.created += await saveProposals(env, slot, cite, section, made)
    if (made.dropped)
      env.ctx.log(
        `${label}: ${made.dropped} proposal(s) dropped, their quote is not in the section`,
        'warn',
      )
  } catch (err) {
    const e = toAppError(err)
    if (e.code === 'CANCELLED') throw err
    summary.skipped.push(`${label}: ${e.message}`)
    env.ctx.log(`${label}: ${e.message}`, 'error')
  }
}
