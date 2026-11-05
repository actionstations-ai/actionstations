// The clinical content a generated case study needs for each named trajectory (spec 0452 FR-9):
// the risk facts, the cues, the competing explanations, the actions with their credit and the
// key points of a short rationale. Written for exercises and reviewed by the author before a
// learner sees it; it is not clinical guidance and never reproduces exam items.
import type { TrajectoryKind, VitalKey } from '../toolkits/clinical/trajectory'

export interface Scored {
  text: string
  /** Credit for an action option: 1 best, a fraction acceptable, 0 neutral, negative harmful. */
  credit: number
}

export interface KindContent {
  /** Facts at presentation: the ones that raise this patient's risk, then ones that do not. */
  riskFacts: { relevant: string[]; other: string[] }
  /** The vital signs whose trend is the relevant cue. */
  cueVitals: VitalKey[]
  /** Distractor observations that are unchanged or unrelated. */
  distractors: string[]
  /** Explanations, most likely first. */
  hypotheses: string[]
  /** Key points of a short rationale about what the trends mean. */
  rationalePoints: { label: string; anyOf: string[] }[]
  /** What a nurse would consider doing. */
  consider: Scored[]
  /** What to do right now at the change in condition. */
  now: Scored[]
  /** The risk named in the debrief. */
  lesson: string
}

export const CONTENT: Record<TrajectoryKind, KindContent> = {
  sepsis: {
    riskFacts: {
      relevant: [
        'Recent abdominal surgery with a surgical wound',
        'Type 2 diabetes',
        'On an intravenous antibiotic since surgery',
      ],
      other: [
        'Prefers the window side of the room',
        'Daughter visits every evening',
        'Uses reading glasses',
      ],
    },
    cueVitals: ['heart_rate', 'systolic_bp', 'temperature', 'respiratory_rate'],
    distractors: [
      'Pain at the wound 3 of 10 and unchanged',
      'Ate half of lunch',
      'Asked for the television remote',
    ],
    hypotheses: [
      'Infection spreading into the bloodstream (sepsis)',
      'Bleeding after surgery',
      'A blood clot in the lung',
      'Pain and anxiety',
    ],
    rationalePoints: [
      {
        label: 'Heart rate rising and blood pressure falling together',
        anyOf: ['heart rate', 'tachycardia', 'pulse'],
      },
      {
        label: 'Fever with the surgical history points to infection',
        anyOf: ['infection', 'sepsis', 'fever', 'temperature'],
      },
      {
        label: 'The trend matters more than any single value',
        anyOf: ['trend', 'worsening', 'getting worse', 'over time'],
      },
    ],
    consider: [
      { text: 'Repeat a full set of vital signs and look at the trend', credit: 1 },
      { text: 'Check the surgical wound and the intravenous site', credit: 0.8 },
      { text: 'Review the latest laboratory results', credit: 0.8 },
      { text: 'Call the provider with a structured report', credit: 1 },
      { text: 'Give extra pain medication and recheck in an hour', credit: -0.3 },
      { text: 'Chart the values and continue routine care', credit: -1 },
    ],
    now: [
      { text: 'Call rapid response and report the patient with a structured SBAR', credit: 1 },
      { text: 'Stay with the patient and repeat vital signs', credit: 0.6 },
      { text: 'Start oxygen and raise the head of the bed within your scope', credit: 0.5 },
      { text: 'Prepare for orders: intravenous access, cultures and fluids', credit: 0.8 },
      { text: 'Wait for the next scheduled vital signs', credit: -1 },
      { text: 'Give the next dose of the antihypertensive early', credit: -1 },
    ],
    lesson:
      'a pattern of small changes across several vital signs can mean sepsis before any one value is alarming',
  },
  hemorrhage: {
    riskFacts: {
      relevant: [
        'Surgery yesterday with a large wound',
        'On an anticoagulant',
        'Atrial fibrillation',
      ],
      other: ['Likes tea in the morning', 'Walks with a cane', 'Retired teacher'],
    },
    cueVitals: ['heart_rate', 'systolic_bp', 'respiratory_rate', 'oxygen_saturation'],
    distractors: [
      'Mild nausea after breakfast',
      'Temperature unchanged',
      'Asked about visiting hours',
    ],
    hypotheses: [
      'Bleeding at the surgical site',
      'Dehydration',
      'An abnormal heart rhythm',
      'Reaction to pain medication',
    ],
    rationalePoints: [
      {
        label: 'Heart rate up and pressure down suggests blood loss',
        anyOf: ['bleed', 'blood loss', 'hemorrhage', 'hypovol'],
      },
      {
        label: 'The anticoagulant raises the risk',
        anyOf: ['anticoag', 'blood thinner', 'enoxaparin', 'heparin'],
      },
      { label: 'The dressing is a clue', anyOf: ['dressing', 'wound', 'drain'] },
    ],
    consider: [
      { text: 'Look at the dressing and the drain output', credit: 1 },
      { text: 'Repeat vital signs and check skin color and temperature', credit: 0.9 },
      { text: 'Review the latest hemoglobin', credit: 0.8 },
      { text: 'Call the surgical team', credit: 1 },
      { text: 'Give the next anticoagulant dose on time', credit: -1 },
      { text: 'Ask the patient to walk to improve circulation', credit: -0.6 },
    ],
    now: [
      { text: 'Apply direct pressure to the site and call for help', credit: 1 },
      { text: 'Call rapid response and the surgeon with a structured report', credit: 1 },
      { text: 'Hold the next anticoagulant dose and tell the provider', credit: 0.8 },
      { text: 'Lie the patient flat and keep them warm', credit: 0.5 },
      { text: 'Wait to see whether the dressing fills further', credit: -1 },
      { text: 'Give a large drink of water', credit: -0.6 },
    ],
    lesson: 'a rising heart rate often comes before a falling blood pressure in bleeding',
  },
  respiratory_failure: {
    riskFacts: {
      relevant: [
        'Long-standing COPD',
        'Pneumonia diagnosed three days ago',
        'Oxygen saturation of 95 percent on arrival',
      ],
      other: ['Lives with a niece', 'Allergic to nothing known', 'Likes crossword puzzles'],
    },
    cueVitals: ['respiratory_rate', 'oxygen_saturation', 'heart_rate'],
    distractors: ['Temperature normal', 'Blood pressure steady', 'Ate dinner'],
    hypotheses: [
      'Worsening pneumonia with failing oxygenation',
      'A COPD flare',
      'Fluid on the lungs',
      'Anxiety',
    ],
    rationalePoints: [
      {
        label: 'Faster breathing and falling saturation on the same oxygen',
        anyOf: ['respiratory rate', 'saturation', 'oxygen'],
      },
      {
        label: 'Work of breathing and speech are signs',
        anyOf: ['short phrases', 'work of breathing', 'accessory', 'tiring'],
      },
      { label: 'The change from baseline matters', anyOf: ['baseline', 'trend', 'worsening'] },
    ],
    consider: [
      { text: 'Assess breathing effort, lung sounds and speech', credit: 1 },
      { text: 'Sit the patient upright', credit: 0.8 },
      { text: 'Check that the oxygen device is working and in place', credit: 0.8 },
      { text: 'Call the provider and respiratory therapy', credit: 1 },
      { text: 'Lie the patient flat to rest', credit: -1 },
      { text: 'Give a sedative to calm the patient', credit: -1 },
    ],
    now: [
      { text: 'Call rapid response and respiratory therapy with a structured report', credit: 1 },
      { text: 'Sit the patient up and increase oxygen within your orders', credit: 0.8 },
      { text: 'Stay with the patient and monitor continuously', credit: 0.6 },
      { text: 'Prepare for possible non-invasive ventilation', credit: 0.6 },
      { text: 'Reassess in an hour', credit: -1 },
      { text: 'Give a sleeping medication to help the patient rest', credit: -1 },
    ],
    lesson:
      'a patient whose breathing rate climbs while saturation falls is tiring even if the oxygen number looks near normal',
  },
  cardiac_event: {
    riskFacts: {
      relevant: [
        'High blood pressure and high cholesterol',
        'Family history of heart disease',
        'Chest pain on admission',
      ],
      other: ['Works as a bus driver', 'Prefers decaf coffee', 'Two grandchildren'],
    },
    cueVitals: ['heart_rate', 'systolic_bp', 'oxygen_saturation'],
    distractors: ['Temperature normal', 'Breathing rate normal', 'Ate a light lunch'],
    hypotheses: [
      'A heart attack',
      'Heart failure getting worse',
      'Reflux or muscle strain',
      'Anxiety',
    ],
    rationalePoints: [
      {
        label: 'Chest pressure with sweating and rising heart rate',
        anyOf: ['chest', 'sweating', 'diaphoresis', 'pressure'],
      },
      {
        label: 'Risk factors raise concern',
        anyOf: ['risk', 'cholesterol', 'family history', 'blood pressure'],
      },
      {
        label: 'Needs an ECG and a provider promptly',
        anyOf: ['ecg', 'ekg', 'provider', 'cardiology'],
      },
    ],
    consider: [
      { text: 'Ask about the pain: where, how long, what it feels like', credit: 1 },
      { text: 'Obtain a 12-lead ECG if the protocol allows', credit: 1 },
      { text: 'Repeat vital signs and keep the patient resting', credit: 0.8 },
      { text: 'Call the provider', credit: 1 },
      { text: 'Encourage a walk to relieve the discomfort', credit: -1 },
      { text: 'Give an antacid and reassess tomorrow', credit: -1 },
    ],
    now: [
      { text: 'Call rapid response and report chest pain with the ECG and vital signs', credit: 1 },
      { text: 'Keep the patient at rest and stay with them', credit: 0.7 },
      { text: 'Start oxygen if saturation is low, per protocol', credit: 0.5 },
      { text: 'Prepare for orders: intravenous access and laboratory draw', credit: 0.8 },
      { text: 'Wait for the day team to round', credit: -1 },
      { text: 'Send the patient to the bathroom independently', credit: -0.6 },
    ],
    lesson:
      'chest discomfort with sweating and a changing heart rate needs an ECG and a provider without waiting',
  },
  postoperative_deterioration: {
    riskFacts: {
      relevant: [
        'Abdominal surgery two days ago',
        'Hemoglobin lower than on admission',
        'Tight, painful abdomen',
      ],
      other: ['Prefers a firmer pillow', 'Has a dog at home', 'Likes the radio on'],
    },
    cueVitals: ['heart_rate', 'systolic_bp', 'temperature', 'respiratory_rate'],
    distractors: [
      'Oxygen saturation steady',
      'Ate a few bites of toast',
      'Asked for another blanket',
    ],
    hypotheses: [
      'A complication at the surgical site (bleeding or leak)',
      'Infection',
      'Pain not controlled',
      'Anxiety',
    ],
    rationalePoints: [
      {
        label: 'Pain, tight abdomen and a rising heart rate',
        anyOf: ['abdomen', 'abdominal', 'pain', 'distension'],
      },
      {
        label: 'A surgical complication is possible',
        anyOf: ['complication', 'bleed', 'leak', 'surgical'],
      },
      { label: 'The surgical team needs to know', anyOf: ['surgeon', 'surgical team', 'provider'] },
    ],
    consider: [
      { text: 'Assess the abdomen, the wound and the drains', credit: 1 },
      { text: 'Repeat vital signs and the pain score', credit: 0.8 },
      { text: 'Review the latest hemoglobin and white count', credit: 0.8 },
      { text: 'Call the surgical team', credit: 1 },
      { text: 'Give the next dose of pain medication and reassess in the morning', credit: -0.8 },
      { text: 'Encourage a big meal to regain strength', credit: -1 },
    ],
    now: [
      { text: 'Call rapid response and the surgeon with a structured report', credit: 1 },
      { text: 'Keep the patient nothing by mouth until the surgeon decides', credit: 0.7 },
      { text: 'Prepare for orders: imaging, laboratory draw and fluids', credit: 0.8 },
      { text: 'Sit the patient up and give oxygen within your scope', credit: 0.4 },
      { text: 'Reassess after the next meal', credit: -1 },
      { text: 'Increase activity to relieve the tightness', credit: -1 },
    ],
    lesson:
      'a post-operative patient with worsening pain and a changing heart rate needs the surgical team early',
  },
  hypoglycemia: {
    riskFacts: {
      relevant: [
        'Type 2 diabetes on insulin',
        'Insulin given an hour ago',
        'Ate only a few bites at the meal',
      ],
      other: ['Likes gardening', 'Wears hearing aids', 'Granddaughter calls daily'],
    },
    cueVitals: ['heart_rate'],
    distractors: ['Temperature normal', 'Blood pressure steady', 'Oxygen saturation normal'],
    hypotheses: [
      'Low blood sugar from insulin',
      'Infection',
      'A stroke',
      'A reaction to a new medication',
    ],
    rationalePoints: [
      {
        label: 'Sweating, shakiness and confusion after insulin',
        anyOf: ['insulin', 'sweat', 'shak', 'confus'],
      },
      { label: 'Check blood glucose first', anyOf: ['glucose', 'blood sugar', 'fingerstick'] },
      {
        label: 'Treat promptly per protocol',
        anyOf: ['protocol', 'carbohydrate', 'juice', 'dextrose'],
      },
    ],
    consider: [
      { text: 'Check blood glucose now', credit: 1 },
      { text: 'Review the insulin dose and the last meal', credit: 0.8 },
      { text: 'Repeat vital signs and mental status', credit: 0.7 },
      { text: 'Call the provider if glucose is low', credit: 0.8 },
      { text: 'Give the next insulin dose as scheduled', credit: -1 },
      { text: 'Let the patient sleep and check in the morning', credit: -1 },
    ],
    now: [
      { text: 'Check glucose and treat low glucose per the hypoglycemia protocol', credit: 1 },
      { text: 'Stay with the patient and recheck glucose after treatment', credit: 0.8 },
      { text: 'Call rapid response if the patient cannot swallow or does not wake', credit: 0.8 },
      { text: 'Tell the provider and review the insulin plan', credit: 0.6 },
      { text: 'Give a large meal and no treatment now', credit: -0.6 },
      { text: 'Wait to see if the shakiness passes', credit: -1 },
    ],
    lesson: 'confusion in a patient on insulin is low blood sugar until glucose is checked',
  },
}
