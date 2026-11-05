/**
 * One example decision form for tests. Forms ship with toolkits, never with the app; this one
 * exists so the schema, the protocol, the player screen and Facilitate can be exercised.
 */
import type { DecisionForm } from '../schemas/decisions'

export const WARNING_FORM: DecisionForm = {
  id: 'issue-warning',
  title: 'Issue a warning',
  kind: 'warning',
  description: 'Warn the public about a hazard in part of the area.',
  seats: ['ops-director', 'pio'],
  fields: [
    {
      id: 'level',
      type: 'choice',
      label: 'Level',
      required: true,
      options: [
        { id: 'watch', label: 'Watch' },
        { id: 'warning', label: 'Warning' },
      ],
    },
    {
      id: 'area',
      type: 'area',
      label: 'Area',
      required: true,
      draw: true,
      areas: [
        { id: 'north', label: 'North district' },
        { id: 'harbor', label: 'Harbor' },
      ],
    },
    { id: 'effective', type: 'time', label: 'Effective at', required: false },
    {
      id: 'people',
      type: 'number',
      label: 'People affected',
      required: false,
      integer: true,
      min: 0,
      max: 100000,
      unit: 'people',
    },
    { id: 'note', type: 'text', label: 'Note', required: false, maxLength: 200 },
  ],
}
