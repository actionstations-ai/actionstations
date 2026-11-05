// The education documents of a case study session (spec 0452 FR-13, FR-16): the prebrief, the
// facilitation guide with cue cards and the debrief guide written from the case; the learner
// report, the facilitator summary and the program record written from runs and records. Each
// function returns the fields of a template; nothing here calls a model. The structure follows
// the four cornerstones of the INACSL standards, which are cited and not copied.
import {
  CASE_STUDY_PRIVACY_NOTE,
  CASE_STUDY_SCORE_NOTE,
  CJMM_LABELS,
  CJMM_STEPS,
  CORNERSTONES,
  CORNERSTONE_LABELS,
  EDUCATION_HOURS_NOTE,
  type CaseStudy,
  type CaseStudyPrompt,
  type CaseStudyRun,
  type EducationRecord,
} from '@shared/schemas'
import {
  latestAnswers,
  overallPercent,
  stepProfile,
  strongestAndWeakest,
  visitedPrompts,
} from '../evaluate/casestudy'

type Fields = Record<string, unknown>

const MARKING = 'EXERCISE · SIMULATED PATIENT · NOT FOR CLINICAL USE'

const optionText = (p: CaseStudyPrompt, id: string): string =>
  p.type === 'rationale' ? id : (p.options.find((o) => o.id === id)?.text ?? id)

const responseText = (p: CaseStudyPrompt, r: unknown): string =>
  typeof r === 'string'
    ? r
    : Array.isArray(r)
      ? r.map((id) => optionText(p, String(id))).join('; ')
      : ''

// ---- written from the case --------------------------------------------------------------------

export function prebriefFields(c: CaseStudy): Fields {
  return {
    marking: MARKING,
    title: c.title,
    objectives: c.objectives,
    scenarioSummary: `${c.patient.summary} The case unfolds in ${c.stages.length} stages. At each stage you see new information and answer questions about what you notice, what it means, what to do and whether it worked.`,
    groundRules: [
      'What is said in the simulation stays in the simulation: we do not repeat learners’ answers or mistakes outside the session.',
      'This is a safe place to be wrong. We are here to learn how we think, not to be graded on one answer.',
      'The patient is simulated. Treat the case as real so the practice is useful, and say when something does not feel realistic.',
      'You may step out at any time, and you may choose not to do a case with a content notice.',
      'Questions are welcome at any point.',
    ],
    orientation: [
      'How the case unfolds: stages, new data, questions at each stage.',
      'The tools you will see: monitor trends, flowsheets, the early warning score chart, laboratory trends and handoff forms.',
      'The roles in the room: who answers, who records, who speaks for the group.',
      'How the debrief works: after the case we talk through what happened, what you were thinking and what you would do again.',
    ],
    ...(c.contentNotice ? { contentNotice: c.contentNotice } : {}),
    scoreNote: CASE_STUDY_SCORE_NOTE,
    privacyNote: CASE_STUDY_PRIVACY_NOTE,
  }
}

export function facilitationFields(c: CaseStudy): Fields {
  return {
    marking: 'EXERCISE · FACILITATOR GUIDE',
    title: c.title,
    roleNote:
      'Stay out of the way until the group has answered. Ask what they noticed before telling them. Use the cue cards when the group is stuck or moves too fast; give the cue in the patient’s voice, not as a hint about the answer.',
    cueCards: c.stages.map((s) => ({
      stage: `${s.title}${s.time ? ` (${s.time})` : ''}`,
      watchFor: s.prompts.map((p) => `${CJMM_LABELS[p.step]}: ${p.text}`),
      cue: s.data.statements[0]
        ? `${s.data.statements[0].speaker}: “${s.data.statements[0].text}”`
        : 'Repeat the narrative of the stage and point to the monitor or table.',
      ifStuck: s.prompts.some((p) => p.step === 'recognize_cues')
        ? 'Ask: what has changed since the last stage? Which numbers moved?'
        : 'Ask: what do you think is happening, and what makes you think so?',
      moveOn: 'Move on when every question is answered and the rationale has been read.',
    })),
  }
}

export function debriefFields(c: CaseStudy, facilitator = 'Clinical instructor'): Fields {
  const step = (name: string, minutes: number, questions: string[]) => ({
    name,
    minutes,
    questions,
  })
  return {
    marking: 'EXERCISE · FACILITATOR GUIDE',
    title: c.title,
    facilitator,
    duration: '30 minutes',
    objectives: c.objectives,
    phases: [
      step('Reactions', 5, [
        'How are you feeling about what just happened?',
        'What stood out to you first?',
      ]),
      step('Description', 5, [
        'Tell me what happened, in order.',
        'What did you notice about the vital signs and when?',
      ]),
      step('Analysis', 12, [
        'What led you to the actions you chose, and when?',
        'Where in the six steps (recognize, analyze, prioritize, generate solutions, act, evaluate) was it hardest?',
        'What would have made the handoff stronger?',
        'What other explanations did you consider?',
      ]),
      step('Application', 5, ['What will you do differently on your unit?']),
      step('Summary', 3, ['What are the three points to take away?']),
    ],
    checkIn: 'Before we leave, how is everyone doing? Anyone who wants to talk privately can stay.',
    ...(c.contentNotice ? { contentNotice: c.contentNotice } : {}),
  }
}

export function feedbackFields(c: CaseStudy): Fields {
  return {
    marking: 'EXERCISE · LEARNER FEEDBACK',
    title: c.title,
    scale: '1 = strongly disagree, 5 = strongly agree',
    items: [
      'The prebrief prepared me for the case.',
      'The case felt realistic enough to practice my judgment.',
      'I felt safe to make decisions and mistakes.',
      'The debrief helped me understand what I did and why.',
      'I learned something I can use on the unit.',
    ],
    openQuestions: [
      'What is one thing you will do differently?',
      'What would make this case better?',
    ],
    privacy: CASE_STUDY_PRIVACY_NOTE,
  }
}

// ---- written from runs and records ------------------------------------------------------------

export function learnerReportFields(c: CaseStudy, run: CaseStudyRun): Fields {
  const profile = stepProfile(run.answers)
  const { strong, weak } = strongestAndWeakest(profile)
  const latest = latestAnswers(run.answers)
  const prompts = visitedPrompts(c, run.path)
  const rows = prompts.flatMap((p) => {
    const a = latest.find((x) => x.promptId === p.id)
    return a
      ? [
          {
            step: CJMM_LABELS[p.step],
            question: p.text,
            answer: responseText(p, a.response) || '(no answer)',
            percent: Math.round(a.score * 100),
            rationale: p.rationale,
          },
        ]
      : []
  })
  return {
    marking: MARKING,
    title: c.title,
    learner: run.learner ?? 'Anonymous',
    date: run.startedAt.slice(0, 10),
    mode: run.mode === 'group' ? 'Group' : 'Individual',
    overall: overallPercent(run.answers),
    steps: profile.map((p) => ({
      label: p.label,
      percent: p.percent === null ? 'n/a' : `${p.percent}%`,
      prompts: p.prompts,
    })),
    strong: strong ? `${strong.label} (${strong.percent}%)` : '',
    weak: weak ? `${weak.label} (${weak.percent}%)` : '',
    decisions: rows,
    scoreNote: CASE_STUDY_SCORE_NOTE,
  }
}

export function facilitatorSummaryFields(c: CaseStudy, runs: CaseStudyRun[]): Fields {
  const counted = runs.filter((r) => r.finishedAt && !r.preview)
  const all = counted.flatMap((r) => r.answers)
  const profile = CJMM_STEPS.map((step) => {
    const mine = counted.flatMap((r) => latestAnswers(r.answers).filter((a) => a.step === step))
    return {
      label: CJMM_LABELS[step],
      answers: mine.length,
      percent: mine.length
        ? `${Math.round((mine.reduce((s, a) => s + a.score, 0) / mine.length) * 100)}%`
        : 'n/a',
    }
  })
  const byPrompt = new Map<string, { text: string; step: string; total: number; n: number }>()
  for (const r of counted)
    for (const a of latestAnswers(r.answers)) {
      const p = c.stages.flatMap((s) => s.prompts).find((x) => x.id === a.promptId)
      if (!p) continue
      const e = byPrompt.get(p.id) ?? { text: p.text, step: CJMM_LABELS[p.step], total: 0, n: 0 }
      e.total += a.score
      e.n += 1
      byPrompt.set(p.id, e)
    }
  const hardest = [...byPrompt.values()]
    .map((e) => ({
      step: e.step,
      question: e.text,
      percent: Math.round((e.total / e.n) * 100),
      answers: e.n,
    }))
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 5)
  return {
    marking: 'EXERCISE · FACILITATOR SUMMARY',
    title: c.title,
    runs: counted.length,
    groups: counted.filter((r) => r.mode === 'group').length,
    overall: all.length ? overallPercent(counted.flatMap((r) => latestAnswers(r.answers))) : null,
    steps: profile,
    hardest,
    learners: counted.map((r, i) => ({
      label: r.learner ?? `Anonymous ${i + 1}`,
      mode: r.mode === 'group' ? 'Group' : 'Individual',
      percent: overallPercent(r.answers) ?? 0,
    })),
    scoreNote: CASE_STUDY_SCORE_NOTE,
    privacyNote:
      'Individual results are visible to the instructor. Learners are told this before they start.',
  }
}

export function programRecordFields(records: EducationRecord[], program: string): Fields {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
  const totalHours = Math.round(sorted.reduce((s, r) => s + r.hours, 0) * 100) / 100
  const mark = (r: EducationRecord, c: (typeof CORNERSTONES)[number]): string => {
    const x = r.cornerstones[c]
    return x.done
      ? `Done${x.by ? `, ${x.by}` : ''}${x.at ? ` ${x.at.slice(0, 10)}` : ''}`
      : 'Not recorded'
  }
  return {
    marking: 'PROGRAM RECORD',
    program,
    sessions: sorted.map((r) => ({
      date: r.date,
      title: r.title,
      hours: r.hours,
      facilitator: r.facilitator || 'Not recorded',
      participants: r.participants,
      prebrief: mark(r, 'prebrief'),
      facilitation: mark(r, 'facilitation'),
      integrity: mark(r, 'professional_integrity'),
      debrief: mark(r, 'debrief'),
      checkIn: r.debriefCheckIn ? 'Yes' : 'No',
    })),
    totalHours,
    hoursNote: EDUCATION_HOURS_NOTE,
  }
}

/** The cornerstones a record still lacks, for a reminder before the program record is used. */
export function missingCornerstones(r: EducationRecord): string[] {
  return CORNERSTONES.filter((c) => !r.cornerstones[c].done).map((c) => CORNERSTONE_LABELS[c])
}
