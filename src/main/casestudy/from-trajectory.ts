// A draft case study from a named trajectory (spec 0452 FR-9): six stages that follow the arc of
// the dossier (presentation, first assessment, change in condition, action, outcome, handoff),
// with the data of the trajectory in figures and the prompts, keys and rationales of the
// clinical content table. The two outcome stages come from running the same patient with the
// good response (escalate, then treat) and the poor one (delay), so the learner's score decides
// which story continues. Deterministic given the seed. The result is a draft: it needs the
// author's review before a learner sees it (store.ts, review.ts).
import type { CaseStudy, CaseStudyPrompt, CaseStudyStage } from '@shared/schemas'
import { computeEws, NEUTRAL_EWS } from '../../shared/clinical/ews'
import { nowIso } from '../lib/ids'
import { generatePatient, type SyntheticPatient } from '../toolkits/clinical/patient'
import {
  DEFINITIONS,
  ewsReadingAt,
  generateTrajectory,
  stepAt,
  toMonitorData,
  type Trajectory,
  type TrajectoryKind,
  type VitalKey,
} from '../toolkits/clinical/trajectory'
import { CONTENT, type Scored } from './content'

export interface DraftParams {
  id: string
  kind: TrajectoryKind
  seed: number
  /** Start of the story as a wall-clock label ("07:40"); stages show it plus elapsed minutes. */
  startLabel?: string
  /** Set for stories involving death, violence or harm to children. */
  contentNotice?: string
}

const VITAL_LABEL: Record<VitalKey, [string, string]> = {
  heart_rate: ['Heart rate', '/min'],
  systolic_bp: ['Systolic blood pressure', 'mmHg'],
  diastolic_bp: ['Diastolic blood pressure', 'mmHg'],
  respiratory_rate: ['Respiratory rate', '/min'],
  oxygen_saturation: ['Oxygen saturation', '%'],
  temperature: ['Temperature', 'C'],
}

/** Deterministic shuffle so the best option is not always first. */
function arrange<T>(items: T[], seed: number): T[] {
  const out = [...items]
  let s = seed >>> 0 || 1
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

function optionsOf(prefix: string, texts: string[]) {
  return texts.map((text, i) => ({ id: `${prefix}${i + 1}`, text }))
}

function selectCues(
  id: string,
  text: string,
  relevant: string[],
  other: string[],
  rationale: string,
  seed: number,
  step: 'recognize_cues' = 'recognize_cues',
): CaseStudyPrompt {
  const texts = arrange([...relevant, ...other], seed)
  const options = optionsOf('c', texts)
  const keyIds = options.filter((o) => relevant.includes(o.text)).map((o) => o.id)
  return { id, type: 'select_cues', step, text, options, key: { relevant: keyIds }, rationale }
}

function actions(
  id: string,
  step: 'generate_solutions' | 'take_action',
  text: string,
  list: Scored[],
  rationale: string,
  seed: number,
  branch?: CaseStudyPrompt['branch'],
): CaseStudyPrompt {
  const arranged = arrange(list, seed)
  const options = optionsOf(
    'a',
    arranged.map((a) => a.text),
  )
  const credit = Object.fromEntries(options.map((o, i) => [o.id, arranged[i]!.credit]))
  return {
    id,
    type: 'choose_actions',
    step,
    text,
    options,
    key: { credit },
    rationale,
    ...(branch ? { branch } : {}),
  }
}

function vitalCue(t: Trajectory, key: VitalKey, atMin: number): string {
  const first = t.steps[0]!.vitals[key]
  const now = stepAt(t, atMin).vitals[key]
  const [label, unit] = VITAL_LABEL[key]
  const dir = now > first ? 'up' : now < first ? 'down' : 'unchanged'
  return dir === 'unchanged'
    ? `${label} ${now} ${unit}, unchanged`
    : `${label} ${now} ${unit}, ${dir} from ${first} ${unit} at the start`
}

function patientSummary(p: SyntheticPatient): string {
  return `${p.name}, ${p.age}-year-old ${p.sex === 'F' ? 'woman' : 'man'}. ${p.admission}. History: ${p.history.join(', ')}. Allergies: ${p.allergies.join(', ')}.`
}

const clock = (start: string | undefined, minute: number): string => {
  if (!start) return `Minute ${minute}`
  const [h, m] = start.split(':').map(Number)
  const total = (h ?? 0) * 60 + (m ?? 0) + minute
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** The draft case study for a trajectory. */
export function draftFromTrajectory(p: DraftParams): CaseStudy {
  const def = DEFINITIONS[p.kind]
  const content = CONTENT[p.kind]
  const patient = generatePatient(p.seed, def.profile)
  const [bp1, bp2] = def.branchPoints
  const base = generateTrajectory({
    kind: p.kind,
    seed: p.seed,
    durationMin: bp2!.atMin + 120,
    stepMin: 10,
  })
  const good = generateTrajectory({
    kind: p.kind,
    seed: p.seed,
    durationMin: bp2!.atMin + 120,
    stepMin: 10,
    actions: [
      { atMin: bp2!.atMin, action: 'escalate' },
      { atMin: bp2!.atMin, action: 'treat' },
    ],
  })
  const poor = generateTrajectory({
    kind: p.kind,
    seed: p.seed,
    durationMin: bp2!.atMin + 120,
    stepMin: 10,
    actions: [{ atMin: bp2!.atMin, action: 'delay' }],
  })
  const t1 = bp1!.atMin
  const t2 = bp2!.atMin
  const tEnd = t2 + 60
  const when = (m: number) => clock(p.startLabel, m)
  const lab = (t: Trajectory, key: 'lactate' | 'hemoglobin' | 'glucose' | 'troponin') => ({
    values: t.labs
      .map((l) => ({ x: l.minute / 60, y: l.labs[key] }))
      .filter((v): v is { x: number; y: number } => v.y !== undefined),
  })
  const labKey = (['lactate', 'hemoglobin', 'glucose', 'troponin'] as const).find(
    (k) => base.labs[0]!.labs[k] !== undefined,
  )
  const labFigure = (t: Trajectory): Record<string, { kind: string; data: unknown }> => {
    if (!labKey) return {}
    const ranges = {
      lactate: { low: 0.5, high: 2, criticalHigh: 4, unit: 'mmol/L' },
      hemoglobin: { low: 12, high: 16, unit: 'g/dL', criticalLow: 7 },
      glucose: { low: 70, high: 140, criticalLow: 54, unit: 'mg/dL' },
      troponin: { high: 0.04, unit: 'ng/mL' },
    } as const
    return {
      labs: {
        kind: 'lab_trend',
        data: {
          test: labKey[0]!.toUpperCase() + labKey.slice(1),
          xLabel: 'Hours',
          points: lab(t, labKey).values,
          ...ranges[labKey],
        },
      },
    }
  }
  const ews = (t: Trajectory, m: number) => ({
    kind: 'early_warning_score',
    data: { title: 'Early warning score', time: when(m), reading: ewsReadingAt(t, m) },
  })
  const monitor = (t: Trajectory, to: number) => ({
    kind: 'vitals_monitor',
    data: toMonitorData(t, 0, to, patient.name),
  })
  const total = (t: Trajectory, m: number) => computeEws(NEUTRAL_EWS, ewsReadingAt(t, m)).total
  const seed = p.seed

  const s1: CaseStudyStage = {
    id: 's1',
    title: 'Presentation',
    time: when(0),
    narrative: `You take over care of ${patient.name} at the start of your shift. Vital signs are normal for ${patient.name.split(' ')[0]}. Read the handoff and decide what matters for this patient's risk.`,
    data: {
      figures: {},
      tables: [
        {
          caption: 'Handoff summary (simulated patient)',
          columns: ['Item', 'Detail'],
          rows: [
            ['Patient', `${patient.name}, ${patient.age} ${patient.sex}`],
            ['Admission', patient.admission],
            ['History', patient.history.join('; ')],
            [
              'Medications',
              patient.medications.map((m) => `${m.drug} ${m.dose} ${m.route}`).join('; '),
            ],
            ['Allergies', patient.allergies.join('; ')],
          ],
        },
      ],
      statements: [
        { speaker: 'Outgoing nurse', text: 'Stable overnight. Just keep an eye on them today.' },
      ],
    },
    prompts: [
      selectCues(
        'p1',
        'Which facts in the handoff raise this patient’s risk of becoming unwell? Select all that apply.',
        content.riskFacts.relevant,
        content.riskFacts.other,
        'The facts that raise risk are the ones tied to the reason for admission, the history and the treatments in progress. The rest are useful for comfort and rapport but do not change the risk.',
        seed,
      ),
    ],
    next: 's2',
  }
  const s2: CaseStudyStage = {
    id: 's2',
    title: 'First assessment',
    time: when(t1),
    narrative: `${t1} minutes later you reassess. The monitor trend is below. Some values have moved; others have not.`,
    data: {
      figures: { monitor: monitor(base, t1) },
      tables: [],
      statements: [{ speaker: patient.name.split(' ')[0]!, text: 'I just feel a bit off today.' }],
    },
    prompts: [
      selectCues(
        'p2',
        'Which observations are relevant cues that something is changing? Select all that apply.',
        content.cueVitals.map((k) => vitalCue(base, k, t1)),
        content.distractors,
        'A cue is relevant when it changes with the story. Trends across several vital signs matter more than any single value, and unchanged values or comfort remarks are not cues of change.',
        seed + 1,
      ),
      {
        id: 'p3',
        type: 'rationale',
        step: 'analyze_cues',
        text: 'In a sentence or two, what do these trends tell you about the patient?',
        key: { points: content.rationalePoints },
        rationale: `A strong answer names the pattern across the vital signs, ties it to this patient’s risk and says the trend matters. In this case: ${content.lesson}.`,
      },
    ],
    next: 's3',
  }
  const s3: CaseStudyStage = {
    id: 's3',
    title: 'Change in condition',
    time: when(t2),
    narrative: `At ${when(t2)} the patient is clearly worse. The monitor, the early warning score and the latest laboratory trend are below.`,
    data: {
      figures: { monitor: monitor(base, t2), score: ews(base, t2), ...labFigure(base) },
      tables: [],
      statements: [
        { speaker: patient.name.split(' ')[0]!, text: 'Something is wrong. I don’t feel right.' },
      ],
    },
    prompts: [
      {
        id: 'p4',
        type: 'rank_hypotheses',
        step: 'prioritize_hypotheses',
        text: 'Rank these explanations from most likely to least likely for this patient now.',
        ...(() => {
          const arranged = arrange(content.hypotheses, seed + 2)
          const options = optionsOf('h', arranged)
          const order = content.hypotheses.map((h) => options.find((o) => o.text === h)!.id)
          return { options, key: { order } }
        })(),
        rationale: `The leading explanation is the one that fits the history, the timing and the pattern of the data best: ${content.hypotheses[0]!.toLowerCase()}. The others stay on the list to be ruled out but do not drive what you do first.`,
      },
      actions(
        'p5',
        'generate_solutions',
        'Which actions would you consider? Select all that apply.',
        content.consider,
        'Good options gather the information that separates the explanations and bring in the people who can act. Options that delay, mask the problem or give the wrong treatment lose credit.',
        seed + 3,
      ),
    ],
    next: 's4',
  }
  const s4: CaseStudyStage = {
    id: 's4',
    title: 'Action and escalation',
    time: when(t2),
    narrative: `The early warning score is ${total(base, t2)}. You decide what to do right now. Your choice decides what happens next.`,
    data: { figures: { score: ews(base, t2) }, tables: [], statements: [] },
    prompts: [
      actions(
        'p6',
        'take_action',
        'What do you do now? Select all that apply.',
        content.now,
        'The safest first move is to bring help while staying with the patient and giving a structured report. Waiting, or treating the wrong problem, lets the course continue.',
        seed + 4,
        { threshold: 0.7, passTo: 's5_good', failTo: 's5_poor' },
      ),
    ],
    next: 's5_good',
  }
  const outcomeOptions = (good: boolean) => {
    const opts = [
      { text: 'The patient is improving and the plan is working', credit: good ? 1 : 0 },
      { text: 'The patient is getting worse and the plan needs to change', credit: good ? 0 : 1 },
      { text: 'The patient is unchanged and no further action is needed', credit: 0 },
    ]
    return arrange(opts, seed + (good ? 5 : 6))
  }
  const outcome = (good: boolean, t: Trajectory): CaseStudyStage => {
    const opts = outcomeOptions(good)
    const options = optionsOf(
      'o',
      opts.map((o) => o.text),
    )
    const credit = Object.fromEntries(options.map((o, i) => [o.id, opts[i]!.credit]))
    return {
      id: good ? 's5_good' : 's5_poor',
      title: good ? 'Reassessment: the response is working' : 'Reassessment: the patient is worse',
      time: when(tEnd),
      narrative: good
        ? `You escalated and treatment began. An hour later you reassess.`
        : `The response was slow or incomplete. An hour later you reassess.`,
      data: {
        figures: { monitor: monitor(t, tEnd), score: ews(t, tEnd) },
        tables: [],
        statements: [],
      },
      prompts: [
        {
          id: good ? 'p7g' : 'p7p',
          type: 'evaluate_outcome',
          step: 'evaluate_outcomes',
          text: 'Compare what you see now with what you expected. What is your evaluation?',
          options,
          key: { credit },
          rationale: `Compare the new values with the earlier ones: the early warning score is now ${total(t, tEnd)} (it was ${total(base, t2)}). ${good ? 'A falling score and steadier vital signs mean the plan is working; keep reassessing.' : 'A rising score and worsening vital signs mean the plan is not enough; escalate again.'}`,
        },
      ],
      next: 's6',
    }
  }
  const handoffTexts: Scored[] = [
    { text: 'Situation: who the patient is and what changed', credit: 1 },
    { text: 'Background: reason for admission, history, medications and allergies', credit: 1 },
    {
      text: 'Assessment: the vital signs, the early warning score and what you think is happening',
      credit: 1,
    },
    { text: 'Recommendation: what you need and by when', credit: 1 },
    { text: 'The patient’s favorite television channel', credit: -0.2 },
    { text: 'A promise that everything will be fine', credit: -0.5 },
  ]
  const s6: CaseStudyStage = {
    id: 's6',
    title: 'Handoff and debrief',
    time: when(tEnd + 30),
    narrative:
      'The receiving team arrives to take over care. You give a handoff by phone and at the bedside, and the receiving nurse reads it back.',
    data: {
      figures: {},
      tables: [],
      statements: [{ speaker: 'Receiving nurse', text: 'Give me what I need to know.' }],
    },
    prompts: [
      actions(
        'p8',
        'take_action',
        'What belongs in the handoff? Select all that apply.',
        handoffTexts,
        'A structured handoff has all four elements, Situation, Background, Assessment and Recommendation, and ends with a read-back. Comfort details and reassurance do not belong in it.',
        seed + 7,
      ),
    ],
  }
  const now = nowIso()
  return {
    id: p.id,
    title: `${def.label}: an unfolding case study`,
    origin: 'generated',
    status: 'draft',
    ...(p.contentNotice ? { contentNotice: p.contentNotice } : {}),
    patient: {
      simulated: true,
      name: patient.name,
      mrn: patient.mrn,
      age: patient.age,
      sex: patient.sex,
      summary: patientSummary(patient),
    },
    objectives: [
      'Recognize the cues that show a patient is changing',
      'Analyze the cues and prioritize the likely explanations',
      'Choose and take the actions that bring help early',
      'Evaluate whether the response is working',
    ],
    source: `Simulated ${def.label.toLowerCase()} trajectory (seed ${p.seed}). ${def.source}`,
    stages: [s1, s2, s3, s4, outcome(true, good), outcome(false, poor), s6],
    createdAt: now,
    updatedAt: now,
  }
}
