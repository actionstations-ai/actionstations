// Documents that must not be embedded by a cloud embedder (#502): the project's never-send
// list, or nothing when the embedder runs on this computer.
import type { EmbeddingProvider } from '../types'
import { privacyFor } from './settings'

export async function neverSendDocuments(
  projectPath: string | undefined,
  embedder: Pick<EmbeddingProvider, 'remote'> | undefined,
): Promise<ReadonlySet<string>> {
  if (!embedder?.remote) return new Set()
  return new Set((await privacyFor(projectPath)).effective.neverSend)
}
