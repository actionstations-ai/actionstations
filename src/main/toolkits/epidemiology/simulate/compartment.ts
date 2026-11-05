// SIR and SEIR compartment models (spec 0457 FR-6). A teaching model, documented here in full:
//
//   S' = -lambda S          lambda = beta (1 - effect) I / N      (effect applies from the intervention day)
//   E' =  lambda S - sigma E                                     (SEIR only; SIR has no E and sigma = infinity)
//   I' =  sigma E  - gamma I                                     (SIR: I' = lambda S - gamma I)
//   R' =  gamma I
//
// beta = R0 gamma, gamma = 1 / infectious days, sigma = 1 / latent days. Initial immunity is
// `vaccinationCoverage` x `vaccineEffectiveness` of the population moved from S to R at day 0.
// The deterministic solver is classical fourth-order Runge-Kutta with a fixed step of
// 1 / stepsPerDay days, so a run is a pure function of its parameters. Cumulative infections and
// onsets ride along as extra state variables, so daily incidence is an exact difference.
//
// The stochastic variant is a chain-binomial model on the same equations: each fixed step moves
// Binomial(compartment, 1 - exp(-rate dt)) people, using the seeded generator. Counts are
// integers and conserved. Output is always labeled simulated by the generator framework.
import { z } from 'zod'
import { makeRng } from './rng'

export const CompartmentParams = z
  .object({
    model: z.enum(['sir', 'seir']).default('seir'),
    population: z.number().int().min(10).max(10_000_000).default(10_000),
    r0: z.number().min(0.1).max(20).default(2),
    latentDays: z.number().min(0.1).max(60).default(3),
    infectiousDays: z.number().min(0.5).max(60).default(5),
    initialInfected: z.number().int().min(1).default(5),
    vaccinationCoverage: z.number().min(0).max(1).default(0),
    vaccineEffectiveness: z.number().min(0).max(1).default(1),
    /** Day the intervention starts; omitted for none. */
    interventionStartDay: z.number().min(0).optional(),
    /** Fraction by which the transmission rate falls once the intervention has started. */
    interventionEffect: z.number().min(0).max(1).default(0),
    days: z.number().int().min(1).max(730).default(120),
    stepsPerDay: z.number().int().min(1).max(200).default(20),
    /** Run the chain-binomial variant with this seed instead of the deterministic solver. */
    stochasticSeed: z.number().int().optional(),
  })
  .refine((p) => p.initialInfected <= p.population, { message: 'more infected than people' })
export type CompartmentParams = z.input<typeof CompartmentParams>
export type CompartmentConfig = z.output<typeof CompartmentParams>

export interface CompartmentDay {
  day: number
  susceptible: number
  exposed: number
  infectious: number
  recovered: number
  /** New infections (people leaving S) during the day. */
  newInfections: number
  /** New symptomatic onsets during the day (SEIR); equals newInfections for SIR. */
  newOnsets: number
  /** People infectious at the end of the day. */
  prevalence: number
}

export interface CompartmentRun {
  config: CompartmentConfig
  days: CompartmentDay[]
  /** Fraction of the population ever infected by the end. */
  finalAttackFraction: number
  /** Day of the highest daily onsets. */
  peakDay: number
}

const clampPositive = (x: number): number => (x < 0 ? 0 : x)

/** State vector: S, E, I, R, cumulative infections, cumulative onsets. */
type State = [number, number, number, number, number, number]

function rates(c: CompartmentConfig): { beta: number; gamma: number; sigma: number } {
  const gamma = 1 / c.infectiousDays
  return { beta: c.r0 * gamma, gamma, sigma: c.model === 'sir' ? Infinity : 1 / c.latentDays }
}

function derivative(s: State, t: number, c: CompartmentConfig): State {
  const { beta, gamma, sigma } = rates(c)
  const [S, E, I] = s
  const reduced =
    c.interventionStartDay !== undefined && t >= c.interventionStartDay
      ? 1 - c.interventionEffect
      : 1
  const lambda = (beta * reduced * I) / c.population
  const infect = lambda * S
  if (c.model === 'sir') return [-infect, 0, infect - gamma * I, gamma * I, infect, infect]
  const onset = sigma * E
  return [-infect, infect - onset, onset - gamma * I, gamma * I, infect, onset]
}

function rk4(s: State, t: number, dt: number, c: CompartmentConfig): State {
  const add = (a: State, b: State, k: number): State => a.map((v, i) => v + k * b[i]!) as State
  const k1 = derivative(s, t, c)
  const k2 = derivative(add(s, k1, dt / 2), t + dt / 2, c)
  const k3 = derivative(add(s, k2, dt / 2), t + dt / 2, c)
  const k4 = derivative(add(s, k3, dt), t + dt, c)
  return s.map((v, i) => v + (dt / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!)) as State
}

function initial(c: CompartmentConfig): State {
  const immune = Math.round(c.population * c.vaccinationCoverage * c.vaccineEffectiveness)
  const seeds = Math.min(c.initialInfected, c.population - immune)
  const seeded: [number, number] = c.model === 'sir' ? [0, seeds] : [seeds, 0]
  return [c.population - immune - seeds, seeded[0], seeded[1], immune, 0, 0]
}

function dayRow(day: number, s: State, prev: State): CompartmentDay {
  return {
    day,
    susceptible: s[0],
    exposed: s[1],
    infectious: s[2],
    recovered: s[3],
    newInfections: s[4] - prev[4],
    newOnsets: s[5] - prev[5],
    prevalence: s[2],
  }
}

function finish(config: CompartmentConfig, days: CompartmentDay[]): CompartmentRun {
  const first = initial(config)
  const everInfected = days.reduce((n, d) => n + d.newInfections, 0) + (first[1] + first[2])
  const peak = days.reduce((best, d) => (d.newOnsets > best.newOnsets ? d : best), days[0]!)
  return {
    config,
    days,
    finalAttackFraction: everInfected / config.population,
    peakDay: peak.day,
  }
}

function runDeterministic(c: CompartmentConfig): CompartmentRun {
  const dt = 1 / c.stepsPerDay
  let s = initial(c)
  const rows: CompartmentDay[] = []
  for (let day = 1; day <= c.days; day++) {
    const prev = s
    for (let k = 0; k < c.stepsPerDay; k++) {
      s = rk4(s, day - 1 + k * dt, dt, c)
      s = s.map(clampPositive) as State
    }
    rows.push(dayRow(day, s, prev))
  }
  return finish(c, rows)
}

function runStochastic(c: CompartmentConfig, seed: number): CompartmentRun {
  const rng = makeRng(seed)
  const { beta, gamma, sigma } = rates(c)
  const dt = 1 / Math.min(c.stepsPerDay, 4)
  const steps = Math.round(1 / dt)
  const init = initial(c)
  let [S, E, I, R] = init.slice(0, 4) as [number, number, number, number]
  let cumInfect = 0
  let cumOnset = 0
  const rows: CompartmentDay[] = []
  for (let day = 1; day <= c.days; day++) {
    const startInfect = cumInfect
    const startOnset = cumOnset
    for (let k = 0; k < steps; k++) {
      const t = day - 1 + k * dt
      const reduced =
        c.interventionStartDay !== undefined && t >= c.interventionStartDay
          ? 1 - c.interventionEffect
          : 1
      const pInfect = 1 - Math.exp(-((beta * reduced * I) / c.population) * dt)
      const newInf = rng.binomial(S, pInfect)
      S -= newInf
      cumInfect += newInf
      if (c.model === 'sir') {
        const rec = rng.binomial(I, 1 - Math.exp(-gamma * dt))
        I += newInf - rec
        R += rec
        cumOnset += newInf
      } else {
        const onset = rng.binomial(E, 1 - Math.exp(-sigma * dt))
        const rec = rng.binomial(I, 1 - Math.exp(-gamma * dt))
        E += newInf - onset
        I += onset - rec
        R += rec
        cumOnset += onset
      }
    }
    rows.push({
      day,
      susceptible: S,
      exposed: E,
      infectious: I,
      recovered: R,
      newInfections: cumInfect - startInfect,
      newOnsets: cumOnset - startOnset,
      prevalence: I,
    })
  }
  return finish(c, rows)
}

/** Run the model. A stochastic seed switches to the chain-binomial variant. */
export function runCompartment(params: CompartmentParams = {}): CompartmentRun {
  const c = CompartmentParams.parse(params)
  return c.stochasticSeed === undefined ? runDeterministic(c) : runStochastic(c, c.stochasticSeed)
}
