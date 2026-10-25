// The player roles seat the brief's audience (#364 item 1): every audience entry is played by
// a role whose name, abbreviation, key or team shares a word with it ("Distribution" →
// "Distribution Superintendent"), or that the domain profile's role words put in the same kind
// ("Public Information" → "Corporate Communications (PIO)"). The drafts for the 0.5.0 examples
// kept the profile's five default roles and dropped the audience's Customer Service,
// Distribution or Leadership; the count matched, so ROLES_EXCEED_AUDIENCE did not fire.
// Pure; lint.ts adds it to lintScenario and capRoles keeps the seated roles first.
import type { DomainProfile } from '@shared/domains'
import type { LintWarning, Role, Scenario } from '@shared/schemas'
import { roleHeuristics, type RoleHeuristics } from './domain'

export const AUDIENCE_NOT_SEATED = 'AUDIENCE_NOT_SEATED'

/** Words that name a rank or a seat, not a discipline: they never match on their own. */
const STOP = new Set([
  'and',
  'or',
  'the',
  'of',
  'for',
  'to',
  'in',
  'on',
  'at',
  'with',
  'team',
  'lead',
  'leader',
  'manager',
  'director',
  'officer',
  'liaison',
  'coordinator',
  'chief',
  'head',
  'group',
  'staff',
  'unit',
  'member',
  'members',
  'desk',
  'seat',
  'player',
  'players',
])

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2 && !STOP.has(w))
}

/** Same word, or one a longer form of the other ("command" / "commander", "system" / "systems"). */
const sameWord = (a: string, b: string): boolean =>
  a === b || (a.length >= 5 && b.startsWith(a)) || (b.length >= 5 && a.startsWith(b))

/** What a role answers to: its own fields plus the profile template it was built from. */
function roleText(role: Role, profile?: DomainProfile): string {
  const template = profile?.roles.find((t) => t.key === role.id)
  return [
    role.id,
    role.abbreviation,
    role.name,
    role.team,
    template ? `${template.name} ${template.abbreviation} ${template.team}` : '',
  ].join(' ')
}

const KINDS = ['operations', 'technical', 'public', 'security'] as const

/** Whether `role` plays the audience entry: a shared word, or the same role kind. */
export function roleSeats(
  entry: string,
  role: Role,
  heur: RoleHeuristics,
  profile?: DomainProfile,
): boolean {
  const text = roleText(role, profile)
  const own = words(text)
  if (words(entry).some((w) => own.some((o) => sameWord(w, o)))) return true
  return KINDS.some((k) => heur[k].test(entry) && heur[k].test(text))
}

/** Audience entries no role plays, and roles that play no audience entry. */
export function audienceCoverage(
  s: Pick<Scenario, 'brief' | 'roles'>,
  profile?: DomainProfile,
): { unseated: string[]; unasked: Role[] } {
  const heur = roleHeuristics(profile)
  const entries = (s.brief?.audience ?? []).filter((e) => words(e).length)
  const unseated = entries.filter((e) => !s.roles.some((r) => roleSeats(e, r, heur, profile)))
  const unasked = s.roles.filter((r) => !entries.some((e) => roleSeats(e, r, heur, profile)))
  return { unseated, unasked }
}

/** One warning per audience entry no player role plays. */
export function lintAudience(s: Scenario, profile?: DomainProfile): LintWarning[] {
  if (!s.brief?.audience?.length || !s.roles.length) return []
  const { unseated, unasked } = audienceCoverage(s, profile)
  const spare = unasked[0]
  return unseated.map((entry) => ({
    code: AUDIENCE_NOT_SEATED,
    severity: 'warning' as const,
    message: `No player role plays "${entry}", which the brief's audience lists`,
    source: 'lint' as const,
    suggestion: spare
      ? `Turn "${spare.name}", which no audience entry asks for, into the ${entry} role (or add one); the audience list is the list of player roles`
      : `Add a player role for ${entry}, or rename the role that plays it; the audience list is the list of player roles`,
  }))
}
