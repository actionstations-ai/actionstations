// The tracker's flags for the page (spec 0428 FR-13): evaluated on every clock tick, announced
// once each, and the facilitator's notes scanned for promises when they change.
import { useEffect, useMemo, useRef } from 'react'
import { subscribe } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import type { FacilitatorState } from '@shared/ipc'
import { detectCommitments, parseClockTime, suggestionId } from '@shared/facilitator/commitments'
import {
  addSuggestions,
  evaluate,
  markAnswered,
  type Flag,
  type SessionEntry,
} from '@shared/facilitator/tracker'
import { exerciseMinutes } from '@shared/schemas/common'
import type { Scenario } from '@shared/schemas/scenario'
import type { UpdateState } from './use-delivery-actions'

const FEED_TICK_MS = 30_000
const NO_FEED = { live: false, session: [], messages: [], fetchedAt: 0 } as const

/** The running live session's receipts, answers and message text (empty without a session). */
export function useLiveFeed(projectPath: string, scenarioId: string) {
  const req = useMemo(() => ({ projectPath, scenarioId }), [projectPath, scenarioId])
  const query = useIpcQuery('live:tracker-feed', req, { refetchInterval: FEED_TICK_MS })
  useEffect(
    () =>
      subscribe('live:changed', () => {
        void queryClient.invalidateQueries({ queryKey: ['live:tracker-feed'] })
      }),
    [],
  )
  // `fetchedAt` is the clock for the "not opened" rule: the feed refreshes every 30 s.
  return query.data ? { ...query.data, fetchedAt: query.dataUpdatedAt } : NO_FEED
}

/** The flags open at this minute. */
export function useFlags(
  scenario: Scenario,
  state: FacilitatorState,
  minutes: number,
  session?: readonly SessionEntry[],
  nowMs?: number,
): Flag[] {
  const { msel, phases } = scenario
  // Whole minutes are enough: every rule works in minutes, so the list changes at most once a minute.
  const minute = Math.floor(minutes)
  return useMemo(
    () =>
      evaluate({
        msel,
        phases,
        state,
        minutes: minute,
        ...(session?.length && nowMs ? { session, nowMs } : {}),
      }),
    [msel, phases, state, minute, session, nowMs],
  )
}

/** Announce each flag once, when it first appears (WCAG 4.1.3; never repeated). */
export function useAnnounceFlags(flags: Flag[], announce: (text: string) => void): void {
  const seen = useRef<Set<string> | undefined>(undefined)
  useEffect(() => {
    if (!seen.current) {
      // Flags already open when the page loads are listed, not announced.
      seen.current = new Set(flags.map((f) => f.id))
      return
    }
    const fresh = flags.filter((f) => f.level === 'warn' && !seen.current!.has(f.id))
    for (const f of flags) seen.current.add(f.id)
    if (fresh.length)
      announce(
        fresh.length === 1
          ? `Tracker: ${fresh[0]!.text}`
          : `Tracker: ${fresh.length} new items need attention`,
      )
  }, [flags, announce])
}

const SCAN_DELAY_MS = 1500

const startWallMin = (scenario: Scenario): number | undefined =>
  scenario.brief.startWallClock ? exerciseMinutes(scenario.brief.startWallClock) : undefined

/** Scenario "10:30" or "+20" typed for a due time, as exercise minutes. */
export function parseDue(text: string, nowMin: number, scenario: Scenario): number | undefined {
  const t = text.trim()
  if (!t) return undefined
  const plus = /^\+(\d{1,3})$/.exec(t)
  if (plus) return nowMin + Number(plus[1])
  const wall = parseClockTime(`by ${t}`)
  if (wall === undefined) return undefined
  const start = startWallMin(scenario)
  if (start === undefined) return wall
  return (((wall - start) % 1440) + 1440) % 1440
}

type StaleNote = readonly [key: string, text: string, rowId?: string]

/** Add suggestions for the promises in `stale` notes and remember that they were read. */
function scanNotes(
  s: FacilitatorState,
  stale: StaleNote[],
  minutes: number,
  scenario: Scenario,
  source: 'note' | 'message' = 'note',
): FacilitatorState {
  const wall = startWallMin(scenario)
  let next = s
  for (const [key, text, rowId] of stale) {
    const found = detectCommitments(text, minutes, {
      source,
      sourceRef: key,
      ...(rowId ? { rowId } : source === 'note' && key !== 'general' ? { rowId: key } : {}),
      ...(wall !== undefined ? { startWallMin: wall } : {}),
    })
    next = addSuggestions(next, found)
    const tracker = next.tracker!
    next = {
      ...next,
      tracker: { ...tracker, scanned: { ...tracker.scanned, [key]: suggestionId('n', text) } },
    }
  }
  return next
}

/**
 * Look for promises in the row notes and the general notes whenever they change. A note is read
 * once per text; suggestions wait for the facilitator to accept or dismiss them.
 */
export function useNoteScan(
  scenario: Scenario,
  state: FacilitatorState,
  minutes: number,
  update: UpdateState,
): void {
  const { notes, generalNotes } = state
  const scanned = state.tracker?.scanned
  const minute = Math.floor(minutes)
  useEffect(() => {
    const items: StaleNote[] = [...Object.entries(notes), ['general', generalNotes]]
    const stale = items.filter(
      ([key, text]) => text.trim() && scanned?.[key] !== suggestionId('n', text),
    )
    if (stale.length === 0) return
    // Wait for typing to pause, so a half-written sentence is not read.
    const timer = setTimeout(
      () => update((s) => scanNotes(s, stale, minute, scenario), { debounce: true }),
      SCAN_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [notes, generalNotes, scanned, minute, scenario, update])
}

/**
 * Look for promises in what devices send during a live session (spec 0428 task 7). Each message
 * is read once; suggestions wait for the facilitator, like those from notes.
 */
export function useMessageScan(
  scenario: Scenario,
  state: FacilitatorState,
  minutes: number,
  update: UpdateState,
  messages: readonly { messageId: string; text: string; rowId?: string }[],
): void {
  const scanned = state.tracker?.scanned
  const minute = Math.floor(minutes)
  useEffect(() => {
    const stale: StaleNote[] = messages
      .filter((m) => scanned?.[`msg:${m.messageId}`] !== suggestionId('n', m.text))
      .map((m) => [`msg:${m.messageId}`, m.text, m.rowId])
    if (stale.length === 0) return
    update((s) => scanNotes(s, stale, minute, scenario, 'message'), { debounce: true })
  }, [messages, scanned, minute, scenario, update])
}

/** The moment recorded with an answer. */
export const answerStamp = (minutes: number) => ({
  iso: new Date().toISOString(),
  exerciseMin: Math.floor(minutes),
})

/** Mark a row answered at the current minute (the `A` shortcut). */
export function answerNow(s: FacilitatorState, rowId: string, minutes: number): FacilitatorState {
  return markAnswered(s, rowId, answerStamp(minutes))
}

/** What the facilitator can say to the table about a flag (read aloud; never sent to players). */
export function nudgeText(flag: Flag, scenario: Scenario): string {
  const row = scenario.msel.find((r) => r.id === flag.rowId)
  if (flag.rule === 'T1' && row)
    return `Reminder for the table: what is your response to "${row.event}"?`
  if (flag.rule === 'T2' && row)
    return `Has everyone seen "${row.event}"? Please check your devices.`
  if (flag.rule === 'T5' && row) return `Before we move on: ${row.expectedAction}`
  return flag.text
}
