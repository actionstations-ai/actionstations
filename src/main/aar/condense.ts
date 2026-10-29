// The record as the prompt sees it (#419, NFR-4): one text block with every item's evidence ref
// in brackets, notes cut to 300 characters, observations grouped per critical task and messages
// reduced to counts per role plus the ones the controller pinned (open question 4). `tight` is
// the second attempt for a model whose context the full block overflows: shorter cuts, fewer
// items, counts only for the surveys.
import { capabilityName } from '@shared/core-capabilities'
import {
  CAPABILITY_RATING_LABELS,
  HOTWASH_ITEM_KIND_LABELS,
  type ExerciseRecord,
  type RecordObservation,
} from '@shared/schemas/aar'
import { RATING_LABELS, RATINGS, type CriticalTask } from '@shared/schemas/evaluation'
import type { Scenario } from '@shared/schemas/scenario'
import type { SurveySummary } from '@shared/schemas/survey'

export type CondenseLevel = 'full' | 'tight'

const LIMITS: Record<
  CondenseLevel,
  { text: number; items: number; pinned: number; texts: number }
> = {
  full: { text: 300, items: 120, pinned: 10, texts: 3 },
  tight: { text: 150, items: 40, pinned: 5, texts: 0 },
}

/** Tags that delimit data blocks in the prompts must not appear inside the record. */
const DATA_TAG = /<(?=\s*\/?\s*(?:documents?|scenario_state|record)\b)/gi

export const cut = (s: string, n: number): string => {
  const clean = s.replace(/\s+/g, ' ').trim().replace(DATA_TAG, '‹')
  return clean.length > n ? `${clean.slice(0, n - 1).trimEnd()}…` : clean
}

const take = <T>(list: readonly T[], n: number): T[] => list.slice(0, n)

function rowLabel(scenario: Scenario, rowId: string | undefined): string {
  if (!rowId) return ''
  const row = scenario.msel.find((r) => r.id === rowId)
  return row ? `${rowId} (${row.time})` : rowId
}

function objectiveLabel(scenario: Scenario, id: string | undefined): string {
  if (!id) return ''
  const o = scenario.objectives.find((x) => x.id === id)
  return o ? o.name || o.text : id
}

function sourcesLine(record: ExerciseRecord): string {
  const names: string[] = []
  if (record.sources.facilitator) names.push('facilitator notes, hot wash items and decisions')
  if (record.sources.evaluation) names.push('evaluator observations')
  if (record.sources.live) names.push('live-play session log')
  if (record.sources.surveys) names.push('participant feedback surveys')
  if (record.sources.tracker) names.push('unanswered-inject and commitment tracker')
  if (record.sources.clocks) names.push('regulatory clock results')
  if (record.sources.transcripts) names.push('marked hot wash quotes')
  return `Sources available: ${names.join('; ') || 'none'}.`
}

function notesBlock(record: ExerciseRecord, scenario: Scenario, L: (typeof LIMITS)['full']) {
  if (!record.notes.length) return ['Facilitator notes: none recorded.']
  return [
    'Facilitator notes:',
    ...take(record.notes, L.items).map((n) =>
      n.rowId
        ? `- [${n.ref}] on ${rowLabel(scenario, n.rowId)}: ${cut(n.text, L.text)}`
        : `- [${n.ref}] general: ${cut(n.text, L.text)}`,
    ),
  ]
}

function hotwashBlock(record: ExerciseRecord, scenario: Scenario, L: (typeof LIMITS)['full']) {
  if (!record.hotwash.length) return ['Hot wash items: none recorded.']
  return [
    'Hot wash items (3-Up / 3-Down):',
    ...take(record.hotwash, L.items).map((h) => {
      const tags = [
        h.objectiveRef ? `objective ${objectiveLabel(scenario, h.objectiveRef)}` : '',
        h.rowId ? `inject ${h.rowId}` : '',
        h.plusOnes ? `+${h.plusOnes}` : '',
        h.promoted ? 'promoted' : '',
      ].filter(Boolean)
      return `- [${h.ref}] ${HOTWASH_ITEM_KIND_LABELS[h.kind]}${tags.length ? ` (${tags.join('; ')})` : ''}: ${cut(h.text, L.text)}`
    }),
  ]
}

function decisionsBlock(record: ExerciseRecord, scenario: Scenario, L: (typeof LIMITS)['full']) {
  if (!record.decisions.length) return ['Decision log: none recorded.']
  return [
    'Decision log:',
    ...take(record.decisions, L.items).map((d) => {
      const when = [d.exerciseTime, d.rowId ? rowLabel(scenario, d.rowId) : '']
        .filter(Boolean)
        .join(' ')
      return `- [${d.ref}]${when ? ` ${when}` : ''}${d.byRole ? ` by ${d.byRole}` : ''}: ${cut(d.text, L.text)}`
    }),
  ]
}

function tasksById(scenario: Scenario): Map<string, CriticalTask> {
  return new Map(
    (scenario.evaluation?.eegs ?? []).flatMap((e) =>
      e.criticalTasks.map((t) => [t.id, t] as const),
    ),
  )
}

const counts = (list: RecordObservation[]): string =>
  RATINGS.filter((r) => list.some((o) => o.rating === r))
    .map((r) => `${RATING_LABELS[r].toLowerCase()} ${list.filter((o) => o.rating === r).length}`)
    .join(', ')

function observationLine(o: RecordObservation, scenario: Scenario, L: (typeof LIMITS)['full']) {
  const where = o.rowId ? ` ${rowLabel(scenario, o.rowId)}` : ''
  const note = o.note.trim() ? `: ${cut(o.note, L.text)}` : ''
  return `  - [${o.ref}]${where} ${RATING_LABELS[o.rating].toLowerCase()}${note}`
}

function observationsBlock(
  record: ExerciseRecord,
  scenario: Scenario,
  level: CondenseLevel,
  L: (typeof LIMITS)['full'],
) {
  if (!record.observations.length) return ['Evaluator observations: none recorded.']
  const tasks = tasksById(scenario)
  const lines = ['Evaluator observations (per critical task):']
  const byTask = new Map<string, RecordObservation[]>()
  const loose: RecordObservation[] = []
  for (const o of record.observations) {
    const task = o.taskId ? tasks.get(o.taskId) : undefined
    if (task) byTask.set(task.id, [...(byTask.get(task.id) ?? []), o])
    else loose.push(o)
  }
  for (const [taskId, list] of byTask) {
    const task = tasks.get(taskId)!
    lines.push(
      `- ${taskId} (${capabilityName(task.capability)}) "${cut(task.task, 120)}": ${counts(list)}`,
    )
    const shown = level === 'tight' ? list.filter((o) => o.rating !== 'met' && o.note.trim()) : list
    for (const o of take(shown, L.items)) lines.push(observationLine(o, scenario, L))
  }
  if (loose.length) {
    lines.push(`- Expected-action ratings on rows no task covers: ${counts(loose)}`)
    for (const o of take(loose, level === 'tight' ? 10 : L.items))
      lines.push(observationLine(o, scenario, L))
  }
  return lines
}

function votesBlock(record: ExerciseRecord, scenario: Scenario, L: (typeof LIMITS)['full']) {
  if (!record.votes.length) return []
  return [
    'Votes:',
    ...take(record.votes, L.items).map((v) => {
      const tally = v.options.map((o) => `${o.label} ${o.count}`).join(', ')
      const turnout =
        v.voted !== undefined ? ` (${v.voted}${v.eligible ? ` of ${v.eligible}` : ''} voted)` : ''
      return `- [${v.ref}]${v.rowId ? ` ${rowLabel(scenario, v.rowId)}` : ''} "${cut(v.question, L.text)}": ${tally}${turnout}`
    }),
  ]
}

function messagesBlock(record: ExerciseRecord, scenario: Scenario, L: (typeof LIMITS)['full']) {
  if (!record.messages.length) return []
  const perRole = record.messageCounts.map((c) => `${c.role} ${c.count}`).join(', ')
  const pinned = take(
    record.messages.filter((m) => m.pinned),
    L.pinned,
  )
  return [
    `Messages between players and the SimCell: ${record.messages.length} in all (${perRole}).${pinned.length ? ' Pinned by the controller:' : ''}`,
    ...pinned.map(
      (m) =>
        `- [${m.ref}]${m.exerciseTime ? ` ${m.exerciseTime}` : ''} ${m.fromRole}${m.toRole ? ` → ${m.toRole}` : ''}${m.rowId ? ` (re ${rowLabel(scenario, m.rowId)})` : ''}: ${cut(m.text, L.text)}`,
    ),
  ]
}

function questionLine(
  s: SurveySummary,
  q: SurveySummary['questions'][number],
  L: (typeof LIMITS)['full'],
) {
  const ref = `survey:${s.surveyId}:${q.questionId}`
  if (q.suppressed)
    return `  - [${ref}] "${cut(q.text, 120)}": ${q.n} answer(s), below the anonymity threshold`
  const parts: string[] = []
  if (q.mean !== undefined) parts.push(`mean ${q.mean} of 5 (n ${q.n})`)
  if (q.choices?.length) parts.push(q.choices.map((c) => `${c.text} ${c.count}`).join(', '))
  if (q.shareCorrect !== undefined) parts.push(`${Math.round(q.shareCorrect * 100)}% correct`)
  const texts = take(q.texts ?? [], L.texts).map((t) => `"${cut(t, L.text)}"`)
  if (texts.length) parts.push(`comments: ${texts.join('; ')}`)
  return `  - [${ref}] "${cut(q.text, 120)}": ${parts.join('; ') || `${q.n} answer(s)`}`
}

function surveysBlock(record: ExerciseRecord, L: (typeof LIMITS)['full']) {
  if (!record.surveys.length) return ['Participant feedback: no survey responses recorded.']
  const lines = ['Participant feedback (aggregates only; the threshold hides small groups):']
  for (const s of take(record.surveys, 20)) {
    lines.push(
      `- [survey:${s.surveyId}] ${s.title} (${s.kind.replace(/_/g, ' ')}): ${s.responses} response(s)`,
    )
    if (s.suppressed) continue
    for (const q of take(s.questions, L.items)) lines.push(questionLine(s, q, L))
    for (const p of s.pairs)
      if (p.before !== undefined || p.after !== undefined)
        lines.push(
          `  - confidence "${cut(p.statement, 120)}": before ${p.before ?? '—'}, after ${p.after ?? '—'}${p.delta !== undefined ? ` (${p.delta > 0 ? '+' : ''}${p.delta})` : ''}`,
        )
  }
  return lines
}

function linesBlock(
  title: string,
  list: ExerciseRecord['tracker'],
  L: (typeof LIMITS)['full'],
): string[] {
  if (!list?.length) return []
  return [
    '',
    title,
    ...take(list, L.items).map(
      (l) => `- [${l.ref}]${l.meta ? ` (${cut(l.meta, 80)})` : ''} ${cut(l.text, L.text)}`,
    ),
  ]
}

/** The record block for the prompt. Every item shows its ref in brackets. */
export function recordBlock(
  record: ExerciseRecord,
  scenario: Scenario,
  level: CondenseLevel,
): string {
  const L = LIMITS[level]
  const delivered = record.delivered.length
    ? `Injects delivered (${record.delivered.length}): ${take(record.delivered, 60)
        .map((d) => `${d.rowId} at ${d.exerciseTime}`)
        .join(', ')}${record.delivered.length > 60 ? ', …' : ''}.`
    : 'Injects delivered: not recorded.'
  return [
    sourcesLine(record),
    delivered,
    '',
    ...notesBlock(record, scenario, L),
    '',
    ...hotwashBlock(record, scenario, L),
    '',
    ...decisionsBlock(record, scenario, L),
    '',
    ...observationsBlock(record, scenario, level, L),
    ...votesBlock(record, scenario, L).flatMap((l, i) => (i === 0 ? ['', l] : [l])),
    ...messagesBlock(record, scenario, L).flatMap((l, i) => (i === 0 ? ['', l] : [l])),
    '',
    ...surveysBlock(record, L),
    ...linesBlock('Tracker (answers, unanswered injects, commitments):', record.tracker, L),
    ...linesBlock('Regulatory clocks:', record.clocks, L),
    ...linesBlock(
      'Hot wash quotes (recorded and transcribed on this computer):',
      record.transcripts,
      L,
    ),
  ].join('\n')
}

/** Counts for the job log and the prompt's one-line summary. */
export function recordCounts(record: ExerciseRecord) {
  return {
    delivered: record.delivered.length,
    notes: record.notes.length,
    hotwash: record.hotwash.length,
    decisions: record.decisions.length,
    observations: record.observations.length,
    votes: record.votes.length,
    messages: record.messages.length,
    surveys: record.surveys.length,
  }
}

/** The HSEEP rating scale as the prompt explains it. */
export const ratingsGuide = (): string =>
  (Object.keys(CAPABILITY_RATING_LABELS) as (keyof typeof CAPABILITY_RATING_LABELS)[])
    .map((r) => `${r} = ${CAPABILITY_RATING_LABELS[r]}`)
    .join('; ')
