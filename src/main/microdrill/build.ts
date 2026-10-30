// The micro_drill_build stage (#437, FR-3): the annex's chunks go to the draft model as numbered
// passages (P1…); the reply's sources are mapped back to chunks, the build checks run, and the
// drill is saved as a draft. Hints are written here, once, and reviewed before the drill is
// Ready; they are never written at run time.
import {
  MicroDrill,
  MicroDrillSettings,
  type Chunk,
  type MicroDrillBuildOutput,
  type MicroDrillCitation,
} from '@shared/schemas'
import { pipelineDeps, type SearchIndex } from '../generate/deps'
import { escapeText } from '../generate/retrieval'
import { runStage } from '../generate/stage'
import type { JobContext } from '../jobs/manager'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { readAnnex, type Annex, type ChunkSource } from './annex'
import { lintDrill, unescapeText } from './lint'
import { saveMicroDrill } from './store'

export interface BuildRequest {
  documentId: string
  headingPath: string
  settings: MicroDrillSettings
  /** A short exercise situation to reuse as the drill's situation (FR-7). */
  scenarioSituation?: string
}

interface Context {
  documentTitle: string
  byKey: Map<string, Chunk>
}

const keyOf = (n: number): string => `P${n}`

function passagesOf(annex: Annex) {
  return annex.chunks.map((c, i) => ({
    key: keyOf(i + 1),
    page: c.page,
    heading: c.headingPath,
    text: escapeText(c.text),
  }))
}

/** A citation for a passage key; an unknown key gets chunk -1, which the build checks flag. */
function citationFor(ctx: Context, annex: Annex, documentId: string, source: string) {
  const chunk = ctx.byKey.get(source.trim().toUpperCase())
  return {
    documentId,
    documentTitle: ctx.documentTitle,
    headingPath: chunk?.headingPath ?? annex.headingPath,
    ...(chunk?.page !== undefined ? { page: chunk.page } : {}),
    chunkId: chunk?.id ?? -1,
  } satisfies MicroDrillCitation
}

function mapSteps(out: MicroDrillBuildOutput, cite: (source: string) => MicroDrillCitation) {
  return out.steps.map((s, i) => {
    const id = `s${i + 1}`
    return {
      id,
      prompt: s.prompt.trim(),
      expectedPoints: s.expectedPoints.map((p, n) => ({
        id: `${id}p${n + 1}`,
        text: p.text.trim(),
        citation: cite(p.source),
      })),
      hints: [
        { level: 1 as const, text: s.hint1.trim() },
        { level: 2 as const, text: s.hint2.text.trim(), citation: cite(s.hint2.source) },
        {
          level: 3 as const,
          text: s.hint3.text.trim(),
          citation: cite(s.hint3.source),
          quote: unescapeText(s.hint3.quote).trim(),
        },
      ] as const,
      modelAnswer: s.modelAnswer.trim(),
    }
  })
}

/** Turn the model's reply into a draft drill with the build checks applied. */
export function draftFromOutput(
  out: MicroDrillBuildOutput,
  annex: Annex,
  req: BuildRequest,
  documentTitle: string,
): MicroDrill {
  const ctx: Context = {
    documentTitle,
    byKey: new Map(annex.chunks.map((c, i) => [keyOf(i + 1), c])),
  }
  const cite = (source: string) => citationFor(ctx, annex, req.documentId, source)
  const now = nowIso()
  const drill = MicroDrill.parse({
    id: newId(),
    version: 1,
    title: out.title.trim(),
    status: 'draft',
    annex: {
      documentId: req.documentId,
      documentTitle,
      headingPath: annex.headingPath,
      ...(annex.page !== undefined ? { page: annex.page } : {}),
    },
    audience: req.settings.audience,
    durationMin: req.settings.durationMin,
    mode: req.settings.mode,
    focus: req.settings.focus.trim(),
    situation: out.situation.trim(),
    objectives: out.objectives.map((o, i) => ({
      id: `o${i + 1}`,
      text: o.text.trim(),
      ...(o.capability ? { capability: o.capability } : {}),
    })),
    steps: mapSteps(out, cite),
    createdAt: now,
    updatedAt: now,
  })
  return { ...drill, lint: lintDrill(drill, annex.chunks) }
}

/** Build a draft drill from one annex (job 'build-micro-drill'). */
export async function buildMicroDrill(
  root: string,
  input: BuildRequest,
  ctx: JobContext,
): Promise<MicroDrill> {
  const req = { ...input, settings: MicroDrillSettings.parse(input.settings) }
  const deps = await pipelineDeps()
  const [project, found] = await Promise.all([deps.loadProject(root), deps.openIndex(root)])
  const index = found as SearchIndex & ChunkSource
  const doc = project.documents.find((d) => d.id === req.documentId)
  if (!doc) throw new AppError('NOT_FOUND', 'That document is not in the project.')
  const annex = readAnnex(index, req.documentId, req.headingPath)
  ctx.progress(0.1, `Reading ${annex.chunks.length} passages (${annex.tokens} tokens)`)
  const result = await runStage<MicroDrillBuildOutput>({
    stage: 'micro_drill_build',
    projectPath: root,
    vars: {
      project: { orgName: project.orgName || project.name },
      annex: { documentTitle: doc.title, headingPath: annex.headingPath },
      settings: req.settings,
      passages: passagesOf(annex),
      ...(req.scenarioSituation ? { scenarioSituation: escapeText(req.scenarioSituation) } : {}),
    },
    ctx,
    deps,
    index,
  })
  ctx.progress(0.9, 'Checking the drill against the plan')
  const drill = draftFromOutput(result.output, annex, req, doc.title)
  const saved = await saveMicroDrill(root, drill)
  ctx.progress(1, saved.lint.length ? `${saved.lint.length} problem(s) to review` : 'Drill built')
  return saved
}
