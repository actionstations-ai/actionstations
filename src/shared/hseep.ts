// HSEEP vocabulary shared by the export (main) and the exercise details form (renderer), #420.

/** Acronyms every HSEEP document set uses; seeds the list when the designer has none. */
export const STANDARD_ACRONYMS: readonly [term: string, meaning: string][] = [
  ['AAR/IP', 'After-Action Report / Improvement Plan'],
  ['C/E', 'Controller / Evaluator'],
  ['EEG', 'Exercise Evaluation Guide'],
  ['ENDEX', 'End of Exercise'],
  ['ExPlan', 'Exercise Plan'],
  ['HSEEP', 'Homeland Security Exercise and Evaluation Program'],
  ['ICS', 'Incident Command System'],
  ['MSEL', 'Master Scenario Events List'],
  ['POC', 'Point of Contact'],
  ['SimCell', 'Simulation Cell'],
  ['SitMan', 'Situation Manual'],
  ['STARTEX', 'Start of Exercise'],
  ['TTX', 'Tabletop Exercise'],
]

export interface Acronym {
  term: string
  meaning: string
}

/** Trimmed, without blank terms or repeats (first meaning wins), sorted by term. */
export function sortedAcronyms(pairs: readonly (readonly [string, string])[]): Acronym[] {
  const seen = new Set<string>()
  return pairs
    .map(([term, meaning]) => ({ term: term.trim(), meaning: meaning.trim() }))
    .filter((a) => a.term && !seen.has(a.term.toLowerCase()) && seen.add(a.term.toLowerCase()))
    .sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }))
}

/** The standard acronyms plus extra pairs (role abbreviations, document short names). */
export const seededAcronyms = (extra: readonly (readonly [string, string])[] = []): Acronym[] =>
  sortedAcronyms([...STANDARD_ACRONYMS, ...extra])
