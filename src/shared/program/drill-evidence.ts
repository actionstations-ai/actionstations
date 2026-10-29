// Micro-drill runs offered as evidence when verifying a corrective action (spec 0437 FR-20).
// A run counts when it practised a section of the same plan document that the action cites: the
// same heading, or one inside the other. The program keeps totals only (no answers, no names), so
// that is all the evidence says.
import type { MicroDrillSummary } from '../schemas/micro-drill'
import type { PlanSectionRef, ProjectSnapshot } from '../schemas/program'

const SEPARATOR = '›'
const norm = (s: string): string =>
  s
    .split(SEPARATOR)
    .map((p) => p.trim().toLowerCase())
    .join(` ${SEPARATOR} `)

/** True when one heading path is the other, or sits under it. */
export function sectionsOverlap(a: string, b: string): boolean {
  const x = norm(a)
  const y = norm(b)
  return x === y || x.startsWith(`${y} ${SEPARATOR} `) || y.startsWith(`${x} ${SEPARATOR} `)
}

export interface DrillEvidence {
  projectId: string
  projectName: string
  run: MicroDrillSummary
}

/** Runs that practised a section the action cites, newest first. */
export function drillEvidenceFor(
  planSections: readonly Pick<PlanSectionRef, 'documentId' | 'headingPath'>[],
  snapshots: readonly Pick<ProjectSnapshot, 'projectId' | 'name' | 'drills'>[],
): DrillEvidence[] {
  const out: DrillEvidence[] = []
  for (const snap of snapshots)
    for (const run of snap.drills ?? [])
      if (
        planSections.some(
          (p) =>
            p.documentId === run.planSection.documentId &&
            sectionsOverlap(p.headingPath, run.planSection.headingPath),
        )
      )
        out.push({ projectId: snap.projectId, projectName: snap.name, run })
  return out.sort((a, b) => b.run.at.localeCompare(a.run.at))
}

/** The result a run suggests: the share of expected points covered. The person can change it. */
export const suggestedResult = (coverage: number): 'pass' | 'partial' | 'fail' =>
  coverage >= 0.8 ? 'pass' : coverage >= 0.5 ? 'partial' : 'fail'

/** The note that names the run, so the record says where the evidence came from. */
export function evidenceNote(e: DrillEvidence): string {
  const r = e.run
  const when = r.at.slice(0, 10)
  const share = Math.round(r.coverage * 100)
  return `Micro-drill run ${r.runId} on ${when} (${e.projectName}): ${share}% of expected points covered, ${r.participants} participant(s), ${r.hintsUsed} hint(s) used. Section: ${r.planSection.headingPath}.`
}
