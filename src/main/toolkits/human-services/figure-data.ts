// Figure data built from the human services simulations (spec 0464 FR-7, FR-9): the data each
// figure kind takes, so figures and the datasets they show come from one run and always agree.
import type {
  HsContactSeriesData,
  HsQueueBoardData,
  HsStaffingCoverageData,
} from '../../render/figures/hs/contacts'
import type {
  HsDisplacedTrackerData,
  HsReunificationFlowData,
} from '../../render/figures/hs/reunification'
import type { HsShelterDashboardData } from '../../render/figures/hs/shelter'
import {
  CHANNEL_LABEL,
  CONTACT_CHANNELS,
  channelIntervals,
  type ContactChannel,
  type SurgeInterval,
  type SurgeRun,
} from './simulate/contact-surge'
import { countsAt, PLACEMENTS, type DisplacedRun } from './simulate/displaced'
import { flowPoints, type ReunificationRun } from './simulate/reunification'
import type { ShelterRun } from './simulate/shelter'
import { NEED_CATEGORIES, NEED_LABEL } from './simulate/shelter'

/** The federal near-term goal for texts and chats: shown as a labeled default, never a law. */
export const TEXT_CHAT_GOAL = {
  value: 90,
  label: 'Federal goal for texts and chats (September 2026)',
}

/** Answer rate of one interval: answered over everything the center had to deal with. */
export function answerRatePct(i: SurgeInterval): number {
  const handled = i.answered + i.abandoned + i.rerouted + i.queueEnd
  return handled === 0 ? 100 : Math.round((1000 * i.answered) / handled) / 10
}

export function contactSeriesData(
  run: SurgeRun,
  measure: 'volume' | 'answer_rate',
  channels: readonly ContactChannel[] = CONTACT_CHANNELS,
): HsContactSeriesData {
  const hours = (m: number): number => Math.round((m / 60) * 100) / 100
  return {
    measure,
    xLabel: 'Hours from start',
    types: channels.map((ch) => ({
      name: CHANNEL_LABEL[ch],
      points: channelIntervals(run, ch).map((i) => ({
        x: hours(i.startMin),
        y: measure === 'volume' ? i.offered : answerRatePct(i),
      })),
    })),
    targets: measure === 'answer_rate' ? [TEXT_CHAT_GOAL] : [],
    origin: 'Simulated',
  }
}

/** The queue board at the interval that starts at `startMin`. */
export function queueBoardData(run: SurgeRun, startMin: number): HsQueueBoardData {
  const target = (ch: ContactChannel): number =>
    ch === 'calls' ? run.params.rerouting.callSec : run.params.rerouting.textChatSec
  return {
    asOf: `minute ${startMin} (simulated)`,
    rows: CONTACT_CHANNELS.map((ch) => {
      const i = channelIntervals(run, ch).find((r) => r.startMin === startMin)!
      return {
        type: CHANNEL_LABEL[ch],
        waiting: i.queueEnd,
        longestWaitSec: i.longestWaitSec,
        answerRatePct: answerRatePct(i),
        staffOn: i.staffOn,
        state:
          i.longestWaitSec > target(ch)
            ? 'critical'
            : i.longestWaitSec > target(ch) / 2
              ? 'watch'
              : 'normal',
      }
    }),
  }
}

export function staffingCoverageData(
  run: SurgeRun,
  perCounselorHour = 4.5,
): HsStaffingCoverageData {
  const stepH = run.params.intervalMin / 60
  const starts = [...new Set(run.intervals.map((i) => i.startMin))]
  return {
    basis: `${perCounselorHour} contacts per counselor hour against the offered volume plus the waiting queue`,
    intervals: starts.map((startMin) => {
      const rows = run.intervals.filter((i) => i.startMin === startMin)
      const demand = rows.reduce((a, r) => a + r.offered + r.queueEnd, 0)
      return {
        startMin,
        onFloor: rows.reduce((a, r) => a + r.staffOn, 0),
        needed: Math.ceil(demand / stepH / perCounselorHour),
      }
    }),
  }
}

export function shelterDashboardData(run: ShelterRun, hour: number): HsShelterDashboardData {
  const h = Math.min(hour, run.params.hours - 1)
  const open = (opens: number): boolean => opens <= h
  const needsBy = (cat: (typeof NEED_CATEGORIES)[number]): number =>
    run.needs.filter((n) => n.category === cat && n.hour <= h + 1).length
  return {
    asOf: `hour ${hour} (simulated)`,
    sites: run.params.sites
      .filter((s) => open(s.opensHour))
      .map((s) => {
        const population = run.population[s.name]![h]!
        return {
          name: s.name,
          population,
          capacity: s.capacity,
          status: population >= s.capacity ? ('full' as const) : ('open' as const),
        }
      }),
    needs: NEED_CATEGORIES.map((c) => ({
      category: NEED_LABEL[c],
      open: Math.ceil(needsBy(c) * 0.4),
      met: Math.floor(needsBy(c) * 0.6),
    })),
    supplies: [],
  }
}

export function reunificationFlowData(run: ReunificationRun): HsReunificationFlowData {
  return {
    onRoster: run.students.length,
    points: flowPoints(run, 10).map((f) => ({
      minute: f.minute,
      arrived: f.arrived,
      verified: f.verified,
      released: f.released,
      exceptions: f.exceptions,
    })),
  }
}

export function displacedTrackerData(run: DisplacedRun, hour: number): HsDisplacedTrackerData {
  const by = countsAt(run, hour)
  return {
    asOf: `hour ${hour} (simulated)`,
    counts: PLACEMENTS.map((placement) => ({ placement, ...by[placement] })),
  }
}
