// The HSEEP document set (#420): Exercise Plan, Situation Manual (facilitator and player
// editions) and the Controller/Evaluator Handbook in HSEEP order. Each is a list of blocks that
// documents.ts renders to HTML (PDF and preview) and hseep/docx.ts renders to Word.
import type { ExportModel } from '../model'
import type { Block } from './blocks'
import { explanBlocks } from './explan'
import { handbookHseepBlocks } from './handbook'
import { sitmanBlocks } from './sitman'

export const HSEEP_DOCS = ['explan', 'sitman', 'sitman_player', 'handbook_hseep'] as const
export type HseepDoc = (typeof HSEEP_DOCS)[number]

export const isHseepDoc = (doc: string): doc is HseepDoc =>
  (HSEEP_DOCS as readonly string[]).includes(doc)

/** Title-block eyebrow of each document. */
export const HSEEP_EYEBROWS: Record<HseepDoc, string> = {
  explan: 'Exercise Plan (ExPlan)',
  sitman: 'Situation Manual (SitMan) · Facilitator Edition',
  sitman_player: 'Situation Manual (SitMan) · Player Edition',
  handbook_hseep: 'Controller and Evaluator (C/E) Handbook',
}

const END_NOTES: Record<HseepDoc, string> = {
  explan: 'End of Exercise Plan',
  sitman: 'End of Situation Manual',
  sitman_player: 'End of Situation Manual',
  handbook_hseep: 'End of Controller and Evaluator Handbook',
}

export const hseepEndNote = (doc: HseepDoc): string => END_NOTES[doc]

export function hseepBlocks(model: ExportModel, doc: HseepDoc): Block[] {
  switch (doc) {
    case 'explan':
      return explanBlocks(model)
    case 'sitman':
      return sitmanBlocks(model, 'facilitator')
    case 'sitman_player':
      return sitmanBlocks(model, 'player')
    case 'handbook_hseep':
      return handbookHseepBlocks(model)
  }
}

export { FILL_IN, headingsOf, textOf, type Block } from './blocks'
export { exerciseOverviewFacts, scheduleRows, participantRows, acronymRows } from './common'
export { assumptionsOrDefault, exerciseName, markingOf } from './common'
