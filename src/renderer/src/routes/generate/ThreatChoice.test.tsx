// @vitest-environment happy-dom
// The threat family picker lists the families a pack added (#655), and their labels show in the
// suggestion.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { registerPackProfiles, threatFamily } from '@shared/domains'
import { freightRailEntry } from '@shared/domains/pack-fixtures'
import { suggestThreat } from '../../lib/domains'
import { ThreatChoice } from './ThreatChoice'

const flood = {
  ...threatFamily('natural_hazard'),
  id: 'river_flood',
  label: 'River flood',
  description: 'A river rises past its banks.',
  keywords: ['levee', 'inundation'],
}

afterEach(() => {
  cleanup()
  registerPackProfiles([])
})

describe('ThreatChoice with a pack-added family', () => {
  const entry = () =>
    freightRailEntry('1.0.0', { threatFamilies: ['cyber'], addedThreatFamilies: [flood] })

  it('offers the added family beside the listed ones', () => {
    const { profile } = entry()
    registerPackProfiles([entry()])
    const suggestion = suggestThreat(profile, {
      userPrompt: 'The levee gives way',
      learningObjectives: [],
      constraints: [],
    })
    render(
      <ThreatChoice
        profile={profile}
        suggestion={suggestion}
        value={undefined}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('radio', { name: /^River flood A river/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /^Cyber incident/ })).toBeTruthy()
    expect(screen.getByText('Suggested: River flood')).toBeTruthy()
  })
})
