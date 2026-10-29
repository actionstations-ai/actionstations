// Calendar dates written in scenario text ("October 22, 2026", "22 October 2026", "10/22/2026",
// "2026-10-22"). Shared by the DATE_DRIFT lint (src/main/generate/lint-brief.ts) and the
// regulatory clocks, which read the exercise date from the STARTEX card (#426).

export const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]
export const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const MONTH = `(?:${MONTHS.join('|')})`
const ORD = '(?:st|nd|rd|th)?'
/** "October 22, 2026", "October 22nd 2026", "22 October 2026", "10/22/2026", "2026-10-22". */
export const DATE_SOURCE = String.raw`(?:${MONTH}\.? \d{1,2}${ORD},? \d{4}|\d{1,2}${ORD} ${MONTH},? \d{4}|\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2})`

const pad = (n: number): string => String(n).padStart(2, '0')

/** The calendar date a DATE_SOURCE match names, as "2026-10-22". */
export function dateKey(text: string): string | undefined {
  const t = text.toLowerCase().replace(/(\d)(?:st|nd|rd|th)\b/g, '$1')
  const month = (name: string): number => MONTHS.indexOf(name) + 1
  const forms: [RegExp, (m: RegExpExecArray) => [number, number, number]][] = [
    [/^(\d{4})-(\d{2})-(\d{2})$/, (m) => [+m[1]!, +m[2]!, +m[3]!]],
    [/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (m) => [+m[3]!, +m[1]!, +m[2]!]],
    [/^([a-z]+)\.? (\d{1,2}),? (\d{4})$/, (m) => [+m[3]!, month(m[1]!), +m[2]!]],
    [/^(\d{1,2}) ([a-z]+),? (\d{4})$/, (m) => [+m[3]!, month(m[2]!), +m[1]!]],
  ]
  for (const [re, read] of forms) {
    const m = re.exec(t)
    if (!m) continue
    const [year, mon, day] = read(m)
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return undefined
    return `${year}-${pad(mon)}-${pad(day)}`
  }
  return undefined
}

/** The first calendar date a text names, as "2026-10-22". */
export function firstDateIn(text: string): string | undefined {
  const m = new RegExp(String.raw`\b(${DATE_SOURCE})`, 'i').exec(text)
  return m ? dateKey(m[1]!) : undefined
}
