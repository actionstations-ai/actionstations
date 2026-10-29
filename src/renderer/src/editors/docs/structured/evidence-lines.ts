// Evidence refs of an AAR/IP finding resolved against the exercise record (#419): pure, so the
// drawer and its tests share one reading. Role labels only; the record carries no names.
import {
  HOTWASH_ITEM_KIND_LABELS,
  type EvidenceRef,
  type ExerciseRecord,
} from '@shared/schemas/aar'
import { RATING_LABELS } from '@shared/schemas/evaluation'

export interface EvidenceLine {
  ref: EvidenceRef
  kind: string
  /** Where it came from: row id, time, role. */
  meta: string
  text: string
}

function surveyLine(record: ExerciseRecord, ref: EvidenceRef): EvidenceLine | undefined {
  const [, surveyId, questionId] = ref.split(':')
  const survey = record.surveys.find((s) => s.surveyId === surveyId)
  if (!survey) return undefined
  if (!questionId)
    return {
      ref,
      kind: 'Survey',
      meta: `${survey.responses} responses`,
      text: survey.title,
    }
  const q = survey.questions.find((x) => x.questionId === questionId)
  if (!q) return undefined
  const detail = q.suppressed
    ? `${q.n} answers (too few to show detail)`
    : q.mean !== undefined
      ? `mean ${q.mean} of ${q.n}`
      : q.choices
        ? q.choices.map((c) => `${c.text}: ${c.count}`).join(', ')
        : `${q.n} answers`
  return { ref, kind: 'Survey question', meta: `${survey.title} · ${detail}`, text: q.text }
}

/** One ref → one readable line; undefined when the record no longer holds it. */
export function resolveEvidence(
  record: ExerciseRecord,
  ref: EvidenceRef,
): EvidenceLine | undefined {
  const kind = ref.split(':')[0]
  switch (kind) {
    case 'note': {
      const n = record.notes.find((x) => x.ref === ref)
      return n && { ref, kind: 'Note', meta: n.rowId ?? 'General notes', text: n.text }
    }
    case 'obs': {
      const o = record.observations.find((x) => x.ref === ref)
      return (
        o && {
          ref,
          kind: 'Observation',
          meta: [o.rowId, o.taskId, o.exerciseTime, o.evaluator].filter(Boolean).join(' · '),
          text: `${RATING_LABELS[o.rating]}${o.note ? ` — ${o.note}` : ''}`,
        }
      )
    }
    case 'hw': {
      const h = record.hotwash.find((x) => x.ref === ref)
      return (
        h && {
          ref,
          kind: `Hot wash: ${HOTWASH_ITEM_KIND_LABELS[h.kind]}`,
          meta: [h.rowId, h.plusOnes ? `+${h.plusOnes}` : ''].filter(Boolean).join(' · '),
          text: h.text,
        }
      )
    }
    case 'dec': {
      const d = record.decisions.find((x) => x.ref === ref)
      return (
        d && {
          ref,
          kind: 'Decision',
          meta: [d.exerciseTime, d.rowId, d.byRole].filter(Boolean).join(' · '),
          text: d.text,
        }
      )
    }
    case 'vote': {
      const v = record.votes.find((x) => x.ref === ref)
      return (
        v && {
          ref,
          kind: 'Vote',
          meta: [v.exerciseTime, v.rowId].filter(Boolean).join(' · '),
          text: `${v.question} — ${v.options.map((o) => `${o.label}: ${o.count}`).join(', ')}`,
        }
      )
    }
    case 'msg': {
      const m = record.messages.find((x) => x.ref === ref)
      return (
        m && {
          ref,
          kind: m.pinned ? 'Message (pinned)' : 'Message',
          meta: [m.exerciseTime, `${m.fromRole}${m.toRole ? ` → ${m.toRole}` : ''}`]
            .filter(Boolean)
            .join(' · '),
          text: m.text,
        }
      )
    }
    case 'survey':
      return surveyLine(record, ref)
    default:
      return undefined
  }
}
