// `pnpm bench -- --resume` starts each unfinished critique case from the clean example (#603).
import { describe, expect, it } from 'vitest'
import { plantedCase } from '../../scripts/bench/cases.mjs'
import {
  loadDefects,
  loadExample,
  loadSuite,
  shippedScenario,
} from '../../scripts/bench/corpus.mjs'
import { applyDefects } from '../../scripts/bench/defects.mjs'

const suite = loadSuite('quick')
const unfinished = suite.critique[0]

/** The working project of an interrupted run: planted defects were already saved into it. */
function interruptedWorkingScenario() {
  const defects = loadDefects(unfinished.defects)
  const clean = structuredClone(shippedScenario(loadExample(unfinished.example), defects.scenario))
  return { defects, working: applyDefects(clean, defects).scenario }
}

describe('resume of an interrupted critique case', () => {
  it('fails when the defects are applied again to the working scenario (the bug)', () => {
    const { defects, working } = interruptedWorkingScenario()
    expect(() => applyDefects(structuredClone(working), defects)).toThrow(/is not in/)
  })

  it('plants the defects once into a fresh copy of the clean example', () => {
    const { working } = interruptedWorkingScenario()
    const { scenario } = plantedCase(unfinished)
    expect(scenario.msel).toEqual(working.msel)
  })

  it('leaves the shipped example untouched, so a second resume gets the same result', () => {
    const first = plantedCase(unfinished)
    const second = plantedCase(unfinished)
    expect(second.scenario.msel).toEqual(first.scenario.msel)
    const shipped = shippedScenario(loadExample(unfinished.example), first.defects.scenario)
    expect(shipped.msel).not.toEqual(first.scenario.msel)
  })
})
