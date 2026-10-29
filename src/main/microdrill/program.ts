// Micro-drill results for the program (#437, FR-20): each finished run becomes a summary in the
// project snapshot the linked program keeps (ProjectSnapshot.drills). The summary holds the
// plan section, capabilities, counts, minutes, coverage and hint use. It never holds answer text
// or names. The snapshot is rebuilt from the project folder, so nothing else is written here.
import { MicroDrillSummary, type MicroDrill, type MicroDrillRun } from '@shared/schemas'
import { refreshProgramOfProject } from '../program/snapshot'
import { hintTotal, minutesOf } from './debrief'
import { getMicroDrill, listMicroRuns } from './store'

export function summaryOf(
  drill: MicroDrill,
  run: MicroDrillRun,
  documentSha256?: string,
): MicroDrillSummary {
  const capabilities = [...new Set(drill.objectives.flatMap((o) => o.capability ?? []))]
  return MicroDrillSummary.parse({
    drillId: drill.id,
    runId: run.id,
    at: run.finishedAt ?? run.startedAt,
    planSection: {
      documentId: drill.annex.documentId,
      documentTitle: drill.annex.documentTitle,
      headingPath: drill.annex.headingPath,
      ...(drill.annex.page !== undefined ? { page: drill.annex.page } : {}),
      ...(documentSha256 ? { documentSha256 } : {}),
    },
    coreCapabilities: capabilities,
    participants: run.participants.length,
    minutes: minutesOf(run),
    coverage: run.coverage ?? 0,
    hintsUsed: hintTotal(run),
  })
}

/** Summaries of every finished run, oldest first, for the project snapshot. */
export async function microDrillSummaries(
  root: string,
  shaOf: Map<string, string>,
): Promise<MicroDrillSummary[]> {
  const out: MicroDrillSummary[] = []
  for (const run of (await listMicroRuns(root)).filter((r) => r.finishedAt)) {
    try {
      const drill = await getMicroDrill(root, run.drillId)
      out.push(summaryOf(drill, run, shaOf.get(drill.annex.documentId)))
    } catch {
      // A run whose drill was deleted has nothing to report.
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at))
}

/** After a run finishes: refresh the snapshot of the program this project is linked to. */
export const reportToProgram = (root: string): Promise<void> => refreshProgramOfProject(root)
