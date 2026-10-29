// The debrief of a finished micro-drill (#437, FR-13, FR-22): what was covered, what was missed
// with its plan citation, the model answer, one line on what to review, and the fixed practice
// notice. The same facts feed the screen and the PDF.
import {
  MICRO_DRILL_EVIDENCE_NOTE,
  MICRO_DRILL_NOTICE,
  type MicroDrill,
  type MicroDrillDebrief,
  type MicroDrillRun,
} from '@shared/schemas'
import { escapeHtml } from '../export/escape'
import { coverageOf } from './score'

export const minutesOf = (run: MicroDrillRun): number => {
  if (!run.finishedAt) return 0
  const ms = Date.parse(run.finishedAt) - Date.parse(run.startedAt)
  return Math.max(0, Math.round((ms / 60_000 - run.pausedSec / 60) * 10) / 10)
}

export const hintTotal = (run: MicroDrillRun): number =>
  run.steps.reduce((n, s) => n + s.hintsUsed.length, 0)

function reviewLine(steps: MicroDrillDebrief['steps']): string {
  const places = new Map<string, number | undefined>()
  for (const s of steps)
    for (const p of s.points)
      if (p.status !== 'covered' && !places.has(p.headingPath)) places.set(p.headingPath, p.page)
  if (!places.size) return 'Every point was covered. No section is flagged for review.'
  const list = [...places].map(([h, page]) => (page ? `${h} (page ${page})` : h))
  return `Review: ${list.slice(0, 4).join('; ')}.`
}

export function debriefOf(drill: MicroDrill, run: MicroDrillRun): MicroDrillDebrief {
  const steps = drill.steps.map((step) => {
    const runStep = run.steps.find((s) => s.stepId === step.id)
    const cov = coverageOf(step, runStep?.attempts ?? [])
    return {
      id: step.id,
      prompt: step.prompt,
      hintsUsed: runStep?.hintsUsed ?? [],
      points: step.expectedPoints.map((p) => ({
        text: p.text,
        status: cov.covered.includes(p.id)
          ? ('covered' as const)
          : cov.partial.includes(p.id)
            ? ('partial' as const)
            : ('missed' as const),
        headingPath: p.citation.headingPath,
        ...(p.citation.page !== undefined ? { page: p.citation.page } : {}),
      })),
      modelAnswer: step.modelAnswer,
    }
  })
  return {
    runId: run.id,
    title: drill.title,
    annex: drill.annex,
    notice: MICRO_DRILL_NOTICE,
    evidenceNote: MICRO_DRILL_EVIDENCE_NOTE,
    startedAt: run.startedAt,
    minutes: minutesOf(run),
    plannedMinutes: drill.durationMin,
    participants: run.participants.map((p) => p.name || p.label),
    coverage: run.coverage ?? 0,
    hintsUsed: hintTotal(run),
    assessment: run.assessment,
    steps,
    reviewLine: reviewLine(steps),
  }
}

const STATUS_TEXT = { covered: 'Covered', partial: 'Partly covered', missed: 'Missed' } as const

/** A self-contained HTML page of the debrief for the PDF pipeline. */
export function debriefHtml(d: MicroDrillDebrief): string {
  const steps = d.steps
    .map((s, i) => {
      const rows = s.points
        .map(
          (p) =>
            `<tr><td>${escapeHtml(p.text)}</td><td>${STATUS_TEXT[p.status]}</td><td>${escapeHtml(p.headingPath)}${p.page ? `, page ${p.page}` : ''}</td></tr>`,
        )
        .join('')
      const hints = s.hintsUsed.length
        ? `Hints used: level ${s.hintsUsed.join(', ')}.`
        : 'No hints used.'
      return `<h2>${i + 1}. ${escapeHtml(s.prompt)}</h2><p class="meta">${hints}</p>
<table><thead><tr><th scope="col">Expected point</th><th scope="col">Result</th><th scope="col">Plan section</th></tr></thead><tbody>${rows}</tbody></table>
<p><strong>Model answer.</strong> ${escapeHtml(s.modelAnswer)}</p>`
    })
    .join('\n')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Drill debrief</title><style>
@page { size: letter; margin: 0.6in }
body { font: 10pt/1.4 'Helvetica Neue', Arial, sans-serif; color: #1d1d1b }
h1 { font-size: 16pt; margin: 0 0 2pt } h2 { font-size: 11pt; margin: 12pt 0 2pt }
.meta { color: #555; margin: 0 0 4pt } .notice { border: 1px solid #999; padding: 4pt 6pt }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 6pt }
th, td { border: 1px solid #999; padding: 3pt 5pt; text-align: left; vertical-align: top }
th { background: #e7e4dc }
</style></head><body>
<h1>${escapeHtml(d.title)}</h1>
<p class="meta">${escapeHtml(d.annex.documentTitle)} › ${escapeHtml(d.annex.headingPath)} · ${escapeHtml(d.startedAt.slice(0, 10))} · ${d.minutes} of ${d.plannedMinutes} minutes · ${d.participants.length} participant${d.participants.length === 1 ? '' : 's'}</p>
<p class="notice">${escapeHtml(d.notice)}</p>
<p>Points covered: ${Math.round(d.coverage * 100)}%. Hints used: ${d.hintsUsed}.</p>
${steps}
<p><strong>${escapeHtml(d.reviewLine)}</strong></p>
<p class="meta">${escapeHtml(d.evidenceNote)}</p>
</body></html>`
}
