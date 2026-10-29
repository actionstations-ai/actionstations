// The AAR/IP as a Markdown document (#419, FR-6), in the HSEEP 2020 layout: Exercise Overview,
// Executive Summary, Analysis of Core Capabilities (rating table, then strengths and areas for
// improvement per capability with Analysis / Reference / Recommendation), Appendix A Improvement
// Plan, Appendix B Participants, Appendix C Participant Feedback, Appendix D Acronyms. Each part
// sits between section markers, so the tables a structured editor owns (ratings, plan rows,
// organizations, acronyms) can be re-rendered while the prose a person edited stays.
//
// Only a confirmed rating is printed; a capability without one reads "Rating pending", so a
// draft is never mistaken for a decision. Evidence refs print as counts ("Evidence: note on
// I-09; 2 observations"), never as raw ids.
import { capabilityName } from '@shared/core-capabilities'
import {
  aarStatus,
  CAPABILITY_ELEMENT_LABELS,
  CAPABILITY_RATING_DEFINITIONS,
  CAPABILITY_RATING_LABELS,
  CAPABILITY_RATINGS,
  improvementPlanRows,
  type Aar,
  type Acronym,
  type CapabilityAnalysis,
  type EvidenceRef,
  type Finding,
} from '@shared/schemas/aar'
import type { Citation } from '@shared/schemas/common'
import type { Scenario } from '@shared/schemas/scenario'
import { mdCell, mdTable } from '../export/escape'

export const AAR_SECTIONS = [
  'overview',
  'summary',
  'ratings',
  'findings',
  'ip',
  'participants',
  'feedback',
  'acronyms',
] as const
export type AarSection = (typeof AAR_SECTIONS)[number]

/** Sections a person edits as prose; a re-render of the tables leaves them alone. */
export const PROSE_SECTIONS: readonly AarSection[] = ['summary', 'findings', 'feedback']

const marker = (name: AarSection, close = false): string =>
  `<!-- ${close ? '/' : ''}section:${name} -->`

export function wrapSection(name: AarSection, body: string): string {
  return `${marker(name)}\n${body.trim()}\n${marker(name, true)}`
}

/** The text between a section's markers, or undefined when the document has no such section. */
export function sectionBody(markdown: string, name: AarSection): string | undefined {
  const open = marker(name)
  const close = marker(name, true)
  const start = markdown.indexOf(open)
  const end = markdown.indexOf(close, start < 0 ? 0 : start)
  if (start < 0 || end < start) return undefined
  return markdown.slice(start + open.length, end).trim()
}

/** Replace a marked section; append it when the document has no such section. */
export function upsertSection(markdown: string, name: AarSection, body: string): string {
  const open = marker(name)
  const close = marker(name, true)
  const start = markdown.indexOf(open)
  const end = markdown.indexOf(close)
  const block = wrapSection(name, body)
  if (start < 0 || end < start) return markdown.trimEnd() + '\n\n' + block + '\n'
  return markdown.slice(0, start) + block + markdown.slice(end + close.length)
}

/** Terms every AAR/IP of this app uses; a scenario's own acronyms are added after them. */
export const BUILT_IN_ACRONYMS: Acronym[] = [
  { term: 'AAR/IP', meaning: 'After-Action Report / Improvement Plan' },
  { term: 'EEG', meaning: 'Exercise Evaluation Guide' },
  { term: 'ENDEX', meaning: 'End of Exercise' },
  { term: 'HSEEP', meaning: 'Homeland Security Exercise and Evaluation Program' },
  { term: 'MSEL', meaning: 'Master Scenario Events List' },
  { term: 'POETE', meaning: 'Planning, Organization, Equipment, Training, Exercises' },
  { term: 'SimCell', meaning: 'Simulation Cell (the facilitators playing the outside world)' },
  { term: 'STARTEX', meaning: 'Start of Exercise' },
  { term: 'TTX', meaning: 'Tabletop Exercise' },
]

/** "TIRP › Section 13 › 13.6 Scenario C…" with page 41 → "TIRP 13.6 (p. 41)". */
export function planSectionLabel(c: Citation): string {
  const parts = c.headingPath.split('›').map((p) => p.trim())
  const doc = parts[0] || c.documentTitle
  const last = parts.length > 1 ? parts[parts.length - 1]! : ''
  const number = /^(\d+(?:\.\d+)*)\b/.exec(last)?.[1]
  const section = number ?? last
  const page = c.page ? ` (p. ${c.page})` : ''
  return `${doc}${section ? ` ${section}` : ''}${page}`
}

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`

/**
 * Evidence refs as a reader's line: "note on I-09; general notes; 2 observations; 1 hot wash
 * item; 1 decision; vote on I-09; 3 messages; participant feedback". Never raw ids.
 */
export function evidenceLabel(refs: readonly EvidenceRef[]): string {
  const counts = new Map<string, number>()
  const parts: string[] = []
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1)
  for (const ref of refs) {
    const [kind, ...rest] = ref.split(':')
    const id = rest.join(':')
    switch (kind) {
      case 'note':
        parts.push(id === 'general' ? 'general notes' : `note on ${id}`)
        break
      case 'obs':
        bump('observation')
        break
      case 'hw':
        bump('hot wash item')
        break
      case 'dec':
        bump('decision')
        break
      case 'vote':
        bump('vote')
        break
      case 'msg':
        bump('message')
        break
      case 'survey':
        bump('participant feedback item')
        break
      default:
        bump('log entry')
    }
  }
  for (const [noun, n] of counts) parts.push(plural(n, noun))
  return parts.join('; ')
}

function objectiveLabel(s: Scenario, id: string): string {
  const o = s.objectives.find((x) => x.id === id)
  return o ? o.name || o.text : id
}

function roleLabel(s: Scenario, roleId: string | undefined): string {
  if (!roleId) return ''
  const r = s.roles.find((x) => x.id === roleId)
  return r ? r.abbreviation || r.name : roleId
}

/** Objective ids a capability is mapped to: the analysis's own, else the scenario's mapping. */
export function capabilityObjectives(s: Scenario, c: CapabilityAnalysis): string[] {
  if (c.objectiveRefs.length) return c.objectiveRefs
  const pairs = s.evaluation?.objectiveCapabilities ?? []
  return pairs.filter((p) => p.capability === c.capability).map((p) => p.objectiveId)
}

const SOURCE_LABELS = {
  facilitator: 'facilitator notes, hot wash items and decision log',
  evaluation: 'evaluator observations',
  live: 'the live-play session log',
  surveys: 'participant feedback surveys',
} as const

/** "Evidence: facilitator notes…; no evaluator observations or participant feedback were recorded." */
export function evidenceSentence(aar: Pick<Aar, 'sourcesUsed'>): string {
  const used = aar.sourcesUsed.map((s) => SOURCE_LABELS[s])
  const missing = (Object.keys(SOURCE_LABELS) as (keyof typeof SOURCE_LABELS)[])
    .filter((s) => !aar.sourcesUsed.includes(s))
    .map((s) => SOURCE_LABELS[s])
  const head = used.length ? `Evidence: ${used.join('; ')}.` : 'Evidence: none recorded.'
  const tail = missing.length ? ` Not recorded: ${missing.join('; ')}.` : ''
  return head + tail
}

export function exerciseOverviewSection(aar: Aar, s: Scenario, orgName: string): string {
  const capabilities = [...new Set(aar.capabilities.map((c) => capabilityName(c.capability)))]
  const objectives = s.objectives.map((o) => (o.name ? `${o.name}: ${o.text}` : o.text))
  const rows: [string, string][] = [
    ['Exercise Name', s.title + (s.subtitle ? ` — ${s.subtitle}` : '')],
    ['Exercise Date', aar.exerciseDate ?? '[Date]'],
    [
      'Scope',
      `Discussion-based tabletop exercise, ${s.brief.durationHours} hours${s.overview?.location ? `, at ${s.overview.location}` : ''}.`,
    ],
    ['Core Capabilities', capabilities.join('; ') || '—'],
    ['Objectives', objectives.join(' · ') || '—'],
    ['Threat or Hazard', s.overview?.threat ?? '—'],
    ['Scenario', s.overview?.theme ?? s.brief.userPrompt ?? '—'],
    ['Sponsor', orgName || '[Sponsor]'],
    ['Participating Organizations', 'See Appendix B'],
    ['Point of Contact', '[Name, title, organization, phone, email]'],
  ]
  const table = rows.map(([k, v]) => `| **${mdCell(k)}** | ${mdCell(v)} |`).join('\n')
  return ['## Exercise Overview', '', '| | |', '|---|---|', table, '', evidenceSentence(aar)].join(
    '\n',
  )
}

export function executiveSummarySection(aar: Aar): string {
  return [
    '## Executive Summary',
    '',
    aar.executiveSummaryMd.trim() || '_No executive summary yet._',
  ].join('\n')
}

function ratingCell(c: CapabilityAnalysis, rating: (typeof CAPABILITY_RATINGS)[number]): string {
  return c.rating === rating ? 'X' : ''
}

export function ratingsSection(aar: Aar, s: Scenario): string {
  const lines = [
    '## Analysis of Core Capabilities',
    '',
    'Aligning exercise objectives and core capabilities provides a consistent taxonomy for evaluation that transcends individual exercises to support preparedness reporting and trend analysis. The table below lists each objective and the core capability it exercised, with the rating the exercising organization confirmed.',
    '',
  ]
  const rows = aar.capabilities.flatMap((c) => {
    const objectives = capabilityObjectives(s, c)
    const names = objectives.length ? objectives.map((id) => objectiveLabel(s, id)) : ['—']
    return names.map((name) => [
      name,
      capabilityName(c.capability),
      ...CAPABILITY_RATINGS.map((r) => ratingCell(c, r)),
      c.rating ? '' : 'Rating pending',
    ])
  })
  lines.push(
    mdTable(['Objective', 'Core Capability', 'P', 'S', 'M', 'U', 'Status'], rows),
    '',
    'Ratings Definitions:',
    '',
    ...CAPABILITY_RATINGS.map(
      (r) => `- **${CAPABILITY_RATING_LABELS[r]} (${r}):** ${CAPABILITY_RATING_DEFINITIONS[r]}`,
    ),
  )
  return lines.join('\n')
}

function referenceLine(f: Finding): string {
  return f.citations.length ? `**Reference:** ${f.citations.map(planSectionLabel).join('; ')}` : ''
}

function findingBlock(kind: 'Strength' | 'Area for Improvement', f: Finding, n: number): string[] {
  const lines = [`#### ${kind} ${n}: ${f.title}`, '', f.analysisMd.trim(), '']
  const ref = referenceLine(f)
  if (ref) lines.push(ref, '')
  if (kind === 'Area for Improvement') {
    lines.push(`**Recommendation:** ${f.recommendation.trim() || '_To be written._'}`, '')
  }
  lines.push(`_Evidence: ${evidenceLabel(f.evidence) || 'none'}_`, '')
  return lines
}

function capabilityBlock(c: CapabilityAnalysis, s: Scenario): string[] {
  const lines = [`### ${capabilityName(c.capability)}`, '']
  const objectives = capabilityObjectives(s, c).map((id) => objectiveLabel(s, id))
  if (objectives.length) lines.push(`Objectives: ${objectives.join('; ')}`, '')
  lines.push(
    c.rating
      ? `Rating: **${CAPABILITY_RATING_LABELS[c.rating]} (${c.rating})**`
      : 'Rating: _Rating pending_',
    '',
  )
  if (c.ratingRationale.trim()) lines.push(c.ratingRationale.trim(), '')
  lines.push('**Strengths**', '')
  if (!c.strengths.length) lines.push('_No strengths recorded for this capability._', '')
  c.strengths.forEach((f, i) => lines.push(...findingBlock('Strength', f, i + 1)))
  lines.push('**Areas for Improvement**', '')
  if (!c.areasForImprovement.length)
    lines.push('_No areas for improvement recorded for this capability._', '')
  c.areasForImprovement.forEach((f, i) =>
    lines.push(...findingBlock('Area for Improvement', f, i + 1)),
  )
  return lines
}

export function findingsSection(aar: Aar, s: Scenario): string {
  if (!aar.capabilities.length) return '_No capabilities were analysed._'
  return aar.capabilities
    .flatMap((c) => capabilityBlock(c, s))
    .join('\n')
    .trim()
}

const IP_HEADER = [
  'Core Capability',
  'Issue/Area for Improvement',
  'Corrective Action',
  'Capability Element',
  'Primary Responsible Organization',
  'Organization POC',
  'Start Date',
  'Completion Date',
]

export function improvementPlanSection(aar: Aar, s: Scenario): string {
  const rows = improvementPlanRows(aar).map(({ capability, finding, action }) => [
    capabilityName(capability),
    finding.title,
    action.action,
    CAPABILITY_ELEMENT_LABELS[action.element],
    action.ownerOrganization || (action.ownerRole ? `[${roleLabel(s, action.ownerRole)}]` : ''),
    action.poc,
    action.startDate ?? '',
    action.dueDate ?? '',
  ])
  const lines = [
    '## Appendix A: Improvement Plan',
    '',
    'This Improvement Plan has been developed specifically for the exercising organization as a result of this exercise. A responsible organization in square brackets is the role the draft proposed; replace it with the organization and point of contact that own the action.',
    '',
  ]
  lines.push(rows.length ? mdTable(IP_HEADER, rows) : '_No corrective actions yet._')
  return lines.join('\n')
}

export function participantsSection(aar: Aar): string {
  const lines = ['## Appendix B: Exercise Participants', '']
  if (!aar.participatingOrganizations.length)
    lines.push('_List the participating organizations (organizations only, never people)._')
  else lines.push(...aar.participatingOrganizations.map((o) => `- ${o}`))
  return lines.join('\n')
}

export function feedbackSection(aar: Aar): string {
  return [
    '## Appendix C: Participant Feedback Summary',
    '',
    aar.participantFeedbackMd.trim() || '_No participant feedback summary yet._',
  ].join('\n')
}

/** Built-in terms plus the AAR's own, by term, the AAR's wording winning. */
export function allAcronyms(aar: Pick<Aar, 'acronyms'>): Acronym[] {
  const byTerm = new Map<string, Acronym>()
  for (const a of [...BUILT_IN_ACRONYMS, ...aar.acronyms]) byTerm.set(a.term.toUpperCase(), a)
  return [...byTerm.values()].sort((a, b) => a.term.localeCompare(b.term))
}

export function acronymsSection(aar: Aar): string {
  return [
    '## Appendix D: Acronyms',
    '',
    mdTable(
      ['Acronym', 'Meaning'],
      allAcronyms(aar).map((a) => [a.term, a.meaning]),
    ),
  ].join('\n')
}

function header(aar: Aar, s: Scenario, orgName: string): string {
  const status = aarStatus(aar) === 'draft' ? 'Draft (ratings pending)' : 'Reviewed'
  return [
    '# After-Action Report / Improvement Plan',
    `## ${s.title}${s.subtitle ? ` — ${s.subtitle}` : ''}`,
    '',
    `Exercise date: ${aar.exerciseDate ?? '[Date]'} · ${orgName || '[Organization]'} · Status: ${status}`,
    '',
    'This exercise is non-attributional: the report describes how plans and procedures worked, never how a person performed.',
  ].join('\n')
}

/** Whether Appendix C is part of the document (participant feedback was recorded). */
export const hasFeedback = (aar: Pick<Aar, 'sourcesUsed' | 'participantFeedbackMd'>): boolean =>
  aar.sourcesUsed.includes('surveys') || !!aar.participantFeedbackMd.trim()

/** The complete document from aar.json; `prose` keeps a person's edited prose sections. */
export function renderAarMarkdown(
  aar: Aar,
  s: Scenario,
  orgName: string,
  prose: Partial<Record<AarSection, string>> = {},
): string {
  const parts = [
    header(aar, s, orgName),
    wrapSection('overview', exerciseOverviewSection(aar, s, orgName)),
    wrapSection('summary', prose.summary ?? executiveSummarySection(aar)),
    wrapSection('ratings', ratingsSection(aar, s)),
    wrapSection('findings', prose.findings ?? findingsSection(aar, s)),
    wrapSection('ip', improvementPlanSection(aar, s)),
    wrapSection('participants', participantsSection(aar)),
    ...(hasFeedback(aar) ? [wrapSection('feedback', prose.feedback ?? feedbackSection(aar))] : []),
    wrapSection('acronyms', acronymsSection(aar)),
    '',
    '*End of After-Action Report / Improvement Plan*',
    '',
  ]
  return parts.join('\n\n')
}

/**
 * Re-render the table sections of an existing document from aar.json and keep the prose a
 * person edited (summary, findings, feedback). A document without markers is rebuilt.
 */
export function refreshAarMarkdown(
  markdown: string,
  aar: Aar,
  s: Scenario,
  orgName: string,
): string {
  if (!markdown.trim() || !sectionBody(markdown, 'ratings')) {
    const prose: Partial<Record<AarSection, string>> = {}
    for (const name of PROSE_SECTIONS) {
      const body = sectionBody(markdown, name)
      if (body) prose[name] = body
    }
    return renderAarMarkdown(aar, s, orgName, prose)
  }
  let out = markdown
  out = upsertSection(out, 'overview', exerciseOverviewSection(aar, s, orgName))
  out = upsertSection(out, 'ratings', ratingsSection(aar, s))
  out = upsertSection(out, 'ip', improvementPlanSection(aar, s))
  out = upsertSection(out, 'participants', participantsSection(aar))
  out = upsertSection(out, 'acronyms', acronymsSection(aar))
  return out
}
