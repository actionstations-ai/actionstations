// What a cloud request must leave out (#502): documents the project marks never-send, and plan
// sections the user left out of an approval earlier in the same job.
import { registerWithheldSource, type WithheldSections } from '../../generate/deps'
import { approvals } from './index'
import { privacyFor } from './settings'

export async function withheldFromCloud(
  projectPath: string | undefined,
  jobId: string,
): Promise<WithheldSections> {
  const { effective } = await privacyFor(projectPath)
  return { documents: new Set(effective.neverSend), chunks: approvals.leftOut(jobId) }
}

registerWithheldSource(withheldFromCloud)
