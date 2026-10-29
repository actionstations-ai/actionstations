// privacy:* (#433): review and redaction settings, pending cloud approvals, the redaction sample
// and the send log. Changing settings rebuilds every request still waiting for approval, so the
// dialog always shows what would actually be sent.
import { PrivacySettings, type ProjectPrivacy } from '@shared/schemas'
import { AppError } from '../../lib/errors'
import { requireProject } from '../../project/guard'
import { updateProject } from '../../project/store'
import { approvals } from '../../providers/outbound'
import { redactText } from '../../providers/outbound/redact'
import { readSends } from '../../providers/outbound/send-log'
import {
  detectContextFor,
  enabledCategories,
  privacyFor,
  registryFor,
} from '../../providers/outbound/settings'
import { updateSettings } from '../../settings/store'
import { defineHandlers } from '../registry'

const projectRoot = async (projectPath?: string): Promise<string | undefined> =>
  projectPath ? requireProject(projectPath) : undefined

/** Only the fields that are set (a project override never stores `undefined`). */
function defined(settings: ProjectPrivacy): ProjectPrivacy {
  return Object.fromEntries(
    Object.entries(settings).filter(([, v]) => v !== undefined),
  ) as ProjectPrivacy
}

async function saveGlobal(settings: ProjectPrivacy): Promise<void> {
  await updateSettings((s) => {
    s.privacy = PrivacySettings.parse({ ...s.privacy, ...defined(settings) })
  })
}

async function saveProject(root: string, settings: ProjectPrivacy, clear: boolean): Promise<void> {
  await updateProject(root, (p) => {
    if (clear || Object.keys(defined(settings)).length === 0) delete p.privacy
    else p.privacy = defined(settings)
  })
}

export default defineHandlers({
  'privacy:get': async ({ projectPath }) => privacyFor(await projectRoot(projectPath)),

  'privacy:set': async ({ projectPath, settings, clear, confirmOff }) => {
    if (settings.review === 'off' && !confirmOff)
      throw new AppError(
        'VALIDATION',
        'Turning review off sends requests to cloud providers without asking. Confirm it first.',
      )
    const root = await projectRoot(projectPath)
    if (root) await saveProject(root, settings, !!clear)
    else await saveGlobal(settings)
    approvals.recompute(root)
    return privacyFor(root)
  },

  'privacy:pending': ({ jobId }) => approvals.list(jobId),

  'privacy:decide': ({ requestId, requestHash, decision }) =>
    approvals.decide(requestId, requestHash, decision),

  'privacy:preview-redaction': async ({ projectPath, text }) => {
    const root = await projectRoot(projectPath)
    const settings = (await privacyFor(root)).effective
    const ctx = await detectContextFor(settings, root)
    const registry = await registryFor(root)
    const out = redactText(text, enabledCategories(settings), ctx, registry)
    return { text: out.text, spans: out.spans.map((s) => ({ part: 'sample', ...s })) }
  },

  'privacy:sends': async ({ projectPath, limit, before }) =>
    readSends(await requireProject(projectPath), {
      ...(limit ? { limit } : {}),
      ...(before ? { before } : {}),
    }),
})
