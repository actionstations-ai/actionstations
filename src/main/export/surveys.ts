// Printable survey forms and the survey results summary (#422), from templates/export/
// survey.html and survey-results.html. A form never prints the knowledge check's correct
// answers or citations; the answer key is printed only in the results PDF (facilitator/).
import {
  isStaffSurvey,
  type Citation,
  type Survey,
  type SurveyQuestion,
  type SurveySummary,
} from '@shared/schemas'
import { pointLabels, questionPrompt, scaleLabels, surveyQuestions } from '@shared/survey-layout'
import { markdownToHtml } from './escape'
import type { ExportModel, ExportSurvey } from './model'
import { embeddedFontsCss, pageCss } from './page'
import { printCss, renderExportTemplate, surveyCss, trusted } from './templates'
import { scenarioHeading } from './views'

const KIND_LABELS: Record<Survey['kind'], string> = {
  participant_feedback: 'Participant Feedback',
  knowledge_check: 'Knowledge Check',
  confidence: 'Confidence Self-Assessment',
  facilitator_debrief: 'Facilitator Debrief',
  evaluator_debrief: 'Controller / Evaluator Debrief',
  custom: 'Survey',
}

const CHANNEL_LABELS: Record<string, string> = {
  paper: 'paper',
  manual: 'typed in',
  live: 'live play',
  qr: 'phone',
}

const citationLabel = (c: Citation): string => `${c.headingPath}${c.page ? ` (p. ${c.page})` : ''}`

const mdHtml = (md: string) => (md.trim() ? trusted(markdownToHtml(md)) : '')

/** Surveys printed by surveys_pdf: the chosen ones, else every one marked ready. */
export function printableSurveys(surveys: ExportSurvey[], surveyIds?: string[]): ExportSurvey[] {
  const live = surveys.filter((s) => s.survey.status !== 'archived')
  if (surveyIds?.length) return live.filter((s) => surveyIds.includes(s.survey.id))
  return live.filter((s) => s.survey.status === 'ready')
}

/** Participant forms may go into players/; debriefs stay with the staff. */
export const isPlayerForm = (survey: Survey): boolean => !isStaffSurvey(survey.kind)

/** Writing lines under a free-text question: more for a long answer. */
const textLines = (q: Extract<SurveyQuestion, { type: 'text' }>): number[] =>
  Array.from({ length: q.long ? 5 : 2 }, (_, i) => i)

function questionView(q: SurveyQuestion, number: number) {
  const base = { number, text: questionPrompt(q), help: q.help, required: q.required, type: q.type }
  switch (q.type) {
    case 'rating':
    case 'confidence': {
      const labels = pointLabels(q)
      const ends = scaleLabels(q)
      const points = [1, 2, 3, 4, 5].map((n) => ({
        n,
        label: labels?.[n - 1] ?? (n === 1 ? ends.low : n === 5 ? ends.high : ''),
      }))
      return { ...base, scale: { low: ends.low, high: ends.high, points } }
    }
    case 'choice':
      return {
        ...base,
        choice: {
          instruction: q.multiple ? 'Mark all that apply.' : 'Mark one.',
          options: q.options.map((o) => o.text),
          other: q.allowOther,
        },
      }
    case 'text':
      return { ...base, lines: textLines(q) }
  }
}

export function surveyFormView(model: ExportModel, survey: Survey, prefix = '') {
  let number = 0
  return {
    prefix,
    title: {
      id: `${prefix}survey-title`,
      eyebrow: KIND_LABELS[survey.kind],
      heading: survey.title,
      sub: scenarioHeading(model),
      facts: [{ label: 'Date', value: '____________' }],
    },
    introHtml: mdHtml(survey.introMd),
    roleGroups: survey.askRoleGroup ? survey.roleGroups : [],
    sections: survey.sections.map((s) => ({
      title: s.title,
      introHtml: mdHtml(s.introMd),
      questions: s.questions.map((q) => questionView(q, ++number)),
    })),
  }
}

const pct = (count: number, total: number): number =>
  total ? Math.round((count / total) * 100) : 0
const fmt = (n: number | undefined, digits = 2): string =>
  n === undefined ? '—' : n.toFixed(digits).replace(/\.?0+$/, '')
const share = (n: number | undefined): string => (n === undefined ? '—' : `${Math.round(n * 100)}%`)

function countsText(summary: SurveySummary): string {
  const parts = Object.entries(summary.byChannel).map(
    ([channel, n]) => `${n} ${CHANNEL_LABELS[channel] ?? channel}`,
  )
  const total = `${summary.responses} ${summary.responses === 1 ? 'response' : 'responses'}`
  return parts.length ? `${total} (${parts.join(', ')})` : total
}

function resultQuestionView(q: SurveySummary['questions'][number], number: number) {
  const scale =
    q.distribution && q.mean !== undefined
      ? {
          mean: fmt(q.mean),
          median: fmt(q.median, 1),
          bars: q.distribution.map((count, i) => ({
            point: i + 1,
            count,
            pct: pct(count, q.n),
          })),
        }
      : undefined
  return {
    number,
    text: q.text,
    n: q.n,
    hidden: q.suppressed,
    ...(scale ? { scale } : {}),
    choices: (q.choices ?? []).map((c) => ({ ...c, pct: pct(c.count, q.n) })),
    ...(q.shareCorrect !== undefined ? { shareCorrect: share(q.shareCorrect) } : {}),
    texts: [...(q.texts ?? []), ...(q.otherTexts ?? []).map((t) => `Other: ${t}`)],
  }
}

/** Correct answers of a knowledge check, for the facilitator's copy only. */
function answerKey(survey: Survey) {
  return surveyQuestions(survey).flatMap(({ question: q }) => {
    if (q.type !== 'choice' || !q.correctOptionId) return []
    const answer = q.options.find((o) => o.id === q.correctOptionId)?.text ?? ''
    return [{ question: q.text, answer, reference: q.citation ? citationLabel(q.citation) : '' }]
  })
}

export function surveyResultsView(model: ExportModel, items: ExportSurvey[], prefix = '') {
  const minResponses = items[0]?.summary.minResponses ?? 3
  return {
    prefix,
    minResponses,
    title: {
      id: `${prefix}results-title`,
      eyebrow: 'Survey Results',
      heading: scenarioHeading(model),
      sub: model.scenario.subtitle ?? '',
      facts: [],
    },
    surveys: items.map(({ survey, summary }) => ({
      title: survey.title,
      counts: countsText(summary),
      suppressed: summary.suppressed,
      questions: summary.questions.map((q, i) => resultQuestionView(q, i + 1)),
      pairs: summary.pairs.map((p) => ({
        statement: p.statement,
        before: fmt(p.before),
        after: fmt(p.after),
        delta: p.delta === undefined ? '—' : `${p.delta > 0 ? '+' : ''}${fmt(p.delta)}`,
      })),
      knowledge: summary.knowledge.map((k) => ({
        text: k.text,
        before: share(k.shareBefore),
        after: share(k.shareAfter),
        reference: k.citation ? citationLabel(k.citation) : '',
      })),
      answerKey: answerKey(survey),
    })),
  }
}

function footerText(model: ExportModel): string {
  return [model.project.orgName || model.project.name, `v${model.scenario.version}`]
    .filter(Boolean)
    .join(' · ')
}

function wrap(model: ExportModel, label: string, body: string): string {
  return renderExportTemplate('layout', {
    title: `${label} — ${model.scenario.title}`,
    fontsCss: trusted(embeddedFontsCss()),
    printCss: trusted(`${printCss()}\n${surveyCss()}`),
    pageCss: trusted(pageCss({ title: scenarioHeading(model), footer: footerText(model) }, label)),
    formCss: trusted(''),
    body: trusted(body),
  })
}

/** The complete HTML of one printable survey form. */
export function buildSurveyFormHtml(model: ExportModel, survey: Survey): string {
  return wrap(model, survey.title, renderExportTemplate('survey', surveyFormView(model, survey)))
}

/** The complete HTML of the results summary for the surveys that have responses. */
export function buildSurveyResultsHtml(model: ExportModel, items: ExportSurvey[]): string {
  return wrap(
    model,
    'Survey Results',
    renderExportTemplate('survey-results', surveyResultsView(model, items)),
  )
}
