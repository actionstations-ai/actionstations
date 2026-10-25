// The project's fact category definitions for the facts editor (#180): the effective profile's
// categories, and saving one through project:update. Main extracts the facts again before it
// answers, so the page then reloads facility-facts.md and re-runs the scenario check.
import { useState } from 'react'
import { resolveProfile, type DomainProfileOverrides, type FactCategory } from '@shared/domains'
import { toast } from '../../components/toast-store'
import { errorText } from '../../lib/errors'
import { queryClient, useIpcMutation, useIpcQuery } from '../../lib/query'
import { useDomainRegistry } from '../../state/domains'
import { isCustomized, overridesWith, overridesWithDefault } from './lint-definition'
import { QUERY } from './use-facts-file'

export interface LintDefinitions {
  /** The effective definition of a category, when the domain profile defines it. */
  spec: (id: string) => FactCategory | undefined
  customized: (id: string) => boolean
  save: (spec: FactCategory) => Promise<boolean>
  restore: (id: string, label: string) => Promise<boolean>
  saving: boolean
  announce: string
}

export function useLintDefinitions(path: string, relint: () => unknown): LintDefinitions {
  useDomainRegistry()
  const query = useIpcQuery('project:get', { path }, { enabled: !!path })
  const update = useIpcMutation('project:update', {
    invalidates: ['project:get', 'scenarios:lint'],
  })
  const [announce, setAnnounce] = useState('')
  const project = query.data?.project
  const categories = project
    ? resolveProfile(project.orgType, project.domainProfileOverrides, project.domainProfileSnapshot)
        .factCategories
    : []

  const write = async (overrides: DomainProfileOverrides | null, message: string) => {
    try {
      await update.mutateAsync({ path, patch: { domainProfileOverrides: overrides } })
      await queryClient.invalidateQueries({ queryKey: [QUERY] })
      setAnnounce(message)
      toast.success(message)
      void relint()
      return true
    } catch (err) {
      toast.error('Could not save the lint definition', errorText(err))
      return false
    }
  }

  return {
    spec: (id) => categories.find((c) => c.id === id),
    customized: (id) => !!project && isCustomized(project, categories, id),
    save: async (spec) =>
      !!project &&
      write(overridesWith(project, categories, spec), `Lint definition for ${spec.label} saved`),
    restore: async (id, label) =>
      !!project &&
      write(
        overridesWithDefault(project, categories, id),
        `${label} uses the domain’s lint definition again`,
      ),
    saving: update.isPending,
    announce,
  }
}
