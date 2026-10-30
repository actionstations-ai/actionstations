// Types for scripts/bench/judge.mjs.
export interface JudgeItem {
  id: string
  row: string
  passage: string
}
export interface CalibrationRow extends JudgeItem {
  score: number
}
export interface JudgeReply {
  score: number
  rowQuote: string
  passageQuote: string
}
export type JudgeCall = (messages: { role: string; content: string }[]) => Promise<string>
export interface JudgeBlock {
  model: string
  kappa: number | null
  calibrationRows: number
  published: boolean
  scores: Record<string, number>
}
export const MIN_CALIBRATION_ROWS: number
export const KAPPA_THRESHOLD: number
export const MAX_JUDGED_ROWS: number
export function parseJudgeRef(
  ref: string,
  baseUrl?: string,
  env?: Record<string, string | undefined>,
): { ref: string; tool: string; name: string; baseUrl?: string }
export function judgeRowsOf(scenario: { msel?: unknown[] }, limit?: number): JudgeItem[]
export function loadJudgePrompt(file?: string): string
export function buildJudgeMessages(
  item: JudgeItem,
  prompt: string,
): { role: string; content: string }[]
export function parseJudgeReply(text: string): JudgeReply | null
export function quotesHold(reply: JudgeReply, item: JudgeItem): boolean
export function weightedKappa(a: number[], b: number[]): number | null
export function loadCalibration(file?: string): CalibrationRow[]
export function localJudgeCall(model: {
  ref: string
  tool: string
  name: string
  baseUrl?: string
}): JudgeCall
export function judgeItems(
  items: JudgeItem[],
  call: JudgeCall,
  prompt: string,
): Promise<{ scored: { id: string; score: number }[]; discarded: number }>
export function runJudge(input: {
  model: string
  items: JudgeItem[]
  calibration: CalibrationRow[]
  call: JudgeCall
  prompt: string
}): Promise<JudgeBlock>
