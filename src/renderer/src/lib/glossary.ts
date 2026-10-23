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
} as const

export type GlossaryId = keyof typeof GLOSSARY

export const GLOSSARY_IDS = Object.keys(GLOSSARY) as GlossaryId[]
