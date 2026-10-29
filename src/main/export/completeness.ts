// Completeness report for the HSEEP document set (#420): which documents have their content,
// which exercise details are blank (they print fill-in lines), and what has not been generated
// yet. Deterministic: read from the export model only. Shown on the Export page before export
// and written as export-report.md into the export folder.
import type { CompletenessReport } from '@shared/ipc'
import type { ExportModel } from './model'

/** Exercise details that print a fill-in line when blank, with the label the report uses. */
export function missingDetails(model: ExportModel): string[] {
  const c = model.conduct
  const checks: [string, boolean][] = [
    ['Exercise dates', !c.dates.some((d) => d.trim())],
    ['Start and end time', !c.startTime || !c.endTime],
    ['Sponsor organization', !c.sponsor.trim()],
    ['Participating organizations', !c.participatingOrganizations.some((o) => o.trim())],
    ['Point of contact', !c.director.name?.trim()],
    ['Site', !c.site.trim()],
    ['Communications plan', !c.communications.length],
    ['Safety notes', !c.safetyNotes.trim()],
    ['Security notes', !c.securityNotes.trim()],
  ]
  return checks.filter(([, missing]) => missing).map(([label]) => label)
}

function sitmanMissing(model: ExportModel): string[] {
  const s = model.scenario
  const modules = s.sitman?.modules ?? []
  if (!modules.length) return ['SitMan modules not generated yet (phase goals print as narrative)']
  const without = s.phases.filter((p) => !modules.some((m) => m.phaseId === p.id))
  const noQuestions = modules.filter((m) => !m.discussionQuestions.length)
  return [
    ...(without.length ? [`${without.length} module(s) not written`] : []),
    ...(noQuestions.length ? [`${noQuestions.length} module(s) without discussion questions`] : []),
  ]
}

const NO_EEGS = 'Exercise Evaluation Guides not prepared yet'

export function completenessReport(model: ExportModel): CompletenessReport {
  const details = missingDetails(model)
  const s = model.scenario
  const docs: CompletenessReport['documents'] = [
    {
      doc: 'explan',
      label: 'Exercise Plan (ExPlan)',
      missing: details.length ? ['Exercise details incomplete'] : [],
    },
    { doc: 'sitman', label: 'Situation Manual', missing: sitmanMissing(model) },
    {
      doc: 'handbook_hseep',
      label: 'Controller and Evaluator Handbook',
      missing: [...(model.docs.handbook.trim() ? [] : ['Controller handbook not generated yet'])],
    },
    {
      doc: 'msel_xlsx',
      label: 'MSEL workbook',
      missing: s.msel.length ? [] : ['No MSEL rows yet'],
    },
    {
      doc: 'eeg',
      label: 'Exercise Evaluation Guides',
      missing: model.evaluation?.eegs.length ? [] : [NO_EEGS],
    },
    {
      doc: 'aar',
      label: 'After-Action Report',
      missing: ['Written after the exercise'],
    },
  ].map((d) => ({ ...d, ready: !d.missing.length }))
  return { documents: docs, detailsMissing: details }
}

/** The report as Markdown for export-report.md. */
export function completenessMarkdown(report: CompletenessReport, title: string): string {
  const lines = [`# Export report: ${title}`, '', '## HSEEP documents', '']
  for (const d of report.documents) {
    lines.push(
      `- ${d.ready ? '[x]' : '[ ]'} ${d.label}${d.missing.length ? `: ${d.missing.join('; ')}` : ''}`,
    )
  }
  lines.push('', '## Exercise details', '')
  if (!report.detailsMissing.length) lines.push('All exercise details are filled in.')
  else {
    lines.push('These print as fill-in lines. Add them under Scenario › Exercise details:', '')
    lines.push(...report.detailsMissing.map((d) => `- ${d}`))
  }
  return lines.join('\n') + '\n'
}
