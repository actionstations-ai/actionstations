// Domain plumbing (ADR-0014): the profile a project resolves to, the threat family a scenario
// exercises, the `domain` / `threat` variables every prompt receives, the role heuristics the
// lints use, and the facility-fact categories compiled from the profile's data definitions.
import type { Project, Scenario, ScenarioBrief, ScenarioIdea } from '@shared/schemas'
import {
  chooseThreatFamily,
  resolveProfile,
  resolveThreat,
  type DomainProfile,
  type FactCategory as FactCategorySpec,
  type ThreatFamily,
  type ThreatFamilyId,
} from '@shared/domains'
import { injectTypesForDomain } from '@shared/taxonomy'
import {
  compressIds,
  expandIds,
  gateList,
  GENERIC_CATEGORIES,
  type FactCategory,
} from './facility-categories'

export interface DomainContext {
  profile: DomainProfile
  threat: ThreatFamily
}

/** The effective profile of a project (built-in for its orgType plus the project's overrides). */
export function profileFor(
  project: Pick<Project, 'orgType' | 'domainProfileOverrides'>,
): DomainProfile {
  return resolveProfile(project.orgType, project.domainProfileOverrides)
}

/** The profile and threat family a scenario is generated and linted against. */
export function domainContext(
  project: Pick<Project, 'orgType' | 'domainProfileOverrides'>,
  scenario?: Pick<Scenario, 'brief'>,
): DomainContext {
  const profile = profileFor(project)
  return { profile, threat: resolveThreat(profile, scenario?.brief.threatFamily) }
}

/**
 * A new scenario's brief with its threat family settled: the designer's choice when given,
 * else the family the idea or request describes, else the profile's default. Settled once at
 * creation so every stage, resume and re-run sees the same arc.
 */
export function briefWithThreat(
  brief: ScenarioBrief,
  profile: DomainProfile,
  idea?: ScenarioIdea,
): ScenarioBrief {
  if (brief.threatFamily) return brief
  const text = [
    idea?.threatFamily ?? '',
    idea?.title ?? '',
    idea?.hook ?? '',
    idea?.threat ?? '',
    ...(idea?.systemsAffected ?? []),
    brief.userPrompt,
    ...brief.learningObjectives,
    ...brief.constraints,
  ].join('\n')
  const threatFamily: ThreatFamilyId =
    idea?.threatFamily && profile.threatFamilies.includes(idea.threatFamily)
      ? idea.threatFamily
      : chooseThreatFamily(profile, text)
  return { ...brief, threatFamily }
}

/** The threat family an idea's text describes, among the profile's families. */
export function ideaThreatFamily(idea: ScenarioIdea, profile: DomainProfile): ThreatFamilyId {
  return chooseThreatFamily(
    profile,
    [idea.title, idea.hook, idea.threat, ...idea.systemsAffected].join('\n'),
  )
}

// ---- prompt variables ---------------------------------------------------------------------

/** `domain` for the prompts: the profile minus the parts only code reads. */
export function domainVars(profile: DomainProfile) {
  const typeIds = new Set(injectTypesForDomain(profile.id).map((t) => t.id))
  return {
    id: profile.id,
    label: profile.label,
    description: profile.description,
    vocabulary: profile.vocabulary,
    systems: profile.systems,
    roles: profile.roles,
    outsideParties: profile.outsideParties,
    mediaChannels: profile.mediaChannels,
    injectTypes: profile.injectTypes.filter((t) => typeIds.has(t)),
    noiseExamples: profile.noiseExamples,
    pressureExamples: profile.pressureExamples,
    factCategories: profile.factCategories.map((c) => c.label),
    threatFamilies: profile.threatFamilies,
  }
}

/** `threat` for the prompts: the family's arc and vocabulary. */
export function threatVars(threat: ThreatFamily) {
  return {
    id: threat.id,
    label: threat.label,
    description: threat.description,
    phaseArc: threat.phaseArc.map((p, i) => ({ number: i + 1, ...p })),
    decisionPointExamples: threat.decisionPointExamples,
    clueKinds: threat.clueKinds,
    hurdleKinds: threat.hurdleKinds,
    keyCoordination: threat.keyCoordination,
    technicalClue: threat.lint.clueRequired,
    clueRole: threat.lint.clueRole,
    decisionMustMention: threat.lint.decisionMustMention?.description ?? '',
  }
}

// ---- role heuristics ----------------------------------------------------------------------

export interface RoleHeuristics {
  public: RegExp
  technical: RegExp
  security: RegExp
  operations: RegExp
}

const BASE_PATTERNS = {
  public: 'pio|public information|public affairs|communications? officer|spokesperson',
  technical: 'it\\b|cyber|information technology|technical lead|ciso|cio|soc\\b|network|scada',
  security: 'security|police|law enforcement|leo\\b|sheriff|fso\\b',
  operations: 'ops\\b|operations|incident command|\\bic\\b',
}

const joined = (base: string, extra: string | undefined): RegExp =>
  new RegExp(`\\b(?:${base}${extra ? `|${extra}` : ''})`, 'i')

/** The default heuristics plus the profile's own words (an "ASC" is a security role). */
export function roleHeuristics(profile?: DomainProfile): RoleHeuristics {
  const p = profile?.rolePatterns ?? {}
  return {
    public: joined(BASE_PATTERNS.public, p.public),
    technical: joined(BASE_PATTERNS.technical, p.technical),
    security: joined(BASE_PATTERNS.security, p.security),
    operations: joined(BASE_PATTERNS.operations, p.operations),
  }
}

// ---- facility-fact categories -------------------------------------------------------------

const unique = (xs: Iterable<string>): string[] => [...new Set(xs)]
const sorted = (xs: string[]): string[] => [...xs].sort()
const capped = (items: string[], n = 20): string =>
  items.slice(0, n).join(', ') + (items.length > n ? ', …' : '')

/** A list of ids after a noun: "A1–A8, B1–B10", "A and B". */
const ID_LIST = String.raw`([A-Z]?\d{1,3}[A-Z]?|[A-Z])\b(?:\s*(?:[–-]|,|and|&|\/)\s*(?:[A-Z]?\d{1,3}[A-Z]?|[A-Z])\b)*`
const NUMBER_LIST = String.raw`#?\s*(\d{1,5})\b(?:\s*(?:[–-]|,|and|&|\/)\s*#?\d{1,5}\b)*`

const NATO: Record<string, string> = {
  ALPHA: 'A',
  BRAVO: 'B',
  CHARLIE: 'C',
  DELTA: 'D',
  ECHO: 'E',
  FOXTROT: 'F',
  GOLF: 'G',
  HOTEL: 'H',
  INDIA: 'I',
  JULIET: 'J',
  KILO: 'K',
  LIMA: 'L',
  MIKE: 'M',
}

/** "Spillway Gates?|Gates?" → the longest alternative first, so "Spillway Gate 3" is not "Gate 3" + noise. */
const nounSource = (noun: string): string =>
  noun
    .split('|')
    .map((n) => n.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .join('|')

const runwayCategory = (spec: FactCategorySpec): FactCategory => {
  const noun = nounSource(spec.noun ?? 'Runways?')
  const list = new RegExp(
    String.raw`\b(?:${noun})\s+(\d{1,2}[LRC]?(?:\s*\/\s*\d{1,2}[LRC]?)?(?:\s*(?:,|and|&)\s*\d{1,2}[LRC]?(?:\s*\/\s*\d{1,2}[LRC]?)?)*)`,
    'gi',
  )
  const one = new RegExp(
    String.raw`\b(?:${noun})\s+(\d{1,2}[LRC]?)(?:\s*\/\s*(\d{1,2}[LRC]?))?`,
    'gi',
  )
  return {
    id: spec.id,
    label: spec.label,
    ...(spec.lint ? { noun: singular(spec.label) } : {}),
    *extract({ real }) {
      for (const m of real.matchAll(list))
        for (const item of m[1]!.toUpperCase().split(/\s*(?:,|AND|&)\s*/))
          yield item.replace(/\s*\/\s*/, '/')
    },
    finalize: (entries) => {
      const ends = new Set(entries.filter((e) => e.includes('/')).flatMap((e) => e.split('/')))
      return unique(entries).filter((e) => e.includes('/') || !ends.has(e))
    },
    expand: (entries) =>
      unique(
        entries.flatMap((e) => [e, ...e.split(/\s*\/\s*/)]).map((e) => e.trim().toUpperCase()),
      ),
    format: (entries) => entries.join(', '),
    *mentions(text) {
      for (const m of text.matchAll(one))
        for (const end of [m[1], m[2]]) if (end) yield end.toUpperCase()
    },
  }
}

/** "Gates" → "gate", "Spillway gates" → "spillway gate", "RTUs / PLCs" → "RTU / PLC". */
export function singular(label: string): string {
  return label
    .split(/(\s*\/\s*)/)
    .map((part) =>
      /^\s*\/\s*$/.test(part)
        ? part
        : part
            .replace(/(?:ies)$/i, 'y')
            .replace(/(?<=[a-z])s$/i, '')
            .replace(/(?<=[A-Z])s$/, ''),
    )
    .join('')
    .replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase())
}

const alnumCategory = (spec: FactCategorySpec): FactCategory => {
  const noun = nounSource(spec.noun!)
  const list = new RegExp(String.raw`\b(?:${noun})\s*[:(]?\s*${ID_LIST}`, 'gi')
  const strip = new RegExp(String.raw`^(?:${noun})\s*[:(]?\s*`, 'i')
  const mention = new RegExp(String.raw`\b(?:${noun})\s+([A-Z]?\d{1,3}[A-Z]?|[A-Z][a-z]*)\b`, 'g')
  return {
    id: spec.id,
    label: spec.label,
    ...(spec.lint ? { noun: singular(spec.label) } : {}),
    ...(spec.complete ? { sheetLabel: `${spec.label} (the complete list)` } : {}),
    *extract({ real }) {
      for (const m of real.matchAll(list)) yield* expandIds(m[0].replace(strip, ''))
    },
    finalize: (entries) =>
      spec.complete
        ? compressIds(unique(entries.flatMap(expandIds)))
            .split(', ')
            .filter(Boolean)
        : sorted(unique(entries)),
    expand: (entries) => unique(entries.flatMap(expandIds)),
    format: (entries) =>
      spec.complete ? gateList(unique(entries.flatMap(expandIds))) : capped(entries),
    *mentions(text) {
      for (const m of text.matchAll(mention)) {
        const raw = m[1]!.toUpperCase()
        if (/^[A-Z]{2,}$/.test(raw)) {
          if (NATO[raw]) yield NATO[raw]
          continue
        }
        yield raw
      }
    },
  }
}

const numberCategory = (spec: FactCategorySpec): FactCategory => {
  const noun = nounSource(spec.noun!)
  const list = new RegExp(String.raw`\b(?:${noun})\s*${NUMBER_LIST}`, 'gi')
  const strip = new RegExp(String.raw`^(?:${noun})\s*`, 'i')
  const mention = new RegExp(String.raw`\b(?:${noun})\s*#?\s*(\d{1,5})\b`, 'gi')
  return {
    id: spec.id,
    label: spec.label,
    ...(spec.lint ? { noun: singular(spec.label) } : {}),
    ...(spec.complete ? { sheetLabel: `${spec.label} (the complete list)` } : {}),
    *extract({ real }) {
      for (const m of real.matchAll(list))
        yield* expandIds(m[0].replace(strip, '').replace(/#/g, ''))
    },
    finalize: (entries) => sorted(unique(entries.flatMap(expandIds))),
    expand: (entries) => unique(entries.flatMap(expandIds)),
    format: (entries) => (spec.complete ? gateList(entries) : capped(entries)),
    *mentions(text) {
      for (const m of text.matchAll(mention)) yield m[1]!
    },
  }
}

/** A custom pattern: group 1 is the identifier, compared case-insensitively as written. */
const patternCategory = (spec: FactCategorySpec): FactCategory => {
  const re = new RegExp(spec.pattern!, 'g')
  const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toUpperCase()
  return {
    id: spec.id,
    label: spec.label,
    ...(spec.lint ? { noun: singular(spec.label) } : {}),
    ...(spec.complete ? { sheetLabel: `${spec.label} (the complete list)` } : {}),
    *extract({ real }) {
      for (const m of real.matchAll(re)) if (m[1]) yield m[1].replace(/\s+/g, ' ').trim()
    },
    finalize: (entries) => sorted(unique(entries)),
    expand: (entries) => unique(entries.map(norm)),
    format: (entries) => (spec.complete ? entries.join(', ') : capped(entries)),
    *mentions(text) {
      for (const m of text.matchAll(re)) if (m[1]) yield norm(m[1])
    },
  }
}

/** One profile category definition → the code the extractor, sheet and lint run. */
export function compileCategory(spec: FactCategorySpec): FactCategory {
  if (spec.pattern) return patternCategory(spec)
  if (!spec.noun) throw new Error(`Fact category ${spec.id} needs a noun or a pattern`)
  if (spec.idShape === 'runway') return runwayCategory(spec)
  if (spec.idShape === 'number') return numberCategory(spec)
  if (spec.idShape === 'token')
    return patternCategory({
      ...spec,
      pattern: String.raw`\b((?:${nounSource(spec.noun)})[- ]?\d{1,4}[A-Z]?)\b`,
    })
  return alnumCategory(spec)
}

/** Extra agencies the profile knows (regulators), appended to the generic agency category. */
function agenciesWith(pattern: string | undefined): FactCategory[] {
  if (!pattern) return []
  const re = new RegExp(String.raw`\b(?:${pattern})\b`, 'g')
  return [
    {
      id: 'agencies',
      label: 'Agencies / contacts',
      sheetLabel: 'Agencies',
      *extract({ all }) {
        for (const m of all.matchAll(re)) yield m[0]
      },
    },
  ]
}

/**
 * The fact categories of a profile: its own (compiled) followed by the generic ones, with the
 * profile's regulators merged into the generic agency category.
 */
export function categoriesForProfile(profile: DomainProfile): FactCategory[] {
  const own = profile.factCategories.map(compileCategory)
  const extraAgencies = agenciesWith(profile.agencyPattern)[0]
  const generic = GENERIC_CATEGORIES.map((c) =>
    c.id === 'agencies' && extraAgencies
      ? {
          ...c,
          *extract(text: { all: string; real: string }) {
            yield* c.extract(text)
            yield* extraAgencies.extract(text)
          },
        }
      : c,
  )
  return [...own, ...generic]
}

/** The categories a project's facts use. */
export function categoriesForProject(
  project: Pick<Project, 'orgType' | 'domainProfileOverrides'>,
): FactCategory[] {
  return categoriesForProfile(profileFor(project))
}
