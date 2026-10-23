// Plain-language headline per lint / review code (#229). The code and the checker's own
// detailed message stay visible as secondary text, so power users lose nothing.
import type { LintWarning } from './schemas/scenario'

const PLAIN: Record<string, string> = {
  TIME_ORDER: 'An event is listed earlier than the one before it.',
  ROW_NO_PHASE: 'An event is not in any phase.',
  ROW_OUTSIDE_PHASE: "An event's time falls outside its phase.",
  DUPLICATE_ROW_ID: 'Two events share the same ID.',
  DUPLICATE_EVENT: 'Two events say almost the same thing.',
  FROM_PLAYER_ROLE: 'An inject comes from one of the players instead of the outside world.',
  INJECT_SCRIPTS_PLAYERS: 'An inject decides something the players should decide themselves.',
  INJECT_PLAYER_VOICE: 'An inject is written as if a player were speaking.',
  REFERENCE_LEAK: 'An event copies details from the example exercise.',
  PHASE_EMPTY: 'A phase has no events for the players.',
  MIX_NO_CORE: 'A phase has no event that moves the main story forward.',
  MIX_NO_NOISE: 'A phase has no background noise or false lead to keep players alert.',
  MIX_NO_PIO_PRESSURE:
    'The public information officer gets no media or rumor pressure in this phase.',
  MIX_NO_IT_CLUE: 'The technical lead gets no clue to investigate in this phase.',
  MIX_NO_CLUE: 'Nobody gets a clue to investigate in this phase.',
  MIX_NO_DECISION_POINT: 'The phase meant to force a key decision does not have one.',
  ROLE_NO_INJECT: 'A player role has nothing to react to in this phase.',
  NO_DECISION_POINT: 'The middle of the exercise never forces a key decision.',
  DECISION_POINT_SCOPE: 'The key decision leaves out someone it should involve.',
  DECISION_POINT_RETAGGED: 'An event was re-labelled as the key decision.',
  STARTEX_FIRST: 'The exercise does not open with a start card.',
  ENDEX_LAST: 'The exercise does not close with an end card.',
  STARTEX_MULTIPLE: 'There is more than one start card.',
  ENDEX_MULTIPLE: 'There is more than one end card.',
  DENSITY_LOW: 'A phase has few events for its length; players may sit idle.',
  DENSITY_HIGH: 'A phase has many events for its length; players may be swamped.',
  DENSITY_DENSE: 'A phase is busier than the reference pace of about six events an hour.',
  CITATION_UNRESOLVED: 'A source reference does not point at a document section.',
  CITATION_DROPPED: 'A source reference was removed because it could not be found.',
  OVERVIEW_NO_SECTIONS: 'The overview does not say which plan sections are tested.',
  MSEL_NO_CITATIONS: 'No event points back at your plans.',
  RUBRIC_LINK_UNKNOWN: 'A scoring item points at an inject that does not exist.',
  RUBRIC_POINTS: 'The scoring rubric does not add up to 100 points.',
  FACILITY_UNKNOWN_ID:
    'An event names a runway, gate, system or other place not in your facility facts.',
  LOCATION_UNGROUNDED: 'An event names a place your documents do not mention.',
  ROLE_KEY_UNKNOWN: 'An event is addressed to a role that is not in this scenario.',
  INJECT_FIELDS_INVALID: 'An inject is missing fields its template needs.',
  INJECT_FIELDS_REPAIRED: 'Some inject fields were filled in automatically.',
  INJECT_CONTENT_ISSUE: 'An inject has a content problem to review.',
  INJECT_MEDIA_FAILED: "An inject's media could not be made.",
  INJECT_RENDER_INVALID: 'An inject did not render cleanly.',
  INJECT_TEMPLATE_MISSING: 'An inject uses a template that is not installed.',
  INJECT_TEXT_FAILED: "An inject's text could not be written.",
  INJECT_TEXT_FALLBACK: 'An inject uses placeholder text because writing it failed.',
  INJECT_TYPE_FALLBACK: 'An inject was given a different type than planned.',
  CRITIQUE: 'The review pass suggests an improvement.',
}

/** Plain-language headline for a warning; the checker's message when the code is new. */
export function plainLintMessage(w: Pick<LintWarning, 'code' | 'message'>): string {
  return PLAIN[w.code] ?? w.message
}

export const hasPlainMessage = (code: string): boolean => code in PLAIN

export const SEVERITY_LABEL: Record<LintWarning['severity'], string> = {
  error: 'Must fix',
  warning: 'Check',
  info: 'Tip',
}
