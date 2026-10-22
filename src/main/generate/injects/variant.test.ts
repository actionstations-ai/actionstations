// The model picks a template variant (#177.3): validated against the template's meta.variants.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { InjectTextOutput } from '@shared/schemas'
import { chooseVariant } from './text-stage'

const scadaVariants = (
  JSON.parse(readFileSync(resolve('templates/injects/scada_hmi/meta.json'), 'utf8')) as {
    variants: string[]
  }
).variants

describe('chooseVariant', () => {
  it('accepts the water pack scada_hmi variant water_chemical', () => {
    expect(scadaVariants).toContain('water_chemical')
    expect(chooseVariant(scadaVariants, 'water_chemical', undefined)).toEqual({
      variant: 'water_chemical',
    })
  })

  it('falls back to the template default for a variant the template does not have', () => {
    expect(chooseVariant(scadaVariants, 'chlorine_room', undefined)).toEqual({
      rejected: 'chlorine_room',
    })
  })

  it('keeps the regenerated inject variant when the model names none or a bad one', () => {
    expect(chooseVariant(scadaVariants, undefined, 'water_distribution')).toEqual({
      variant: 'water_distribution',
    })
    expect(chooseVariant(scadaVariants, 'bogus', 'dam')).toEqual({
      variant: 'dam',
      rejected: 'bogus',
    })
    expect(chooseVariant(scadaVariants, undefined, 'gone')).toEqual({})
  })

  it('is an optional field of the inject_text output', () => {
    const base = {
      type: 'scada_hmi',
      title: 't',
      deliveryMode: 'display_main_screen',
      fields: {},
      citations: [],
    }
    expect(InjectTextOutput.parse({ ...base, variant: 'water_chemical' }).variant).toBe(
      'water_chemical',
    )
    expect(InjectTextOutput.parse(base).variant).toBeUndefined()
  })
})
