// Pure edits for the survey builder: new questions and sections, moves, option changes.
import type {
  ChoiceOption,
  Survey,
  SurveyKind,
  SurveyQuestion,
  SurveyQuestionType,
  SurveySection,
} from '@shared/schemas/survey'

/** A path-safe id for a new section, question or option. */
export function localId(prefix: string): string {
  const random = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)
  return `${prefix}${random}`
}

export function newQuestion(type: SurveyQuestionType, survey: Survey): SurveyQuestion {
  const id = localId('q')
  const base = { id, help: '', required: false }
  switch (type) {
    case 'rating':
      return {
        ...base,
        type,
        text: 'New statement',
        min: 1,
        max: 5,
        lowLabel: 'Strongly disagree',
        highLabel: 'Strongly agree',
      }
    case 'choice':
      return {
        ...base,
        type,
        text: 'New question',
        multiple: false,
        allowOther: false,
        options: [
          { id: localId('o'), text: 'Option 1' },
          { id: localId('o'), text: 'Option 2' },
        ],
      }
    case 'text':
      return { ...base, type, text: 'New question', long: true, maxLength: 2000 }
    case 'confidence':
      return {
        ...base,
        type,
        text: 'New statement',
        statement: 'I could …',
        pairKey: id,
        edition: survey.edition ?? 'before',
      }
  }
}

export function newSection(): SurveySection {
  return { id: localId('s'), title: '', introMd: '', questions: [] }
}

/** Move the item at `index` by `delta` places; out-of-range moves change nothing. */
export function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const to = index + delta
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return [...items]
  const out = [...items]
  const [item] = out.splice(index, 1)
  out.splice(to, 0, item!)
  return out
}

export function updateSection(
  survey: Survey,
  sectionId: string,
  fn: (s: SurveySection) => SurveySection,
): Survey {
  return { ...survey, sections: survey.sections.map((s) => (s.id === sectionId ? fn(s) : s)) }
}

export function updateQuestion(
  survey: Survey,
  questionId: string,
  fn: (q: SurveyQuestion) => SurveyQuestion,
): Survey {
  return {
    ...survey,
    sections: survey.sections.map((s) => ({
      ...s,
      questions: s.questions.map((q) => (q.id === questionId ? fn(q) : q)),
    })),
  }
}

export function removeQuestion(survey: Survey, questionId: string): Survey {
  return {
    ...survey,
    sections: survey.sections.map((s) => ({
      ...s,
      questions: s.questions.filter((q) => q.id !== questionId),
    })),
  }
}

type Choice = Extract<SurveyQuestion, { type: 'choice' }>

export function addOption(q: Choice): Choice {
  return {
    ...q,
    options: [...q.options, { id: localId('o'), text: `Option ${q.options.length + 1}` }],
  }
}

/** Remove an option; the correct answer is cleared when it was that option. */
export function removeOption(q: Choice, optionId: string): Choice {
  const options: ChoiceOption[] = q.options.filter((o) => o.id !== optionId)
  const { correctOptionId, ...rest } = q
  return correctOptionId && correctOptionId !== optionId
    ? { ...rest, options, correctOptionId }
    : { ...rest, options }
}

export const KIND_LABELS: Record<SurveyKind, string> = {
  participant_feedback: 'Participant feedback',
  knowledge_check: 'Knowledge check',
  confidence: 'Confidence self-assessment',
  facilitator_debrief: 'Facilitator debrief',
  evaluator_debrief: 'Controller / evaluator debrief',
  custom: 'Custom survey',
}

export const TIMING_LABELS: Record<Survey['timing'], string> = {
  pre: 'Before the exercise',
  during: 'During the exercise',
  post: 'After the exercise',
  any: 'Any time',
}

export const STATUS_LABELS: Record<Survey['status'], string> = {
  draft: 'Draft',
  ready: 'Ready',
  archived: 'Archived',
}
