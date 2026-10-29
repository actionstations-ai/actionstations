// Corrective action status rules (FR-5), shared by the main process (which enforces them) and the
// status dialog (which explains them before the user submits).
import type {
  ProgramAction,
  CorrectiveActionStatus,
  CorrectiveActionVerification,
} from '../schemas/program'

const ACTIVE: readonly CorrectiveActionStatus[] = ['open', 'in_progress']

export const isActive = (a: Pick<ProgramAction, 'status'>): boolean => ACTIVE.includes(a.status)

/** Open or in progress, with a due date before `today` (YYYY-MM-DD). */
export function isOverdue(a: Pick<ProgramAction, 'status' | 'dueDate'>, today: string): boolean {
  return isActive(a) && !!a.dueDate && a.dueDate < today
}

export const NOTE_REQUIRED: readonly CorrectiveActionStatus[] = ['deferred', 'cancelled']

/** The reason a status change is not allowed, or null when it is. */
export function statusChangeProblem(
  from: CorrectiveActionStatus,
  to: CorrectiveActionStatus,
  note: string,
  verification?: CorrectiveActionVerification,
): string | null {
  if (from === to) return 'The action already has this status.'
  if (NOTE_REQUIRED.includes(to) && !note.trim())
    return `Add a note saying why the action is ${to === 'deferred' ? 'deferred' : 'cancelled'}.`
  if (to === 'verified' && !verification)
    return 'Verified needs a verification: a drill run, or where it was observed in an exercise.'
  if (
    to === 'verified' &&
    verification &&
    !verification.note.trim() &&
    verification.method !== 'drill'
  )
    return 'Say where the corrective action was observed working.'
  return null
}

/** Apply a status change and record it in the history. Throws the problem text if not allowed. */
export function withStatusChange(
  action: ProgramAction,
  to: CorrectiveActionStatus,
  note: string,
  now: string,
  verification?: CorrectiveActionVerification,
): ProgramAction {
  const problem = statusChangeProblem(action.status, to, note, verification)
  if (problem) throw new Error(problem)
  return {
    ...action,
    status: to,
    history: [...action.history, { at: now, from: action.status, to, note: note.trim() }],
    verifications:
      to === 'verified' && verification
        ? [...action.verifications, verification]
        : action.verifications,
    updatedAt: now,
  }
}

/** "CA-0007" */
export const actionLabel = (a: Pick<ProgramAction, 'number' | 'id'>): string =>
  a.number ? `CA-${String(a.number).padStart(4, '0')}` : `CA-${a.id.slice(-6)}`
