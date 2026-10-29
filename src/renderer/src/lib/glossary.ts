// Exercise vocabulary explained in one or two plain sentences (#229). Shown by <Term> and
// the glossary popover wherever these words first appear.

export const GLOSSARY = {
  msel: {
    term: 'MSEL',
    full: 'Master Scenario Events List',
    text: 'The timeline of the exercise: every event, when it happens, who receives it and what you expect them to do.',
  },
  inject: {
    term: 'Inject',
    text: 'One message or event handed to the players during the exercise, such as an email, a phone call, a news post or a system alert. Each MSEL row has one.',
  },
  startex: {
    term: 'STARTEX / ENDEX',
    full: 'Start of exercise / End of exercise',
    text: 'The cards that open and close play. The facilitator reads them aloud.',
  },
  simcell: {
    term: 'SimCell',
    full: 'Simulation cell',
    text: 'The facilitators who play the outside world: callers, reporters, vendors and agencies the players contact.',
  },
  hotwash: {
    term: 'Hot wash',
    text: 'The short debrief right after the exercise, while it is fresh: what went well and what to improve.',
  },
  timejump: {
    term: 'Time jump',
    text: 'A card that moves the exercise clock forward, for example "It is now four hours later".',
  },
  pio: {
    term: 'PIO',
    full: 'Public Information Officer',
    text: 'The person who speaks for the organization to the media and the public.',
  },
  lint: {
    term: 'Lint',
    text: 'Automatic checks on the scenario, such as a phase with no events or a role with nothing to do. Errors should be fixed before the exercise; warnings are suggestions.',
  },
  grounded: {
    term: 'Grounded',
    text: 'Source check: the plan passages an expected action or note cites say what it claims, with the same roles, deadlines and numbers.',
  },
  review: {
    term: 'Needs review',
    text: 'Source check: the cited passages support part of the claim, or a role, deadline or section it names is not in them. Read the passage before the exercise.',
  },
  unsupported: {
    term: 'Unsupported',
    text: 'Source check: nothing is cited, the cited passage is gone, the passage does not address the claim, or it says something different (another deadline, number or role).',
  },
  planConflict: {
    term: 'Plan conflict',
    text: 'Two of your own plans answer the same question differently, for example two different approvers for public releases. Fix the plans or exercise the conflict.',
  },
} as const

export type GlossaryId = keyof typeof GLOSSARY

export const GLOSSARY_IDS = Object.keys(GLOSSARY) as GlossaryId[]
