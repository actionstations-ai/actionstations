// Shapes the benchmark scripts (#434) pass around; the scenario shapes are the parts of
// src/shared/schemas/scenario.ts the scorers read.
export interface CitationLike {
  documentId?: string
  headingPath?: string
}
export interface RowLike {
  id: string
  phaseId: string
  time: string
  from: string
  toRoleIds: string[]
  toLabel?: string
  event: string
  expectedAction: string
  purposeTag: string
  citations: CitationLike[]
}
export interface WarningLike {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  rowId?: string
  source?: 'lint' | 'critique'
  suggestion?: string
}
export interface StageRunLike {
  stage: string
  itemId?: string
  status: string
  startedAt: string
  finishedAt?: string
  error?: string
  repairAttempts?: number
  inputTokens?: number
  outputTokens?: number
  promptHash?: string
}
export interface ScenarioLike {
  title?: string
  brief?: { durationHours?: number }
  overview?: { coreSectionsTested?: CitationLike[] }
  phases: { id: string; index: number }[]
  roles: { id: string }[]
  msel: RowLike[]
  warnings: WarningLike[]
  provenance: StageRunLike[]
}
/** grounding:scenario's result: GroundingResult per item key ("row:I-07", …). */
export interface GroundingLike {
  items?: Record<string, { label: string }>
}
export interface IdeaLike {
  id?: string
  title: string
  hook: string
  threatFamily?: string
  sectionsExercised?: CitationLike[]
}
export interface SuiteCase {
  id: string
  example: string
  scenario?: string
  defects?: string
}
export interface Suite {
  suite: string
  suiteVersion: number
  description?: string
  repeats: number
  seeds: number[]
  contextLength: number
  ideationCount: number
  weights: {
    overall: Record<string, number>
    drafting: Record<string, number>
    citations: Record<string, number>
    structure: Record<string, number>
    ideation: Record<string, number>
    critique: Record<string, number>
  }
  thresholds: {
    lintCap: number
    paceBand: [number, number]
    distinctCosine: number
    noisePenaltyPer10Rows: number
    unstableRange: number
    floorTaskScore: number
    floorDraftingReliability: number
  }
  ideation: SuiteCase[]
  drafting: SuiteCase[]
  critique: SuiteCase[]
}
export interface Gold {
  source: string
  durationHours: number
  rows: number
  contentRows: number
  rowsPerHour: { overall: number; min: number; max: number }
  phases: { index: number; title: string; startMin: number; endMin: number; rows: number }[]
  tags: Record<string, number>
  groups: string[][]
  decisionPhases: number[]
}
export interface CaseScore {
  score: number
  parts: Record<string, number>
  details: Record<string, unknown>
}
