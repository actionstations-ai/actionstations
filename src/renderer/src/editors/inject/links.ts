import { projectKey } from '../../state/project'

/** The scenario screen with the Injects tab open. */
export const deckUrl = (projectPath: string, scenarioId: string): string =>
  `/p/${projectKey(projectPath)}/scenarios/${scenarioId}?tab=injects`

/** The inject editor route. */
export const injectUrl = (projectPath: string, scenarioId: string, injectId: string): string =>
  `/p/${projectKey(projectPath)}/scenarios/${scenarioId}/injects/${injectId}`
