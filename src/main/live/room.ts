/**
 * The Room and session-log use cases behind the `live:dashboard`, `live:log-*` and session
 * management channels (spec 0417). Reads go through `log-read`; a running session's log is
 * flushed first so a read sees every entry.
 */
import { promises as fs } from 'node:fs'
import { dashboardView } from './dashboard'
import { hotwashPrompts } from './hotwash'
import { boardFromLog } from './hotwash-replay'
import { trackerFeed, type TrackerFeed } from './tracker-feed'
import type { BoardView, DashboardView, LiveSession, LogTailEntry } from '@shared/schemas/live'
import { AppError } from '../lib/errors'
import { exists, readJson, safeJoin, writeJsonAtomic } from '../lib/fs'
import { LiveSession as LiveSessionSchema } from '@shared/schemas/live'
import { getScenario } from '../scenario/store'
import { writeExport } from './log-export'
import {
  LOG_FILE,
  SESSION_FILE,
  countEntries,
  listSessions,
  logFile,
  logSize,
  newestSessionId,
  readAll,
  sessionFolder,
  starredMessages,
  tailEntries,
  type TailOptions,
} from './log-read'
import { activeSession, flushActiveLog } from './session'

async function roleNames(root: string, scenarioId: string) {
  const scenario = await getScenario(root, scenarioId)
  const roles = scenario.roles.map((r) => ({
    id: r.id,
    name: r.abbreviation || r.name,
    team: r.team,
  }))
  const rowWindows: Record<string, number> = {}
  for (const row of scenario.msel) {
    if (row.responseWindowMin !== undefined) rowWindows[row.id] = row.responseWindowMin
  }
  return {
    roles,
    rowWindows,
    roleName: (id: string | undefined) => roles.find((r) => r.id === id)?.name,
  }
}

async function pickSession(root: string, scenarioId: string, sessionId?: string) {
  const running = activeSession()
  const runningHere = running && running.scenarioId === scenarioId ? running.id : undefined
  const id = sessionId ?? runningHere ?? (await newestSessionId(root, scenarioId))
  return { id, live: id !== undefined && id === runningHere }
}

export async function dashboard(
  root: string,
  scenarioId: string,
  sessionId?: string,
): Promise<DashboardView | null> {
  const { id, live } = await pickSession(root, scenarioId, sessionId)
  if (!id) return null
  if (live) await flushActiveLog(root, scenarioId)
  const path = logFile(root, scenarioId, id)
  const { roles, rowWindows } = await roleNames(root, scenarioId)
  const session = await readJson(
    safeJoin(sessionFolder(root, scenarioId, id), SESSION_FILE),
    LiveSessionSchema,
  ).catch(() => undefined)
  return dashboardView(await readAll(path), {
    roles,
    rowWindows,
    ...(session?.unansweredAfterMin ? { unansweredAfterMin: session.unansweredAfterMin } : {}),
    now: Date.now(),
    live,
    sessionId: id,
    logBytes: await logSize(path),
  })
}

/** A past session's hot wash board, folded from its log (spec 0415 FR-11). */
export async function pastHotwashBoard(
  root: string,
  scenarioId: string,
  sessionId: string,
): Promise<BoardView> {
  const { live } = await pickSession(root, scenarioId, sessionId)
  if (live) await flushActiveLog(root, scenarioId)
  const dir = sessionFolder(root, scenarioId, sessionId)
  if (!(await exists(dir))) throw new AppError('NOT_FOUND', 'No such session')
  const scenario = await getScenario(root, scenarioId)
  const { roleName } = await roleNames(root, scenarioId)
  const entries = await readAll(safeJoin(dir, LOG_FILE))
  return boardFromLog(entries, hotwashPrompts(scenario.hotwash).questions, roleName)
}

export async function logTail(
  root: string,
  scenarioId: string,
  opts: TailOptions & { sessionId?: string },
): Promise<{ entries: LogTailEntry[]; hasMore: boolean }> {
  const { id, live } = await pickSession(root, scenarioId, opts.sessionId)
  if (!id) return { entries: [], hasMore: false }
  if (live) await flushActiveLog(root, scenarioId)
  const entries = await readAll(logFile(root, scenarioId, id))
  const { roleName } = await roleNames(root, scenarioId)
  return tailEntries(entries, opts, roleName, starredMessages(entries))
}

export async function exportLog(
  root: string,
  scenarioId: string,
  sessionId: string,
  format: 'json' | 'csv',
  outPath: string,
  includeNames: boolean,
): Promise<{ path: string; entries: number }> {
  const { live } = await pickSession(root, scenarioId, sessionId)
  if (live) await flushActiveLog(root, scenarioId)
  const dir = sessionFolder(root, scenarioId, sessionId)
  const session = await readJson(safeJoin(dir, SESSION_FILE), LiveSessionSchema).catch(
    () => undefined,
  )
  const entries = await readAll(safeJoin(dir, LOG_FILE))
  const { roleName } = await roleNames(root, scenarioId)
  const count = await writeExport(outPath, format, entries, {
    includeNames,
    roleName,
    ...(session ? { session } : {}),
  })
  return { path: outPath, entries: count }
}

export const sessionsList = (root: string, scenarioId: string) =>
  listSessions(root, scenarioId, activeSession()?.id)

function assertNotRunning(sessionId: string): void {
  if (activeSession()?.id === sessionId) {
    throw new AppError('CONFLICT', 'This session is running. End it first.')
  }
}

/** An interrupted session becomes ended, at the time of its last entry. */
export async function closeSession(
  root: string,
  scenarioId: string,
  sessionId: string,
): Promise<LiveSession> {
  assertNotRunning(sessionId)
  const dir = sessionFolder(root, scenarioId, sessionId)
  const file = safeJoin(dir, SESSION_FILE)
  const session = await readJson(file, LiveSessionSchema)
  if (session.endedAt) return session
  const entries = await readAll(safeJoin(dir, LOG_FILE))
  const closed: LiveSession = {
    ...session,
    endedAt: entries.at(-1)?.at ?? new Date().toISOString(),
    lastIndex: entries.at(-1)?.i ?? session.lastIndex,
    summary: countEntries(entries),
  }
  await writeJsonAtomic(file, closed)
  return closed
}

/** Remove a session's folder (log, attachments, staged media). Cannot be undone. */
export async function deleteSession(
  root: string,
  scenarioId: string,
  sessionId: string,
): Promise<void> {
  assertNotRunning(sessionId)
  const dir = sessionFolder(root, scenarioId, sessionId)
  if (!(await exists(dir))) throw new AppError('NOT_FOUND', 'No such session')
  await fs.rm(dir, { recursive: true, force: true })
}

/** The running session's log as the Facilitate tracker reads it; empty when none runs here. */
export async function trackerFeedFor(root: string, scenarioId: string): Promise<TrackerFeed> {
  const { id, live } = await pickSession(root, scenarioId)
  if (!id || !live) return { live: false, session: [], messages: [] }
  await flushActiveLog(root, scenarioId)
  const { roles } = await roleNames(root, scenarioId)
  return trackerFeed(await readAll(logFile(root, scenarioId, id)), roles)
}
