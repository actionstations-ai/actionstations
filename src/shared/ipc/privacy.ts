// privacy:* (#433): review policy and redaction settings, pending cloud approvals, the redaction
// sample on the settings screens, and the per-project send log.
import { z } from 'zod'
import { channel } from './define'
import {
  CloudSendEntry,
  OutboundManifest,
  PrivacySettings,
  ProjectPrivacy,
  RedactionSpan,
} from '../schemas/privacy'

export const PrivacyView = z.object({
  global: PrivacySettings,
  project: ProjectPrivacy.optional(),
  effective: PrivacySettings,
})
export type PrivacyView = z.infer<typeof PrivacyView>

export const ApprovalDecision = z.enum(['send', 'approve-documents', 'cancel'])
export type ApprovalDecision = z.infer<typeof ApprovalDecision>

export const ApprovalNeededEvent = z.object({
  requestId: z.string(),
  jobId: z.string().optional(),
  providerLabel: z.string(),
  host: z.string(),
})
export type ApprovalNeededEvent = z.infer<typeof ApprovalNeededEvent>

export const privacyChannels = {
  /** Global defaults, the project's overrides (with a path) and the settings in effect. */
  'privacy:get': channel(z.object({ projectPath: z.string().optional() }), PrivacyView),
  /**
   * Save global defaults (no path) or a project's overrides (`clear` drops them). Turning
   * review `off` needs `confirmOff`: the screen asks first, naming the provider.
   */
  'privacy:set': channel(
    z.strictObject({
      projectPath: z.string().optional(),
      settings: ProjectPrivacy,
      clear: z.boolean().optional(),
      confirmOff: z.literal(true).optional(),
    }),
    PrivacyView,
  ),
  /** Requests waiting for approval, oldest first (all, or one job's). */
  'privacy:pending': channel(z.object({ jobId: z.string().optional() }), z.array(OutboundManifest)),
  /**
   * Answer a pending request. `requestHash` must be the hash of the manifest the user saw:
   * the approval binds to that exact content (FR-8).
   */
  'privacy:decide': channel(
    z.strictObject({
      requestId: z.string().max(100),
      requestHash: z.string().max(128),
      decision: ApprovalDecision,
    }),
    z.void(),
  ),
  /** Redact a sample with the project's settings (settings screen); nothing is sent anywhere. */
  'privacy:preview-redaction': channel(
    z.object({ projectPath: z.string().optional(), text: z.string().max(20_000) }),
    z.object({ text: z.string(), spans: z.array(RedactionSpan) }),
  ),
  /** The project's send log, newest first. `before` is an ISO time for paging. */
  'privacy:sends': channel(
    z.object({
      projectPath: z.string(),
      limit: z.number().int().min(1).max(1000).optional(),
      before: z.string().max(40).optional(),
    }),
    z.array(CloudSendEntry),
  ),
}
