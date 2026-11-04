/**
 * The practice session the player apps open from **Try a demo** (spec 0446): a scripted
 * controller in the page releases a few injects on a timer once the device takes a seat. Every
 * organization, person and business in it is fictional.
 */
import type { Destination } from '../../shared/live/schemas'
import type { HarnessController, SeatDef } from '../harness/controller'

export const DEMO_TITLE = 'Practice session: the Monday outage'

export const DEMO_SEATS: SeatDef[] = [
  {
    id: 'ops-lead',
    name: 'Operations Lead',
    abbreviation: 'OPS',
    teamId: 'ops',
    teamName: 'Operations',
    kind: 'player',
    capacity: 1,
  },
  {
    id: 'it-lead',
    name: 'IT Lead',
    abbreviation: 'IT',
    teamId: 'it',
    teamName: 'IT and cybersecurity',
    kind: 'player',
    capacity: 1,
  },
  {
    id: 'comms-lead',
    name: 'Communications Lead',
    abbreviation: 'PIO',
    teamId: 'comms',
    teamName: 'Communications',
    kind: 'player',
    capacity: 1,
  },
]

/** Practice injects go to the seats in use, so they land in the Inbox rather than the Feed. */
function seatedRoles(c: HarnessController): Destination[] {
  const roles = new Set<string>()
  for (const r of c.roster.values()) if (r.roleId && r.connected) roles.add(r.roleId)
  return roles.size ? [...roles].map((id) => `role:${id}` as Destination) : ['all']
}

export interface DemoStep {
  /** Seconds after the device took its seat. */
  at: number
  run: (c: HarnessController) => Promise<unknown>
}

export const DEMO_STEPS: DemoStep[] = [
  {
    at: 1,
    run: (c) => c.setClock({ elapsedMin: 0, runningSince: Date.now(), rate: 20, reason: 'start' }),
  },
  {
    at: 2,
    run: (c) =>
      c.notice(
        'Welcome to the practice session. Nothing here is real and nothing is recorded. Injects arrive in your Inbox over the next minute.',
      ),
  },
  {
    at: 8,
    run: (c) =>
      c.release(
        {
          title: 'Help desk tickets spike',
          injectType: 'ticket',
          sender: 'Service desk',
          body: 'Twenty-three tickets in ten minutes at Harbor Point Utilities: staff cannot sign in to email or the scheduling system. The service desk asks who is coordinating.',
          exerciseTime: '0:03',
        },
        seatedRoles(c),
      ),
  },
  {
    at: 22,
    run: (c) =>
      c.release(
        {
          title: 'Vendor reports suspicious sign-ins',
          injectType: 'email',
          sender: 'Bluewater Systems (managed IT)',
          body: 'We see sign-ins to your administrator accounts from an address we do not recognize, starting 06:40. We recommend disabling the accounts. Please confirm before we act.',
          exerciseTime: '0:07',
          expectsResponse: true,
        },
        seatedRoles(c),
      ),
  },
  {
    at: 40,
    run: (c) =>
      c.release(
        {
          title: 'A reporter calls',
          injectType: 'phone',
          sender: 'Local newspaper',
          body: 'A reporter asks whether customer data was exposed and says the story runs in one hour. They want a comment from the Communications Lead.',
          exerciseTime: '0:13',
        },
        seatedRoles(c),
      ),
  },
  {
    at: 60,
    run: (c) =>
      c.notice('In a real exercise you would now discuss your next steps with your team.', {
        level: 'warning',
      }),
  },
  {
    at: 80,
    run: (c) =>
      c.end(
        'endex',
        'That is the end of the practice session. In a real exercise, scan the code your facilitator shows.',
      ),
  },
]

/** Wait until a device holds a seat, then run the steps in order. Returns a stop function. */
export function runDemo(
  controller: HarnessController,
  timers: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'> = globalThis,
  steps: DemoStep[] = DEMO_STEPS,
): () => void {
  const handles: ReturnType<typeof setTimeout>[] = []
  let stopped = false
  const seated = () => [...controller.roster.values()].some((r) => r.roleId && r.connected)
  const waitForSeat = () => {
    if (stopped) return
    if (!seated()) {
      handles.push(timers.setTimeout(waitForSeat, 500))
      return
    }
    for (const step of steps) {
      handles.push(
        timers.setTimeout(() => void step.run(controller).catch(() => {}), step.at * 1000),
      )
    }
  }
  waitForSeat()
  return () => {
    stopped = true
    handles.forEach((h) => timers.clearTimeout(h))
  }
}
