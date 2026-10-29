// Deterministic checks on a draft before it is queued (spec 0429 FR-10). Each finding is a flag
// the controller sees as text next to the draft. A flag never blocks a draft; a person decides.
import type { PersonaCard, PersonaChannel, SimcellDraftOutput, SimcellFlag } from '@shared/schemas'

export interface ChannelLimit {
  chars?: number
  words?: number
  seconds?: number
}

/** Text messages 320 characters; a call 60 seconds of speech at about 150 words a minute. */
export function channelLimit(channel: PersonaChannel): ChannelLimit {
  if (channel === 'sms') return { chars: 320 }
  if (channel === 'call') return { words: 150, seconds: 60 }
  if (channel === 'email') return { chars: 2000 }
  return { chars: 1200 }
}

export function describeLimit(limit: ChannelLimit): string {
  if (limit.words) return `about ${limit.words} words (${limit.seconds} seconds spoken)`
  return `${limit.chars} characters`
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

const AGREE =
  /\b(sure|of course|absolutely|certainly|happy to|no problem|we agree|that works|will do|you have our word|consider it done)\b/i

export const BREAKS_CHARACTER_RE =
  /\b(as an ai|language model|i am an ai|i'm an ai|simulat(?:ion|ed)|this exercise|tabletop|role-?play(?:ing)?|simcell|the scenario|controller)\b/i

const HONORIFIC =
  /\b(?:Mr|Ms|Mrs|Mx|Dr|Prof|Officer|Agent|Captain|Chief|Director|Commissioner|Sheriff|Senator|Governor|Mayor)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g
const INTRODUCES = /\b(?:my name is|this is|i'm|i am|name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi

export interface CheckInput {
  output: SimcellDraftOutput
  card: PersonaCard
  channel: PersonaChannel
  /** Names and phrases that are allowed: the persona, scenario roles, organizations, facts. */
  knownNames: readonly string[]
}

function revealed(text: string, card: PersonaCard): SimcellFlag[] {
  const t = norm(text)
  return card.knowledge.mustNotReveal
    .filter((p) => p.trim() && t.includes(norm(p)))
    .map((p) => ({
      code: 'MUST_NOT_REVEAL' as const,
      message: `The reply contains "${p}", which this character must never reveal.`,
    }))
}

function concessions(input: CheckInput): SimcellFlag[] {
  const { output, card } = input
  const flags: SimcellFlag[] = []
  const given = new Set(output.applied.concessions)
  const known = new Set(card.concessions.map((c) => c.id))
  if (output.intent === 'concede' || given.size) {
    if (!output.concessionEvidence?.trim())
      flags.push({
        code: 'CONCESSION_UNMET',
        message:
          'A concession is given but no message from the players is cited as meeting its condition.',
      })
    for (const id of given)
      if (!known.has(id))
        flags.push({
          code: 'CONCESSION_UNMET',
          message: `"${id}" is not a concession on this card.`,
        })
  }
  const t = norm(output.text)
  for (const c of card.concessions) {
    const give = norm(c.give)
    if (give.length >= 20 && t.includes(give) && !given.has(c.id))
      flags.push({
        code: 'CONCESSION_UNMET',
        message: `The reply gives away "${c.give}" without marking the concession as applied.`,
      })
  }
  return flags
}

function drift(output: SimcellDraftOutput): SimcellFlag[] {
  const a = output.applied
  const cited = a.goals.length + a.deadlines.length + a.rules.length + a.concessions.length
  return AGREE.test(output.text) && cited === 0
    ? [
        {
          code: 'AGREEABLE_DRIFT',
          message:
            'The reply agrees with the players but cites no goal, deadline, rule or concession.',
        },
      ]
    : []
}

function personNames(text: string): string[] {
  const out: string[] = []
  for (const re of [HONORIFIC, INTRODUCES]) {
    re.lastIndex = 0
    for (const m of text.matchAll(re)) if (m[1]) out.push(m[1])
  }
  return out
}

function unknownNames(input: CheckInput): SimcellFlag[] {
  const known = new Set(
    [input.card.displayName, input.card.organization.name, ...input.knownNames].flatMap(
      (s) => norm(s).match(/[a-z][a-z'-]+/g) ?? [],
    ),
  )
  return personNames(input.output.text)
    .filter((name) => !(norm(name).match(/[a-z][a-z'-]+/g) ?? []).some((w) => known.has(w)))
    .map((name) => ({
      code: 'UNKNOWN_PERSON_NAME' as const,
      message: `The reply names "${name}", who is not on the card, in the scenario roles or in the project facts.`,
    }))
}

function length(output: SimcellDraftOutput, channel: PersonaChannel): SimcellFlag[] {
  const limit = channelLimit(channel)
  const words = output.text.trim().split(/\s+/).filter(Boolean).length
  const tooLong = limit.words ? words > limit.words : output.text.length > (limit.chars ?? 0)
  return tooLong
    ? [
        {
          code: 'TOO_LONG',
          message: `The reply is longer than the limit for this channel (${describeLimit(limit)}).`,
        },
      ]
    : []
}

function judgedByModel(input: CheckInput): SimcellFlag[] {
  const judged = input.card.escalationRules.filter(
    (r) => r.when.kind === 'player_says' && input.output.applied.rules.includes(r.id),
  )
  return judged.map((r) => ({
    code: 'RULE_JUDGED_BY_MODEL' as const,
    message: `Rule ${r.id} depends on what the players said, which the model judged. Check it.`,
  }))
}

export function runChecks(input: CheckInput): SimcellFlag[] {
  const { output, card, channel } = input
  return [
    ...revealed(output.text, card),
    ...concessions(input),
    ...drift(output),
    ...(BREAKS_CHARACTER_RE.test(output.text)
      ? [
          {
            code: 'BROKE_CHARACTER' as const,
            message: 'The reply mentions a model, a simulation or the exercise.',
          },
        ]
      : []),
    ...unknownNames(input),
    ...length(output, channel),
    ...judgedByModel(input),
  ]
}
