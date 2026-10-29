// Player material choices on the Export screen (spec 0435): language, large print and the
// override for unreviewed translations, and the ExportOptions they stand for.
import { useState } from 'react'
import type { ExportOptions } from '@shared/ipc'
import { useIpcQuery } from '../../lib/query'

export type PlayerLanguageChoice = 'en' | 'es' | 'both'

export const CHOICES: { id: PlayerLanguageChoice; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
  { id: 'both', label: 'English and Spanish' },
]

export function usePlayerMaterial(projectPath: string, scenarioId: string) {
  const [choice, setChoice] = useState<PlayerLanguageChoice>('en')
  const [largePrint, setLargePrint] = useState(false)
  const [allowUnreviewed, setAllowUnreviewed] = useState(false)
  const [controller, setController] = useState(false)
  const status = useIpcQuery('translate:status', { projectPath, scenarioId, lang: 'es' })
  const spanish = choice !== 'en'
  const unreviewed = (status.data?.items ?? []).filter((i) => i.status !== 'reviewed')
  /** The ExportOptions these choices stand for (only what was chosen). */
  const options = (): ExportOptions => ({
    ...(choice === 'es' ? { playerLanguages: ['es' as const] } : {}),
    ...(choice === 'both' ? { playerLanguages: ['en' as const, 'es' as const] } : {}),
    ...(largePrint ? { largePrint: true } : {}),
    ...(spanish && allowUnreviewed ? { allowUnreviewed: true } : {}),
    ...(spanish && controller ? { controllerLanguages: ['es' as const] } : {}),
  })
  return {
    choice,
    setChoice,
    largePrint,
    setLargePrint,
    allowUnreviewed,
    setAllowUnreviewed,
    controller,
    setController,
    spanishOn: status.data?.languages.player.includes('es') ?? false,
    controllerOn: status.data?.languages.controller ?? false,
    unreviewed,
    spanish,
    options,
  }
}
