// "Build drill scenario" (#431, FR-9): the drill's rows copied into a new draft scenario with
// their own ids, a STARTEX card that says where things stand, a TIME_JUMP card wherever the
// source skipped more than 20 minutes, and an ENDEX card. Citations follow the plan that
// replaced the one the exercise used. The source scenario is not touched.
import {
  exerciseMinutes,
  type Chunk,
  Inject,
  type Drill,
  type DrillStartexOutput,
  type MselRow,
  type Scenario,
} from '@shared/schemas'
import { pipelineDeps, type PipelineDeps, type SearchIndex } from '../generate/deps'
import { isControlRow } from '../generate/eeg-criteria'
import { controlCardFields } from '../generate/injects/control-fallback'
import { runStage } from '../generate/stage'
import type { JobContext } from '../jobs/manager'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { copyScenarioSubset } from '../scenario/manage'
import { getScenario, saveInject, updateScenario } from '../scenario/store'
import { reresolveCitations, supersessionMap } from './citations'
import { getDrill, saveDrill } from './store'

/** Gaps in the source timeline longer than this get a time jump card (minutes). */
export const TIME_JUMP_GAP_MIN = 20
/** Rows before the first selected one that the situation summary is written from. */
const LEAD_ROWS = 8
const MAX_SITUATION = 1200

type Chunked = SearchIndex & {
  chunks(documentId: string, limit?: number, offset?: number): Chunk[]
}

/** The selected rows in source order, without control cards (those are rebuilt). */
export function selectedRows(source: Scenario, rowIds: readonly string[]): MselRow[] {
  const wanted = new Set(rowIds)
  return source.msel.filter((r) => wanted.has(r.id) && !isControlRow(r))
}

/** What the facilitator reads at the start when no model writes it: the last events before. */
export function fallbackSituation(before: readonly MselRow[], first: MselRow): string {
  const lead = before.slice(-3).map((r) => r.event.trim())
  const state = lead.length ? lead.join(' ') : 'Normal operations.'
  return `${state} The next event: ${first.event.trim()}`.slice(0, MAX_SITUATION)
}

async function situation(
  root: string,
  source: Scenario,
  first: MselRow,
  deps: PipelineDeps,
  index: Chunked,
  ctx: JobContext,
): Promise<string> {
  const firstAt = source.msel.findIndex((r) => r.id === first.id)
  const before = source.msel.slice(0, firstAt).filter((r) => !isControlRow(r))
  try {
    const project = await deps.loadProject(root)
    const r = await runStage<DrillStartexOutput>({
      stage: 'drill_startex',
      projectPath: root,
      vars: {
        project: { orgName: project.orgName || project.name },
        scenario: { title: source.title },
        firstRow: { time: first.time, event: first.event },
        before: before.slice(-LEAD_ROWS).map((r) => ({ time: r.time, event: r.event })),
      },
      ctx,
      deps,
      index,
    })
    return r.output.situationMd.trim().slice(0, MAX_SITUATION)
  } catch (err) {
    if ((err as { code?: string }).code === 'CANCELLED') throw err
    ctx.log('The opening situation could not be written; using the earlier events.', 'warn')
    return fallbackSituation(before, first)
  }
}

const base = (
  id: string,
  row: Pick<MselRow, 'time' | 'phaseId'>,
  extra: Partial<MselRow>,
): MselRow =>
  ({
    id,
    phaseId: row.phaseId,
    time: row.time,
    from: 'Facilitator',
    toRoleIds: [],
    toLabel: 'All',
    citations: [],
    locked: false,
    expectedAction: '',
    event: '',
    purposeTag: 'STARTEX',
    ...extra,
  }) as MselRow

/** START, the rows with TIME_JUMP cards where the source skipped time, and END. Pure. */
export function withControlCards(rows: MselRow[], situationText: string): MselRow[] {
  const out: MselRow[] = [
    base('START', rows[0]!, {
      event: `STARTEX (Start Exercise). ${situationText}`,
      expectedAction: 'Read the situation to the players and confirm the drill rules.',
      purposeTag: 'STARTEX',
      format: 'startex_card',
    }),
  ]
  let jumps = 0
  rows.forEach((row, i) => {
    const gap = i ? exerciseMinutes(row.time) - exerciseMinutes(rows[i - 1]!.time) : 0
    if (gap > TIME_JUMP_GAP_MIN) {
      jumps += 1
      out.push(
        base(`TJ-${jumps}`, row, {
          event: `TIME JUMP: It is now ${row.wallClock ?? row.time}. About ${gap} minutes have passed.`,
          expectedAction: 'Read the time jump to the players.',
          purposeTag: 'TIME_JUMP',
          format: 'time_jump_card',
        }),
      )
    }
    out.push(row)
  })
  const last = rows.at(-1)!
  out.push(
    base('END', last, {
      event: 'ENDEX (End Exercise). The drill is complete.',
      expectedAction: 'Move to the hot wash.',
      purposeTag: 'ENDEX',
      format: 'endex_card',
    }),
  )
  return out
}

function applyCitations(
  s: Scenario,
  index: Chunked,
  supersedes: ReturnType<typeof supersessionMap>,
) {
  const chunksOf = (id: string) => index.chunks(id, 5000, 0)
  const warnings = [...s.warnings]
  for (const row of s.msel) {
    const r = reresolveCitations(row.citations, supersedes, chunksOf, row.id)
    row.citations = r.citations
    warnings.push(...r.warnings)
  }
  for (const eeg of s.evaluation.eegs)
    for (const task of eeg.criticalTasks) {
      const r = reresolveCitations([task.citation], supersedes, chunksOf)
      task.citation = r.citations[0] ?? task.citation
      warnings.push(...r.warnings)
    }
  s.warnings = warnings
}

async function saveControlInjects(root: string, scenario: Scenario): Promise<void> {
  const types: Record<string, string> = {
    STARTEX: 'startex_card',
    TIME_JUMP: 'time_jump_card',
    ENDEX: 'endex_card',
  }
  for (const row of scenario.msel.filter(isControlRow)) {
    const type = types[row.purposeTag]!
    const fields = controlCardFields(type, row, scenario.title)
    if (!fields) continue
    const inject = Inject.parse({
      id: newId(),
      mselRowId: row.id,
      type,
      title: row.purposeTag === 'TIME_JUMP' ? 'Time jump' : row.purposeTag,
      deliveryMode: 'read_aloud',
      fields,
    })
    await saveInject(root, scenario.id, inject, {
      by: 'user',
      note: 'Drill control card',
      snapshot: false,
    })
  }
}

/** Build (or rebuild) the drill's scenario; the drill record points at it afterwards. */
export async function buildDrillScenario(
  root: string,
  drillId: string,
  ctx: JobContext,
): Promise<{ drill: Drill; scenario: Scenario }> {
  const drill = await getDrill(root, drillId)
  const deps = await pipelineDeps()
  const [source, project, index] = await Promise.all([
    getScenario(root, drill.sourceScenarioId),
    deps.loadProject(root),
    deps.openIndex(root),
  ])
  const rows = selectedRows(source, drill.rowIds)
  if (!rows.length) throw new AppError('VALIDATION', 'The drill has no injects from the scenario')
  ctx.progress(0.1, 'Copying the injects')
  const copy = await copyScenarioSubset(
    root,
    source.id,
    rows.map((r) => r.id),
    {
      title: drill.title,
      drillOf: { drillId: drill.id, sourceScenarioId: source.id },
    },
  )
  ctx.progress(0.4, 'Writing the opening situation')
  const text = await situation(root, source, rows[0]!, deps, index as Chunked, ctx)
  const supersedes = supersessionMap(project.documents)
  const scenario = await updateScenario(
    root,
    copy.id,
    (s) => {
      s.msel = withControlCards(
        s.msel.filter((r) => !isControlRow(r)),
        text,
      )
      applyCitations(s, index as Chunked, supersedes)
      s.updatedAt = nowIso()
    },
    { by: 'user', note: 'Built regression drill', snapshot: false },
  )
  await saveControlInjects(root, scenario)
  const saved = await saveDrill(root, { ...drill, drillScenarioId: scenario.id })
  ctx.progress(1, 'Drill scenario ready')
  return { drill: saved, scenario }
}
