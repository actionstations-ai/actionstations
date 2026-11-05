// Safeguards for sensitive content (spec 0464 FR-13): a toolkit can carry a content notice, a
// facilitator wellbeing check and a "stop and step out" rule. They are shown at the briefing,
// in the Exercise Plan and in the controller/evaluator handbook when the scenario has one of the
// toolkit's topics. Pure functions over parsed toolkits, so main and the tests share them.
import type { Toolkit } from './schema'

export interface SafeguardNotice {
  /** Toolkit ids whose safeguards apply. */
  toolkitIds: string[]
  /** One notice paragraph per toolkit. */
  contentNotices: string[]
  /** Lines a facilitator says or asks, in order, without repeats. */
  wellbeingCheck: string[]
  /** What any participant or facilitator may do to pause and step out. */
  stopAndStepOut: string[]
}

/** The trigger words of a toolkit's safeguards that appear in `text`. */
export function safeguardTopics(toolkit: Toolkit, text: string): string[] {
  const s = toolkit.safeguards
  if (!s) return []
  const haystack = text.toLowerCase()
  return s.triggers.filter((t) => haystack.includes(t.toLowerCase()))
}

/**
 * The safeguards that apply to a scenario: those of the toolkits that are on whose trigger words
 * appear in `text` (brief, objectives and MSEL text). Undefined when none apply.
 */
export function safeguardNotice(
  toolkits: readonly Toolkit[],
  text: string,
): SafeguardNotice | undefined {
  const hits = toolkits.filter((t) => safeguardTopics(t, text).length > 0)
  if (!hits.length) return undefined
  const uniq = (xs: string[]) => [...new Set(xs)]
  return {
    toolkitIds: hits.map((t) => t.id),
    contentNotices: uniq(hits.map((t) => t.safeguards!.contentNotice)),
    wellbeingCheck: uniq(hits.flatMap((t) => t.safeguards!.wellbeingCheck)),
    stopAndStepOut: uniq(hits.map((t) => t.safeguards!.stopAndStepOut)),
  }
}

/** The notice as Markdown for the front of the player briefing. */
export function contentNoticeMarkdown(notice: SafeguardNotice): string {
  return ['## Content notice', '', ...notice.contentNotices, '', ...notice.stopAndStepOut].join(
    '\n',
  )
}
