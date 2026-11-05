// Format checks for flood products (spec 0454 FR-4). Pure functions over plain data; the
// toolkit names them by id (`lintRules` in packs/toolkits/flooding.json). Sources: NWS Manual
// 10-950 (flood categories) and NWS Instruction 10-922 (flash flood tags, product tiers).

export interface FloodLintIssue {
  rule: 'flood_categories' | 'flash_flood_tags' | 'flood_product_order' | 'stage_units'
  message: string
}

/** Stages in feet at which a forecast point's categories begin; any may be absent. */
export interface CategoryTable {
  action?: number
  flood?: number
  minor?: number
  moderate?: number
  major?: number
}

export type FloodCategory = 'none' | 'action' | 'minor' | 'moderate' | 'major'

/** The category a stage falls in for this point, using only the thresholds the point has. */
export function categoryAtStage(table: CategoryTable, stage: number): FloodCategory {
  if (table.major !== undefined && stage >= table.major) return 'major'
  if (table.moderate !== undefined && stage >= table.moderate) return 'moderate'
  if (table.minor !== undefined && stage >= table.minor) return 'minor'
  if (table.action !== undefined && stage >= table.action) return 'action'
  return 'none'
}

/** A claim such as "major flooding at 17.8 ft" checked against the point's own table. */
export function lintCategoryClaim(
  table: CategoryTable,
  stage: number,
  claimed: Exclude<FloodCategory, 'none'>,
): FloodLintIssue[] {
  if (claimed !== 'action' && table[claimed] === undefined)
    return [
      {
        rule: 'flood_categories',
        message: `This point has no ${claimed} category; a category that is not defined cannot be forecast.`,
      },
    ]
  const actual = categoryAtStage(table, stage)
  if (actual === claimed) return []
  return [
    {
      rule: 'flood_categories',
      message: `${stage} ft is ${actual === 'none' ? 'below every category' : actual} at this point, not ${claimed}.`,
    },
  ]
}

export type FlashFloodTag = 'base' | 'considerable' | 'catastrophic'

export interface FlashFloodWarning {
  tag: FlashFloodTag
  /** The warning text, to look for flash flood emergency language. */
  text: string
  /** Whether a Wireless Emergency Alert was sent for it. */
  wea?: boolean
}

/** Tag rules: CATASTROPHIC only with emergency language; WEA only for CONSIDERABLE and CATASTROPHIC. */
export function lintFlashFloodWarning(w: FlashFloodWarning): FloodLintIssue[] {
  const issues: FloodLintIssue[] = []
  const emergency = /flash flood emergency/i.test(w.text)
  if (w.tag === 'catastrophic' && !emergency)
    issues.push({
      rule: 'flash_flood_tags',
      message: 'A CATASTROPHIC tag is used only with flash flood emergency language.',
    })
  if (w.tag !== 'catastrophic' && emergency)
    issues.push({
      rule: 'flash_flood_tags',
      message: 'Flash flood emergency language goes with the CATASTROPHIC tag.',
    })
  if (w.wea && w.tag === 'base')
    issues.push({
      rule: 'flash_flood_tags',
      message:
        'A Wireless Emergency Alert goes out only for CONSIDERABLE or CATASTROPHIC warnings.',
    })
  return issues
}

type ProductKind = 'outlook' | 'watch' | 'warning'
export interface FloodProduct {
  kind: ProductKind
  /** ISO time of issuance. */
  issuedAt: string
}

/** Outlook before watch before warning, for the products of one event that are all present. */
export function lintProductOrder(products: readonly FloodProduct[]): FloodLintIssue[] {
  const issues: FloodLintIssue[] = []
  const first = (k: FloodProduct['kind']): number =>
    Math.min(...products.filter((p) => p.kind === k).map((p) => Date.parse(p.issuedAt)))
  for (const [a, b] of [
    ['outlook', 'watch'],
    ['watch', 'warning'],
  ] as const) {
    const ta = first(a)
    const tb = first(b)
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta > tb)
      issues.push({
        rule: 'flood_product_order',
        message: `The first ${a} is issued after the first ${b}; products run outlook, watch, warning.`,
      })
  }
  return issues
}

const STAGE_NUMBER =
  /\bstage\b[^.\d\n]{0,20}?(\d+(?:\.\d+)?)(?![\d.])(?!\s?(?:ft\b|feet\b|foot\b|'|cfs\b|kcfs\b|days?\b|hours?\b|hrs?\b|minutes?\b|inch|in\b|mph\b|percent|%))/gi

/** A stage number with no unit ("river stage of 14.2") is flagged; feet or ft is required. */
export function lintStageUnits(text: string): FloodLintIssue[] {
  return [...text.matchAll(STAGE_NUMBER)].map((m) => ({
    rule: 'stage_units' as const,
    message: `Stage ${m[1]} has no unit; write feet (ft) and name the gauge.`,
  }))
}
