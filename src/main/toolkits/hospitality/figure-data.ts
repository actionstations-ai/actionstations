// Figure data built from the hospitality simulations, so a scenario's figures and its case data
// come from the same numbers. Pure functions; the figure kinds validate what they are given.
import type {
  HospDeparturesData,
  HospFloorStatusData,
  HospMusterBoardData,
} from '../../render/figures/hospitality/boards'
import type { HospOutbreakCurveData } from '../../render/figures/hospitality/outbreak'
import {
  floorStatusAt,
  unaccountedAt,
  type HurricaneSim,
  type MusterSim,
  type TowerFireSim,
} from './simulate/emergencies'
import { dailyRows, type SimOutbreak } from './simulate/outbreak'

const HOUR_MS = 3_600_000

export function outbreakCurveData(sim: SimOutbreak, title?: string): HospOutbreakCurveData {
  return {
    ...(title ? { title } : {}),
    passengersOnBoard: sim.params.passengers,
    crewOnBoard: sim.params.crew,
    days: dailyRows(sim),
  }
}

export function musterBoardData(
  sim: MusterSim,
  minute: number,
  title?: string,
): HospMusterBoardData {
  const open = unaccountedAt(sim, minute)
  return {
    ...(title ? { title } : {}),
    asOf: new Date(sim.startMs + minute * 60_000).toISOString(),
    rows: [
      {
        name: 'Passengers',
        expected: sim.params.passengers,
        mustered: sim.params.passengers - open.passengers,
      },
      { name: 'Crew', expected: sim.params.crew, mustered: sim.params.crew - open.crew },
    ],
  }
}

export function floorStatusData(
  sim: TowerFireSim,
  minute: number,
  title?: string,
): HospFloorStatusData {
  return {
    ...(title ? { title } : {}),
    asOf: new Date(sim.startMs + minute * 60_000).toISOString(),
    floors: floorStatusAt(sim, minute),
  }
}

export function departuresData(sim: HurricaneSim, title?: string): HospDeparturesData {
  return {
    ...(title ? { title } : {}),
    guestsRegistered: sim.params.guests,
    points: sim.departed.map((d) => ({
      time: new Date(sim.startMs + d.hour * HOUR_MS).toISOString(),
      departed: d.guests,
    })),
    closures: sim.closures.map((c) => ({
      time: new Date(sim.startMs + c.hour * HOUR_MS).toISOString(),
      label: c.label,
    })),
  }
}
