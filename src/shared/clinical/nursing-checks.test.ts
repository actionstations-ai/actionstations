// Worked examples for the clinical format checks (spec 0452 FR-4).
import { describe, expect, it } from 'vitest'
import { doseProblem } from './dose'
import { expectedDirection, firstNumber, flagProblem, parseRange } from './lab'
import { patientsPerNurse, shiftRow } from './staffing'
import { startCategory, triageProblem } from './triage'

describe('lab ranges and flags', () => {
  it('reads numbers and ranges as printed', () => {
    expect(firstNumber('1,250')).toBe(1250)
    expect(firstNumber('<0.05')).toBe(0.05)
    expect(firstNumber('Present')).toBeUndefined()
    expect(parseRange('0.5-2.0')).toEqual({ low: 0.5, high: 2 })
    expect(parseRange('135 to 145')).toEqual({ low: 135, high: 145 })
    expect(parseRange('<5')).toEqual({ high: 5 })
    expect(parseRange('>= 3.5')).toEqual({ low: 3.5 })
    expect(parseRange('Absent')).toBeUndefined()
  })

  it('says which side of the range a value is on', () => {
    expect(expectedDirection('5.4', '3.5-5.0')).toBe('H')
    expect(expectedDirection('17', '22-29')).toBe('L')
    expect(expectedDirection('136', '135-145')).toBe('')
    expect(expectedDirection('Present', '0.5-2.0')).toBeUndefined()
  })

  it('accepts a flag that agrees and names one that does not', () => {
    const row = { test: 'Potassium', value: '5.4', range: '3.5-5.0' }
    expect(flagProblem({ ...row, flag: 'H' })).toBeUndefined()
    expect(flagProblem({ ...row, flag: '' })).toMatch(/no flag/)
    expect(flagProblem({ ...row, flag: 'L' })).toMatch(/flagged L/)
    expect(flagProblem({ test: 'Sodium', value: '136', range: '135-145', flag: 'H' })).toMatch(
      /inside the range/,
    )
  })

  it('allows CRIT only outside the range', () => {
    expect(
      flagProblem({ test: 'Lactate', value: '4.8', range: '0.5-2.0', flag: 'CRIT' }),
    ).toBeUndefined()
    expect(flagProblem({ test: 'Lactate', value: '1.1', range: '0.5-2.0', flag: 'CRIT' })).toMatch(
      /CRIT/,
    )
  })

  it('leaves text results alone', () => {
    expect(
      flagProblem({ test: 'E. coli', value: 'Present', range: 'Absent', flag: 'H' }),
    ).toBeUndefined()
  })
})

describe('START triage', () => {
  const base = {
    walking: false,
    breathing: '22 per minute',
    perfusion: 'Radial pulse present',
    mentalStatus: 'Follows commands',
  }

  it.each([
    ['walks', { ...base, walking: true }, 'Minor'],
    [
      'not breathing after the airway is opened',
      { ...base, breathing: 'none after airway opened' },
      'Deceased',
    ],
    ['breathes more than 30 a minute', { ...base, breathing: '34 per minute' }, 'Immediate'],
    ['has no radial pulse', { ...base, perfusion: 'No radial pulse' }, 'Immediate'],
    [
      'does not follow commands',
      { ...base, mentalStatus: 'Does not follow commands' },
      'Immediate',
    ],
    ['meets none of the criteria', base, 'Delayed'],
  ] as const)('a casualty who %s is %s', (_name, findings, expected) => {
    expect(startCategory(findings)).toBe(expected)
  })

  it('flags a tag that disagrees and lets Expectant stand in for Immediate', () => {
    const f = { ...base, breathing: '34 per minute' }
    expect(triageProblem('Immediate', 'START', f)).toBeUndefined()
    expect(triageProblem('Delayed', 'START', f)).toMatch(/give Immediate/)
    expect(triageProblem('Expectant', 'START', f)).toBeUndefined()
    expect(triageProblem('Minor', 'START', f)).toBeDefined()
  })

  it('checks SALT only for contradictions', () => {
    expect(triageProblem('Immediate', 'SALT', { ...base, walking: true })).toMatch(/walking/)
    expect(triageProblem('Minor', 'SALT', { ...base, breathing: 'absent' })).toMatch(
      /not breathing/,
    )
    expect(triageProblem('Delayed', 'SALT', base)).toBeUndefined()
  })
})

describe('dose plausibility', () => {
  it('passes ordinary doses and drugs it does not list', () => {
    expect(doseProblem({ drug: 'Vancomycin', dose: '1,250 mg', route: 'IV' })).toBeUndefined()
    expect(
      doseProblem({ drug: 'Piperacillin-tazobactam', dose: '4.5 g', route: 'IV' }),
    ).toBeUndefined()
    expect(doseProblem({ drug: 'Zorbitol', dose: '9000 mg', route: 'PO' })).toBeUndefined()
  })

  it('stops an implausible dose, route or unit', () => {
    expect(doseProblem({ drug: 'Morphine', dose: '100 mg', route: 'IV' })).toMatch(
      /above a plausible/,
    )
    expect(doseProblem({ drug: 'Insulin', dose: '400 units', route: 'subcutaneous' })).toMatch(
      /above/,
    )
    expect(doseProblem({ drug: 'Ibuprofen', dose: '400 mg', route: 'IV' })).toMatch(/route/)
    expect(doseProblem({ drug: 'Heparin', dose: '5 mg', route: 'subcutaneous' })).toMatch(/units/)
  })

  it('converts grams and micrograms', () => {
    expect(doseProblem({ drug: 'Acetaminophen', dose: '1 g', route: 'PO' })).toBeUndefined()
    expect(doseProblem({ drug: 'Acetaminophen', dose: '2 g', route: 'PO' })).toBeDefined()
  })
})

describe('staffing arithmetic', () => {
  it('adds scheduled, called in and agency and takes away call-outs', () => {
    expect(
      shiftRow({ shift: 'Day', needed: 7, scheduled: 7, calledOut: 2, calledIn: 1 }),
    ).toMatchObject({
      onDuty: 6,
      shortBy: 1,
    })
    expect(shiftRow({ shift: 'Night', needed: 6, scheduled: 6, agency: 1 })).toMatchObject({
      onDuty: 7,
      shortBy: 0,
    })
  })

  it('gives patients per nurse, or nothing without nurses', () => {
    expect(patientsPerNurse(32, 6)).toBe(5.3)
    expect(patientsPerNurse(32, 0)).toBeUndefined()
  })
})
