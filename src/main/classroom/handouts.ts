// Printable classroom documents (#722, #724, #727): the rubric handout, the per-student score
// report and the reflection sheets. These builders only make HTML (escaped, no scripts, a CSP
// that allows nothing but inline styles and embedded fonts); printing is in pdf.ts. Pages are
// tagged by the export window, tables have captions and header cells, and nothing is colour-only.
import type { ScoringView } from '@shared/ipc/classroom-scoring'
import { pointsOf } from '@shared/classroom/scoring'
import type { ClassroomCourseFile, ClassroomRubric, Evidence } from '@shared/schemas'
import { escapeHtml as h } from '../export/escape'

const STYLE = `
body { font-family: var(--sans, 'Inter', Arial, sans-serif); font-size: 10pt; color: #16181b; }
h1 { font-size: 17pt; margin: 0 0 4pt; } h2 { font-size: 12pt; margin: 14pt 0 4pt; break-after: avoid; }
h3 { font-size: 10.5pt; margin: 10pt 0 2pt; break-after: avoid; }
table { border-collapse: collapse; width: 100%; margin: 4pt 0 8pt; }
th, td { border: 1px solid #45494f; padding: 3pt 5pt; text-align: left; vertical-align: top; }
th { background: #eceff3; } caption { text-align: left; font-weight: 600; padding: 2pt 0; }
.muted { color: #45494f; } .sheet { break-after: page; } .sheet:last-child { break-after: auto; }
.line { border-bottom: 1px solid #16181b; height: 22pt; } .quote { margin: 0 0 2pt 0; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 2pt 10pt; } dt { font-weight: 600; } dd { margin: 0; }
@page { size: letter; margin: 0.75in; }
.landscape { page: wide; } @page wide { size: letter landscape; margin: 0.6in; }
`

function document(title: string, body: string, css: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:">
<title>${h(title)}</title><style>${css}\n${STYLE}</style></head><body>${body}</body></html>`
}

/** The rubric as a handout: one table per criterion, a row per level, with points and weight. */
export function rubricHandoutHtml(rubric: ClassroomRubric, css = ''): string {
  const tables = rubric.criteria
    .map((c) => {
      const rows = c.levels
        .map(
          (l) =>
            `<tr><th scope="row">${h(l.label)}</th><td>${l.points}</td><td>${h(l.descriptor)}</td></tr>`,
        )
        .join('')
      return `<h2>${h(c.name)} <span class="muted">(weight ${c.weight})</span></h2>
${c.description ? `<p>${h(c.description)}</p>` : ''}
<table><caption>Levels of ${h(c.name)}</caption><thead><tr><th scope="col">Level</th><th scope="col">Points</th><th scope="col">What it looks like</th></tr></thead><tbody>${rows}</tbody></table>`
    })
    .join('\n')
  const body = `<main class="landscape"><h1>${h(rubric.name)}</h1>
<p class="muted">Rubric for ${h(rubric.role === 'team' ? 'the whole team' : rubric.role)}.${rubric.source ? ` ${h(rubric.source)}.` : ''} Points are multiplied by each criterion's weight in the total.</p>
${tables}</main>`
  return document(`Rubric: ${rubric.name}`, body, css)
}

export interface ReportInput {
  course: ClassroomCourseFile
  view: ScoringView
  studentId: string
  scenarioTitle: string
  evidence: Evidence[]
}

function quote(e: Evidence): string {
  const when = e.exerciseTime ? `${h(e.exerciseTime)} ` : ''
  const count = e.kind === 'hotwash' && e.count > 1 ? ` (${e.count} contributions)` : ''
  return `<p class="quote">${when}${h(e.note || e.kind)}${count}</p>`
}

function rubricSection(input: ReportInput, rubric: ClassroomRubric): string {
  const student = input.view.students.find((s) => s.studentId === input.studentId)!
  const rows = rubric.criteria
    .map((c) => {
      const cell = student.cells.find((x) => x.rubricId === rubric.id && x.criterionId === c.id)
      const level = cell?.level == null ? undefined : c.levels[cell.level]
      const points = pointsOf(c, cell?.level ?? undefined)
      const ev = cell?.evidence ?? []
      return `<tr><th scope="row">${h(c.name)}</th>
<td>${level ? `${h(level.label)}${cell?.fromTeam ? ' (team score)' : ''}` : 'Not scored'}</td>
<td>${points === undefined ? '' : `${points} x ${c.weight}`}</td>
<td>${ev.length ? ev.map(quote).join('') : '<span class="muted">No evidence recorded</span>'}${cell?.comment ? `<p><strong>Instructor comment:</strong> ${h(cell.comment)}</p>` : ''}</td></tr>`
    })
    .join('')
  const total = student.totals.find((t) => t.rubricId === rubric.id)
  return `<h2>${h(rubric.name)}</h2>
<table><caption>Scores and the evidence they rest on</caption><thead><tr><th scope="col">Criterion</th><th scope="col">Level</th><th scope="col">Points x weight</th><th scope="col">Evidence</th></tr></thead><tbody>${rows}</tbody></table>
<p><strong>Total:</strong> ${total ? `${total.points} of ${total.maxPoints} points${total.complete ? '' : ' (some criteria are not scored yet)'}` : 'not scored'}</p>`
}

/** One student's report for one session, with the evidence quoted. Practice runs say so. */
export function studentReportHtml(input: ReportInput, css = ''): string {
  const { course, view, studentId } = input
  const student = course.students.find((s) => s.id === studentId)!
  const rubrics = course.rubrics.filter((r) => view.rubricIds.includes(r.id))
  const row = view.students.find((s) => s.studentId === studentId)
  const outcomes = (row?.outcomes ?? []).filter((o) => o.fraction !== null)
  const reflections = input.evidence.filter(
    (e) => e.kind === 'reflection' && e.studentId === studentId,
  )
  const body = `<main><h1>Score report: ${h(student.name)}</h1>
<dl><dt>Course</dt><dd>${h(course.course?.name ?? '')}${course.course?.term ? `, ${h(course.course.term)}` : ''}</dd>
<dt>Exercise</dt><dd>${h(input.scenarioTitle)}</dd>
${student.institutionId ? `<dt>Student id</dt><dd>${h(student.institutionId)}</dd>` : ''}</dl>
${view.practice ? '<p><strong>Practice run. This report is for your own use and does not count toward a grade.</strong></p>' : ''}
<p class="muted">Scores are your instructor's judgment, based on the evidence shown. Suggestions in the app are never final.</p>
${rubrics.map((r) => rubricSection(input, r)).join('\n')}
${
  outcomes.length
    ? `<h2>Course outcomes</h2><table><caption>Outcome scores from this exercise</caption><thead><tr><th scope="col">Outcome</th><th scope="col">Score</th></tr></thead><tbody>${outcomes
        .map((o) => {
          const code = course.outcomes.find((x) => x.id === o.outcomeId)
          return `<tr><th scope="row">${h(code?.code ?? o.outcomeId)} ${h(code?.text ?? '')}</th><td>${Math.round((o.fraction ?? 0) * 100)}%</td></tr>`
        })
        .join('')}</tbody></table>`
    : ''
}
${reflections.length ? `<h2>Your reflections</h2>${reflections.map((e) => `<p class="quote">${h(e.note).replace(/\n/g, '<br>')}</p>`).join('')}` : ''}
</main>`
  return document(`Score report: ${student.name}`, body, css)
}

/** One page per student with the prompts and writing lines, to collect reflections on paper. */
export function reflectionSheetsHtml(
  prompts: readonly string[],
  names: readonly string[],
  scenarioTitle: string,
  css = '',
): string {
  const sheets = names
    .map(
      (
        name,
      ) => `<section class="sheet" aria-label="Reflection sheet: ${h(name)}"><h1>Reflection</h1>
<dl><dt>Name</dt><dd>${h(name)}</dd><dt>Exercise</dt><dd>${h(scenarioTitle)}</dd></dl>
<p class="muted">Your answers go to your instructor with your name.</p>
${prompts.map((p, i) => `<h3>${i + 1}. ${h(p)}</h3><div class="line"></div><div class="line"></div><div class="line"></div><div class="line"></div>`).join('')}
</section>`,
    )
    .join('\n')
  return document(`Reflection sheets: ${scenarioTitle}`, `<main>${sheets}</main>`, css)
}
