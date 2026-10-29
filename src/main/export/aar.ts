// View model for the After-Action Report / Improvement Plan (#419) in the HSEEP 2020 layout:
// Exercise Overview, Executive Summary, Analysis of Core Capabilities (rating table and legend,
// then strengths and areas for improvement per capability), Appendix A Improvement Plan
// (landscape), Appendix B Participants, Appendix C Participant Feedback, Appendix D Acronyms.
// Tables come from aar.json; the prose sections a person may have edited in documents/aar.md
// (summary, findings, feedback) are taken from the markdown when present. Only a confirmed
// rating is printed; a proposal is never shown as a rating. Strings stay raw; the template
// escapes them, and the markdown passes through the sanitizing renderer in ./escape.
import { capabilityName } from '@shared/core-capabilities'
import {
  aarStatus,
  CAPABILITY_ELEMENT_LABELS,
  CAPABILITY_RATING_DEFINITIONS,
  CAPABILITY_RATING_LABELS,
  CAPABILITY_RATINGS,
  improvementPlanRows,
  type Aar,
  type CapabilityAnalysis,
  type Finding,
} from '@shared/schemas/aar'
import type { Scenario } from '@shared/schemas/scenario'
import {
  allAcronyms,
  capabilityObjectives,
  evidenceLabel,
  evidenceSentence,
  hasFeedback,
  planSectionLabel,
  sectionBody,
} from '../aar/markdown'
import { documentBodyHtml, markdownToHtml } from './escape'
import type { ExportModel } from './model'
import { trusted } from './templates'
import { durationText, locationText, scenarioHeading, titleFacts } from './views'

function objectiveLabel(s: Scenario, id: string): string {
  const o = s.objectives.find((x) => x.id === id)
  return o ? o.name || o.text : id
}

function roleLabel(s: Scenario, roleId: string | undefined): string {
  if (!roleId) return ''
  const r = s.roles.find((x) => x.id === roleId)
  return r ? r.abbreviation || r.name : roleId
}

type ProseSection = 'summary' | 'findings' | 'feedback'

/**
 * A prose section of documents/aar.md without its own "## Executive Summary" heading (the
 * template prints that), or '' when the document has no such section.
 */
function proseMarkdown(model: ExportModel, name: ProseSection): string {
  const body = sectionBody(model.docs.aar, name)
  if (!body) return ''
  return body.replace(/^##\s[^\n]*\n+/, '').trim()
}

/** The same section as HTML; the findings keep their headings below the document's level 2. */
function proseHtml(model: ExportModel, name: ProseSection): string {
  const body = sectionBody(model.docs.aar, name)
  return body ? documentBodyHtml(body, 3) : ''
}

function overviewRows(aar: Aar, model: ExportModel): { label: string; value: string }[] {
  const s = model.scenario
  const capabilities = [...new Set(aar.capabilities.map((c) => capabilityName(c.capability)))]
  return [
    { label: 'Exercise Name', value: s.title + (s.subtitle ? ` — ${s.subtitle}` : '') },
    { label: 'Exercise Date', value: aar.exerciseDate ?? '____________' },
    {
      label: 'Scope',
      value: `Discussion-based tabletop exercise, ${durationText(s)}${locationText(s) ? `, at ${locationText(s)}` : ''}.`,
    },
    { label: 'Core Capabilities', value: capabilities.join('; ') || '—' },
    {
      label: 'Objectives',
      value: s.objectives.map((o) => (o.name ? `${o.name}: ${o.text}` : o.text)).join(' · ') || '—',
    },
    { label: 'Threat or Hazard', value: s.overview?.threat ?? '—' },
    { label: 'Scenario', value: s.overview?.theme || s.brief.userPrompt || '—' },
    {
      label: 'Sponsor',
      value: model.conduct.sponsor || model.project.orgName || model.project.name,
    },
    { label: 'Participating Organizations', value: 'See Appendix B' },
    { label: 'Point of Contact', value: '[Name, title, organization, phone, email]' },
  ]
}

function ratingRows(aar: Aar, s: Scenario) {
  return aar.capabilities.flatMap((c) => {
    const objectives = capabilityObjectives(s, c).map((id) => objectiveLabel(s, id))
    return (objectives.length ? objectives : ['—']).map((objective) => ({
      objective,
      capability: capabilityName(c.capability),
      marks: CAPABILITY_RATINGS.map((r) => ({ rating: r, marked: c.rating === r })),
      pending: !c.rating,
    }))
  })
}

function findingView(f: Finding, kind: 'strength' | 'improvement', n: number) {
  return {
    n,
    title: f.title,
    analysisMd: f.analysisMd,
    analysisHtml: trusted(markdownToHtml(f.analysisMd)),
    reference: f.citations.map(planSectionLabel).join('; '),
    recommendation: kind === 'improvement' ? f.recommendation : '',
    actions: f.correctiveActions.map((a) => ({
      action: a.action,
      element: CAPABILITY_ELEMENT_LABELS[a.element],
    })),
    evidence: evidenceLabel(f.evidence) || 'none',
  }
}

function capabilityView(c: CapabilityAnalysis, s: Scenario, i: number, prefix: string) {
  return {
    id: `${prefix}aar-cap-${i}`,
    capability: capabilityName(c.capability),
    objectives: capabilityObjectives(s, c).map((id) => objectiveLabel(s, id)),
    rating: c.rating ? `${CAPABILITY_RATING_LABELS[c.rating]} (${c.rating})` : '',
    rationale: c.ratingRationale,
    strengths: c.strengths.map((f, n) => findingView(f, 'strength', n + 1)),
    areas: c.areasForImprovement.map((f, n) => findingView(f, 'improvement', n + 1)),
  }
}

export function improvementPlanView(aar: Aar, s: Scenario) {
  return improvementPlanRows(aar).map(({ capability, finding, action }) => ({
    capability: capabilityName(capability),
    issue: finding.title,
    action: action.action,
    element: CAPABILITY_ELEMENT_LABELS[action.element],
    organization:
      action.ownerOrganization || (action.ownerRole ? `[${roleLabel(s, action.ownerRole)}]` : ''),
    poc: action.poc,
    startDate: action.startDate ?? '',
    dueDate: action.dueDate ?? '',
  }))
}

export const NO_AAR_MESSAGE =
  'No After-Action Report yet. Draft it from the Facilitate screen after the exercise.'

/** An AAR with nothing in it, so a scenario without a draft still gets a well-formed view. */
const EMPTY_AAR: Aar = {
  formatVersion: 1,
  createdAt: '1970-01-01T00:00:00.000Z',
  updatedAt: '1970-01-01T00:00:00.000Z',
  executiveSummaryMd: '',
  sourcesUsed: [],
  capabilities: [],
  participantFeedbackMd: '',
  participatingOrganizations: [],
  acronyms: [],
  provenance: [],
}

/**
 * The view the template and the Word export render. `missing` is the message shown instead
 * of the report when no draft exists yet; every other field is then empty.
 */
export function aarView(model: ExportModel, prefix = '') {
  const s = model.scenario
  const aar = model.aar ?? EMPTY_AAR
  const missing = model.aar ? '' : NO_AAR_MESSAGE
  const status = aarStatus(aar) === 'draft' ? 'Draft (ratings pending)' : 'Reviewed'
  const summaryMd = proseMarkdown(model, 'summary') || aar.executiveSummaryMd
  const findingsMd = proseMarkdown(model, 'findings')
  const findingsHtml = proseHtml(model, 'findings')
  const feedbackMd = hasFeedback(aar)
    ? proseMarkdown(model, 'feedback') || aar.participantFeedbackMd
    : ''
  return {
    prefix,
    missing,
    title: {
      id: `${prefix}aar-title`,
      eyebrow: 'After-Action Report / Improvement Plan',
      heading: scenarioHeading(model),
      sub: s.subtitle ?? '',
      facts: missing
        ? titleFacts(model, [])
        : titleFacts(model, [
            ['Exercise date', aar.exerciseDate ?? '____________'],
            ['Status', status],
          ]),
    },
    draft: !missing && aarStatus(aar) === 'draft',
    overview: overviewRows(aar, model),
    evidence: evidenceSentence(aar),
    summaryMd,
    summaryHtml: trusted(markdownToHtml(summaryMd)),
    ratings: ratingRows(aar, s),
    legend: CAPABILITY_RATINGS.map((r) => ({
      code: r,
      label: CAPABILITY_RATING_LABELS[r],
      definition: CAPABILITY_RATING_DEFINITIONS[r],
    })),
    /** The person's edited findings prose, when the document has it; else `capabilities`. */
    findingsMd,
    findingsHtml: findingsHtml ? trusted(findingsHtml) : '',
    capabilities: findingsHtml
      ? []
      : aar.capabilities.map((c, i) => capabilityView(c, s, i, prefix)),
    plan: improvementPlanView(aar, s),
    // Appendix B: the AAR's own list, else the organizations filed with the exercise details (#420).
    organizations: aar.participatingOrganizations.length
      ? aar.participatingOrganizations
      : model.conduct.participatingOrganizations,
    feedbackMd,
    feedbackHtml: feedbackMd ? trusted(markdownToHtml(feedbackMd)) : '',
    hasFeedback: hasFeedback(aar),
    acronyms: allAcronyms(aar),
    endNote: 'End of After-Action Report / Improvement Plan',
  }
}
export type AarView = ReturnType<typeof aarView>
