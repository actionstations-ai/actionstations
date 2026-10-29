// Persona cards on disk and their mapping from SimCell scripts (spec 0429 FR-1 to FR-5).
import {
  ExerciseTime,
  PersonaCard,
  PersonasFile,
  type PersonaKind,
  type PersonasOutput,
  type Scenario,
  type SimcellScript,
} from '@shared/schemas'
import { AppError } from '../lib/errors'
import { readJsonOr, safeJoin, slugify, writeJsonAtomic } from '../lib/fs'
import { requireScenarioDir } from '../scenario/store'

export const PERSONAS_FILE = 'personas.json'

export const emptyPersonas = (): PersonasFile => ({ version: 1, personas: [] })

export async function readPersonas(root: string, scenarioId: string): Promise<PersonasFile> {
  const layout = await requireScenarioDir(root, scenarioId)
  return readJsonOr(safeJoin(layout.dir, PERSONAS_FILE), PersonasFile, emptyPersonas)
}

/** Save after the name checks; `realNames` are the people and contacts named in the project's facts. */
export async function writePersonas(
  root: string,
  scenarioId: string,
  file: PersonasFile,
  realNames: readonly string[],
): Promise<PersonasFile> {
  const clean = PersonasFile.parse(file)
  const ids = new Set<string>()
  for (const card of clean.personas) {
    if (ids.has(card.id)) throw new AppError('VALIDATION', `Two personas share the id ${card.id}`)
    ids.add(card.id)
    const problem = realNameProblem(card.displayName, realNames)
    if (problem) throw new AppError('VALIDATION', problem, { personaId: card.id })
  }
  const layout = await requireScenarioDir(root, scenarioId)
  await writeJsonAtomic(safeJoin(layout.dir, PERSONAS_FILE), clean)
  return clean
}

// ---- names (FR-4) ------------------------------------------------------------------------

/** An office title bound to a name: "Governor Ames". A title alone ("the Governor's press secretary") is fine. */
const OFFICE_WITH_NAME =
  /\b(?:Lieutenant Governor|Governor|Mayor|Senator|Representative|Congressman|Congresswoman|President|Vice President|Attorney General|Sheriff|Secretary)\s+[A-Z][a-z]+/

/**
 * Why a display name may not be saved, or undefined. A name is refused when it binds a public
 * office to a name, or when it matches a person or contact from the project's facts.
 */
export function realNameProblem(
  displayName: string,
  realNames: readonly string[],
): string | undefined {
  const use = 'Use a fictional name, or a title alone such as "the Governor\'s press secretary".'
  if (OFFICE_WITH_NAME.test(displayName))
    return `"${displayName}" names a public office holder. ${use}`
  const mine = displayName.toLowerCase().replace(/\s+/g, ' ').trim()
  for (const real of realNames) {
    const other = real.toLowerCase().replace(/\s+/g, ' ').trim()
    if (other.length < 5) continue
    if (mine === other || mine.includes(other) || other.includes(mine))
      return `"${displayName}" matches "${real}" in the project's agencies and contacts. ${use}`
  }
  return undefined
}

// ---- from SimCell scripts (FR-3) ---------------------------------------------------------

const KIND_WORDS: [PersonaKind, RegExp][] = [
  ['attacker', /attacker|extort|ransom|threat actor|hacker|adversar/i],
  ['reporter', /report|press|media|journalist|newsroom|editor|tv |radio|blogger/i],
  ['regulator', /regulat|inspector|compliance|auditor|oversight/i],
  ['vendor', /vendor|supplier|contractor|provider|manufacturer/i],
  ['resident', /resident|passenger|citizen|customer|neighbor|public|traveler|visitor/i],
  ['partner', /partner|tenant|airline|operator|carrier/i],
  ['agency', /agency|police|fire|sheriff|fbi|department|county|state|federal|emergency/i],
]

export function guessKind(rolePlayed: string): PersonaKind {
  return KIND_WORDS.find(([, re]) => re.test(rolePlayed))?.[0] ?? 'other'
}

const clip = (s: string, n: number): string => s.trim().slice(0, n)

const ATTACKER_LIMIT = 'How the attack was carried out'

/** One card per script: name and role from `rolePlayed`, hard questions and concessions as written. */
export function fromSimcellScript(script: SimcellScript, index: number): PersonaCard {
  const role = clip(script.rolePlayed || `Outside party ${index + 1}`, 80)
  const kind = guessKind(script.rolePlayed)
  return PersonaCard.parse({
    id: `p${index + 1}-${slugify(role, 40) || 'party'}`,
    displayName: role,
    roleTitle: clip(script.rolePlayed, 120),
    organization: { name: '', fictional: true },
    kind,
    goals: [],
    knowledge: {
      knows: [],
      doesNotKnow: kind === 'attacker' ? [ATTACKER_LIMIT] : [],
      mustNotReveal: [],
    },
    concessions: script.concessions
      .slice(0, 5)
      .map((give, i) => ({ id: `c${i + 1}`, give: clip(give, 300), onlyIf: '' })),
    hardQuestions: script.hardQuestions.slice(0, 6).map((q) => clip(q, 300)),
    source: { simcellScriptIndex: index },
  })
}

export function fromSimcellScripts(scenario: Pick<Scenario, 'simcellScripts'>): PersonasFile {
  return {
    version: 1,
    personas: scenario.simcellScripts.slice(0, 20).map(fromSimcellScript),
  }
}

const exerciseTime = (s: string | undefined): string | undefined =>
  s && ExerciseTime.safeParse(s.trim()).success ? s.trim() : undefined

type OutCard = PersonasOutput['personas'][number]

function whenOf(rule: OutCard['escalationRules'][number]) {
  if (rule.whenKind === 'time') {
    const at = exerciseTime(rule.at)
    return at ? { kind: 'time' as const, at } : undefined
  }
  if (rule.whenKind === 'no_reply') {
    const minutes = Math.min(120, Math.max(1, rule.minutes ?? 10))
    return { kind: 'no_reply' as const, minutes }
  }
  return rule.text?.trim()
    ? { kind: 'player_says' as const, text: clip(rule.text, 200) }
    : undefined
}

function cardFromOutput(g: OutCard, start: PersonaCard): PersonaCard {
  const doesNotKnow = g.doesNotKnow.map((s) => clip(s, 300)).filter(Boolean)
  const attackerLimit = g.kind === 'attacker' && !doesNotKnow.length
  return PersonaCard.parse({
    ...start,
    displayName: clip(g.displayName || start.displayName, 80),
    roleTitle: clip(g.roleTitle || start.roleTitle, 120),
    organization: { name: clip(g.organizationName, 120), fictional: g.organizationFictional },
    kind: g.kind,
    register: clip(g.register, 40),
    goals: g.goals.slice(0, 5).map((text, i) => ({ id: `g${i + 1}`, text: clip(text, 300) })),
    deadlines: g.deadlines
      .map((d) => ({
        at: exerciseTime(d.at),
        wants: clip(d.wants, 300),
        ifMissed: clip(d.ifMissed, 300),
      }))
      .filter((d) => d.at)
      .slice(0, 5)
      .map((d, i) => ({ id: `d${i + 1}`, ...d })),
    escalationRules: g.escalationRules
      .map((r) => ({ when: whenOf(r), then: clip(r.then, 300) }))
      .filter((r) => r.when)
      .slice(0, 8)
      .map((r, i) => ({ id: `r${i + 1}`, ...r })),
    knowledge: {
      knows: g.knows.slice(0, 10).map((s) => clip(s, 300)),
      doesNotKnow: attackerLimit ? [ATTACKER_LIMIT] : doesNotKnow.slice(0, 10),
      mustNotReveal: g.mustNotReveal.slice(0, 10).map((s) => clip(s, 120)),
    },
    concessions: g.concessions.length
      ? g.concessions.slice(0, 5).map((c, i) => ({
          id: `c${i + 1}`,
          give: clip(c.give, 300),
          onlyIf: clip(c.onlyIf, 300),
        }))
      : start.concessions,
  })
}

/** Merge the model's fill-in over the plain mapping; a card that does not validate is dropped. */
export function mergeGenerated(
  out: PersonasOutput,
  scenario: Pick<Scenario, 'simcellScripts'>,
): PersonasFile {
  const base = fromSimcellScripts(scenario).personas
  const cards: PersonaCard[] = []
  for (const g of out.personas) {
    const start = base[g.scriptIndex]
    if (!start) continue
    try {
      cards.push(cardFromOutput(g, start))
    } catch {
      cards.push(start)
    }
  }
  return { version: 1, personas: cards.length ? cards : base }
}
