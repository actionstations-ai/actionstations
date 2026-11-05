// The animal disease toolkit's format rules (spec 0460 FR-4) as field lint rules. They read the
// structured fields of the toolkit's products, so a control area under the plan minimum, a
// monitored premises that was not at-risk, or a confirmation from a network laboratory goes back
// to the model with the issue named. Importing this module registers them (lint-rules.ts lists
// it). A rule with nothing structured to check reports nothing.
import { planOf } from '@shared/animal-disease/plan-rules'
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'
import {
  checkDepopulationWindow,
  checkDesignationChange,
  checkDesignationTerm,
  checkHpaiZoneSizes,
  checkLabSequence,
  checkSamplingInterval,
  type AnimalLintProblem,
  type ZoneEntry,
} from './lint'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const issues = (path: string, problems: AnimalLintProblem[]): FieldLintIssue[] =>
  problems.map((p) => ({ path, message: p.message }))

const designationTerms: FieldLintRule = {
  id: 'animal_designation_terms',
  injectTypes: [
    'animal_health_quarantine_order',
    'animal_movement_permit',
    'animal_premises_investigation',
  ],
  check(fields) {
    const out: FieldLintIssue[] = []
    if (typeof fields.designation === 'string')
      out.push(
        ...issues('fields.designation', checkDesignationTerm('designation', fields.designation)),
      )
    if (typeof fields.originDesignation === 'string')
      out.push(
        ...issues(
          'fields.originDesignation',
          checkDesignationTerm('originDesignation', fields.originDesignation),
        ),
      )
    if (Array.isArray(fields.premises))
      fields.premises.forEach((p, i) => {
        if (isRecord(p) && typeof p.designation === 'string')
          out.push(
            ...issues(
              `fields.premises[${i}].designation`,
              checkDesignationTerm('designation', p.designation),
            ),
          )
      })
    return out
  },
}

const designationChange: FieldLintRule = {
  id: 'animal_designation_change',
  injectTypes: ['animal_premises_investigation'],
  check(fields) {
    const from = str(fields.previousDesignation)
    const to = str(fields.designation)
    return from && to ? issues('fields.designation', checkDesignationChange(from, to)) : []
  },
}

const zoneSizes: FieldLintRule = {
  id: 'animal_zone_sizes',
  injectTypes: ['animal_health_quarantine_order'],
  check(fields) {
    if (planOf(fields.plan)?.id !== 'hpai' || !Array.isArray(fields.zones)) return []
    const zones = fields.zones.flatMap((z): ZoneEntry[] =>
      isRecord(z) && typeof z.kind === 'string' && typeof z.extentKm === 'number'
        ? [{ kind: z.kind, extentKm: z.extentKm }]
        : [],
    )
    return issues('fields.zones', checkHpaiZoneSizes(zones))
  },
}

const depopWindow: FieldLintRule = {
  id: 'animal_depop_window',
  injectTypes: ['animal_depop_plan'],
  check(fields) {
    const presumptiveMs = Date.parse(str(fields.presumptiveAtIso))
    const completeMs = Date.parse(str(fields.targetCompleteAtIso))
    if (Number.isNaN(presumptiveMs) || Number.isNaN(completeMs)) return []
    return issues(
      'fields.targetCompleteAt',
      checkDepopulationWindow({
        presumptiveMs,
        completeMs,
        delayReason: str(fields.delayReason),
      }),
    )
  },
}

const samplingInterval: FieldLintRule = {
  id: 'animal_sampling_interval',
  injectTypes: ['animal_premises_investigation'],
  check(fields) {
    if (planOf(fields.plan)?.id !== 'fmd' || typeof fields.samplingIntervalDays !== 'number')
      return []
    return issues(
      'fields.samplingIntervalDays',
      checkSamplingInterval(str(fields.designation), fields.samplingIntervalDays),
    )
  },
}

const labSequence: FieldLintRule = {
  id: 'animal_lab_sequence',
  injectTypes: ['animal_presumptive_notice'],
  check(fields) {
    return issues('fields.laboratory', checkLabSequence(str(fields.stage), str(fields.laboratory)))
  },
}

for (const r of [
  designationTerms,
  designationChange,
  zoneSizes,
  depopWindow,
  samplingInterval,
  labSequence,
])
  registerFieldLintRule(r)
