// Regulatory reporting clocks and control frameworks (#426, spec 0426, ADR-0040). Both are pack
// data, not code: `regulations/<id>.json` and `frameworks/<id>.json` in a pack (format version
// 2, docs/packs-format.md). Pure zod, no Node imports: the renderer, main and scripts use it.
//
// Pack data is untrusted: every list and string is capped, keywords are plain words (no regex),
// URLs are http(s) and the cross-checks below refuse dangling references and clock cycles.
import { z } from 'zod'
import { ThreatFamilyId } from '../domains/schema'
import { PurposeTag } from '../taxonomy'
import { HttpUrl, SafeId } from './common'

/** Regulation, framework, trigger and clock ids (file names in a pack). */
export const ComplianceId = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'Invalid id')
/** A calendar date "YYYY-MM-DD". */
export const IsoDate = z.iso.date()

export const DurationUnit = z.enum(['minutes', 'hours', 'calendar_days', 'business_days', 'months'])
export type DurationUnit = z.infer<typeof DurationUnit>

/** "clock:<clockId>": the term counts from that clock's completion (the filing). */
export const CLOCK_REF_PREFIX = 'clock:'

export const ClockTerm = z.object({
  /** A trigger id, or "clock:<clockId>" (that clock's completion). */
  from: z.string().min(1).max(80),
  amount: z.number().positive().max(10_000),
  unit: DurationUnit,
})
export type ClockTerm = z.infer<typeof ClockTerm>

export const RegulationClock = z.object({
  id: ComplianceId,
  /** "Initial notification" */
  label: z.string().min(1).max(200),
  /** "CISA", "SEC (EDGAR)", "Competent authority / CSIRT" */
  recipient: z.string().max(200).default(''),
  /** Due at the earliest of these terms (a single term in most regulations). */
  dueAt: z.array(ClockTerm).min(1).max(4),
  /** Plain text the facilitator sees: "Without undue delay and where feasible within…". */
  rule: z.string().max(600).default(''),
  /** Templates whose injects suit the filing (e.g. regulatory_report_form). */
  injectTypes: z.array(z.string().max(64)).max(20).default([]),
})
export type RegulationClock = z.infer<typeof RegulationClock>

export const ComplianceSource = z.object({ title: z.string().min(1).max(300), url: HttpUrl })

export const RegulationStatus = z.enum(['in_force', 'proposed', 'guidance', 'superseded'])
export type RegulationStatus = z.infer<typeof RegulationStatus>

export const BusinessCalendar = z.enum(['us_federal', 'weekdays', 'none'])
export type BusinessCalendar = z.infer<typeof BusinessCalendar>

export const RegulationTrigger = z.object({
  id: ComplianceId,
  label: z.string().min(1).max(200),
  hint: z.string().max(600).default(''),
})

export const RegulationShape = z.object({
  id: ComplianceId,
  /** "SEC Form 8-K Item 1.05" */
  label: z.string().min(1).max(200),
  /** "US", "EU", "US-CA" */
  jurisdiction: z.string().min(1).max(40),
  authority: z.string().min(1).max(200),
  /** "17 CFR 229.106; Form 8-K Item 1.05" */
  citation: z.string().min(1).max(300),
  sources: z.array(ComplianceSource).min(1).max(10),
  status: RegulationStatus,
  statusNote: z.string().max(1000).default(''),
  /** When a person last checked the values against the sources. */
  verifiedOn: IsoDate,
  calendar: BusinessCalendar.default('none'),
  triggers: z.array(RegulationTrigger).min(1).max(8),
  clocks: z.array(RegulationClock).min(1).max(8),
  /** Framework controls a met clock is evidence for: "nist_csf_2:RS.CO-03". */
  controls: z.array(z.string().max(120)).max(50).default([]),
  appliesTo: z
    .object({
      threatFamilies: z.array(ThreatFamilyId).max(10).default([]),
      note: z.string().max(600).default(''),
    })
    .default({ threatFamilies: [], note: '' }),
})

type Ctx = z.RefinementCtx

/** Ids are unique within a list. */
function uniqueIds(list: { id: string }[], path: (string | number)[], ctx: Ctx): void {
  const seen = new Set<string>()
  for (const [i, x] of list.entries()) {
    if (seen.has(x.id))
      ctx.addIssue({ code: 'custom', path: [...path, i, 'id'], message: `Duplicate id "${x.id}"` })
    seen.add(x.id)
  }
}

/**
 * Every term's `from` names a trigger or an EARLIER clock (so there is never a cycle): a clock
 * can count only from triggers and clocks listed above it.
 */
function checkTerms(r: z.infer<typeof RegulationShape>, ctx: Ctx): void {
  const triggers = new Set(r.triggers.map((t) => t.id))
  const earlier = new Set<string>()
  for (const [ci, clock] of r.clocks.entries()) {
    for (const [ti, term] of clock.dueAt.entries()) {
      const ref = term.from.startsWith(CLOCK_REF_PREFIX)
        ? term.from.slice(CLOCK_REF_PREFIX.length)
        : undefined
      const ok = ref === undefined ? triggers.has(term.from) : earlier.has(ref)
      if (!ok)
        ctx.addIssue({
          code: 'custom',
          path: ['clocks', ci, 'dueAt', ti, 'from'],
          message:
            ref === undefined
              ? `"${term.from}" is not a trigger of this regulation`
              : `"${term.from}" must name a clock listed before "${clock.id}" (no cycles)`,
        })
    }
    earlier.add(clock.id)
  }
}

/** One regulation: reporting obligations with one or more clocks (pack `regulations/<id>.json`). */
export const Regulation = RegulationShape.superRefine((r, ctx) => {
  uniqueIds(r.triggers, ['triggers'], ctx)
  uniqueIds(r.clocks, ['clocks'], ctx)
  checkTerms(r, ctx)
  for (const [i, c] of r.controls.entries())
    if (!isControlRef(c))
      ctx.addIssue({
        code: 'custom',
        path: ['controls', i],
        message: `"${c}" is not "<frameworkId>:<controlId>"`,
      })
})
export type Regulation = z.infer<typeof Regulation>

export const Control = z.object({
  /** "RS.CO-02", "21.2.b", "Art.19" */
  id: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9 .()_-]*$/, 'Invalid control id'),
  /** The parent in the hierarchy: "RS.CO" for "RS.CO-02", "RS" for "RS.CO". */
  parent: z.string().max(40).optional(),
  title: z.string().min(1).max(300),
  summary: z.string().max(1000).default(''),
})
export type Control = z.infer<typeof Control>

/** "<regulationId>:<triggerId>" (a mapping rule's trigger match). */
const TriggerRef = z.string().regex(/^[a-z][a-z0-9_]{0,63}:([a-z][a-z0-9_]{0,63}|\*)$/)

export const MappingRule = z.object({
  controls: z.array(z.string().max(40)).min(1).max(20),
  purposeTags: z.array(PurposeTag).max(20).default([]),
  injectTypes: z.array(z.string().max(64)).max(40).default([]),
  threatFamilies: z.array(ThreatFamilyId).max(10).default([]),
  /** "<regulationId>:<triggerId>", or "*:*" for a trigger of any regulation. */
  triggers: z
    .array(z.union([TriggerRef, z.literal('*:*')]))
    .max(20)
    .default([]),
  /** Plain lowercase words, no regex: a rule matches when the row text contains one. */
  keywords: z
    .array(
      z
        .string()
        .min(2)
        .max(60)
        .regex(/^[a-z0-9][a-z0-9 '-]*$/, 'Keywords are plain lowercase words'),
    )
    .max(30)
    .default([]),
})
export type MappingRule = z.infer<typeof MappingRule>

export const FrameworkShape = z.object({
  id: ComplianceId,
  label: z.string().min(1).max(200),
  /** Short name for tabs and spreadsheet sheets ("NIST CSF 2.0"); the label when absent. */
  shortLabel: z.string().min(1).max(31).optional(),
  version: z.string().min(1).max(40),
  publisher: z.string().min(1).max(200),
  /** SPDX or LicenseRef */
  license: z.string().min(1).max(200),
  sources: z.array(ComplianceSource).min(1).max(10),
  verifiedOn: IsoDate,
  /** ["Function", "Category", "Subcategory"] */
  levels: z.array(z.string().min(1).max(60)).min(1).max(4),
  controls: z.array(Control).min(1).max(2000),
  rules: z.array(MappingRule).max(500).default([]),
})

/** A control catalog with mapping rules (pack `frameworks/<id>.json`). */
export const Framework = FrameworkShape.superRefine((f, ctx) => {
  uniqueIds(f.controls, ['controls'], ctx)
  const ids = new Set(f.controls.map((c) => c.id))
  for (const [i, c] of f.controls.entries())
    if (c.parent !== undefined && !ids.has(c.parent))
      ctx.addIssue({
        code: 'custom',
        path: ['controls', i, 'parent'],
        message: `parent "${c.parent}" is not a control of this framework`,
      })
  for (const [ri, rule] of f.rules.entries())
    for (const [ci, id] of rule.controls.entries())
      if (!ids.has(id))
        ctx.addIssue({
          code: 'custom',
          path: ['rules', ri, 'controls', ci],
          message: `"${id}" is not a control of this framework`,
        })
})
export type Framework = z.infer<typeof Framework>

/** "<frameworkId>:<controlId>" */
export function isControlRef(ref: string): boolean {
  const i = ref.indexOf(':')
  return i > 0 && ComplianceId.safeParse(ref.slice(0, i)).success && ref.length - i > 1
}

export function splitControlRef(ref: string): { frameworkId: string; controlId: string } {
  const i = ref.indexOf(':')
  return { frameworkId: ref.slice(0, i), controlId: ref.slice(i + 1) }
}

/** Shown on every regulation card, the settings list and every export (spec NFR-5). */
export const NOT_LEGAL_ADVICE =
  'Exercise aid, not legal advice. Check the current rule and your counsel.'

export const REGULATION_STATUS_LABEL: Record<RegulationStatus, string> = {
  in_force: 'In force',
  proposed: 'Proposed rule',
  guidance: 'Guidance',
  superseded: 'Superseded',
}

/** A regulation's display label, with "(proposed)" when the deadline is from a proposed rule. */
export const regulationLabel = (r: Pick<Regulation, 'label' | 'status'>): string =>
  r.status === 'proposed' ? `${r.label} (proposed)` : r.label

/** Per-project switches (project.json `compliance`); a missing id means the profile's default. */
export const ProjectCompliance = z.object({
  regulations: z.record(z.string(), z.boolean()).default({}),
  frameworks: z.record(z.string(), z.boolean()).default({}),
})
export type ProjectCompliance = z.infer<typeof ProjectCompliance>

// ---- facilitator session state (facilitator.json `compliance`, spec 0426 §1) -------------

/** A floating local date-time "2026-10-28T09:40" (no offset; src/shared/compliance/scenario-time.ts). */
export const LocalDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, 'Expected YYYY-MM-DDTHH:MM')

/** How a trigger fired: a delivered MSEL row, the facilitator by hand, or a live-play controller. */
export const FiredBy = z.enum(['row', 'manual', 'live'])

export const FiredTrigger = z.object({
  id: SafeId,
  regulationId: ComplianceId,
  triggerId: ComplianceId,
  /** Exercise minutes when it fired (the clocks count from here; time jumps move "now"). */
  exerciseMin: z.number().min(-100_000).max(1_000_000),
  /** The scenario date-time it stood for, as shown to the facilitator. */
  scenarioAt: LocalDateTime,
  by: FiredBy,
  rowId: z.string().max(40).optional(),
  note: z.string().max(2000).default(''),
})
export type FiredTrigger = z.infer<typeof FiredTrigger>

/** What the facilitator recorded for one clock: filed (met), missed or waived. */
export const ClockCompletion = z.object({
  status: z.enum(['met', 'missed', 'waived']),
  /** Exercise minutes of the filing (met) or of the decision. */
  exerciseMin: z.number().min(-100_000).max(1_000_000).optional(),
  scenarioAt: LocalDateTime.optional(),
  note: z.string().max(2000).default(''),
})
export type ClockCompletion = z.infer<typeof ClockCompletion>

/** "<regulationId>:<clockId>" */
export const clockKey = (regulationId: string, clockId: string): string =>
  `${regulationId}:${clockId}`

export const ComplianceSession = z.object({
  fired: z.array(FiredTrigger).max(500).default([]),
  /** Keyed "<regulationId>:<clockId>". */
  clocks: z.record(z.string().max(140), ClockCompletion).default({}),
  /** Clock keys shown on the presentation screen (off by default). */
  onScreen: z.array(z.string().max(140)).max(20).default([]),
})
export type ComplianceSession = z.infer<typeof ComplianceSession>

const EMPTY_SESSION: ComplianceSession = { fired: [], clocks: {}, onScreen: [] }
/** The compliance part of a facilitator state (absent until a trigger first fires). */
export const sessionOf = (s: { compliance?: ComplianceSession | undefined }): ComplianceSession =>
  s.compliance ?? EMPTY_SESSION
