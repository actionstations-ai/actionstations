// The IPC contract. Each domain declares its channels in its own file; this module merges
// them. Main validates every request with the `req` schema; the renderer gets typed calls
// through window.api (src/preload) and src/renderer/src/lib/api.ts.
import { z } from 'zod'
import { appChannels } from './app'
import { projectChannels } from './project'
import { documentChannels } from './documents'
import { providerChannels } from './providers'
import { promptChannels } from './prompts'
import { generateChannels } from './generate'
import { jobChannels } from './jobs'
import { scenarioChannels } from './scenario'
import { injectChannels } from './injects'
import { renderChannels } from './render'
import { comfyChannels } from './comfy'
import { exportChannels } from './export'
import { facilitatorChannels, PresentChangedEvent } from './facilitator'
import { evaluationChannels } from './evaluation'
import { exampleChannels } from './examples'
import { domainChannels, DomainsChangedEvent } from './domains'
import { packChannels, PacksChangedEvent } from './packs'
import { templateChannels, TemplatesChangedEvent } from './templates'
import { packDocumentChannels } from './pack-documents'
import { packExportChannels } from './pack-export'
import { setupChannels } from './setup'
import { updateChannels } from './updates'
import { surveyChannels } from './surveys'
import { groundingChannels } from './grounding'
import { aarChannels } from './aar'
import { ApprovalNeededEvent, privacyChannels } from './privacy'
import { complianceChannels } from './compliance'
import { liveChannels, LiveChangedEvent } from './live'
import { hotwashChannels, HotwashRecordingEvent } from './hotwash'
import { JobDoneEvent, JobProgressEvent, JobTokenEvent } from '../schemas/job'

export * from './define'
import type { ChannelDef } from './define'
export { JobLogEntry } from './jobs'
export { HistoryEntry } from './scenario'
export { LibraryItem } from './injects'
export { TemplateInfo, TemplateSource } from './render'
export { ListedInjectType, RefusedTemplateView } from './templates'
export { WorkflowBinding, WorkflowEntry, MediaType } from './comfy'
export {
  CompletenessReport,
  EXPORT_TARGETS,
  ExportOptions,
  ExportTarget,
  PREVIEW_DOC_IDS,
} from './export'
export { FacilitatorState } from './facilitator'
export { ExampleInfo, ExampleManifest, ExampleMarker, ExampleMarkerView } from './examples'
export { ListedDomainProfile } from './domains'
export { PackDocumentRef, PackDocumentView } from './pack-documents'
export { SetupInstallResult } from './setup'
export { UpdateStatus } from './updates'
export { SurveyListItem } from './surveys'
export { GroundingItemKey } from './grounding'
export { LiveSessionInfo } from './aar'
export { ApprovalDecision, ApprovalNeededEvent, PrivacyView } from './privacy'
export {
  ComplianceList,
  ComplianceSource,
  CoverageReportView,
  ListedFramework,
  ListedRegulation,
} from './compliance'
export { HotwashListing, MicArmResult, SpeechModelView } from './hotwash'
export {
  PACK_CONTRIBUTION_URL,
  COMMON_PACK_LICENSES,
  PackExportRequest,
  PackExportSources,
  PackExportCheckResult,
  PackExportSaveResult,
} from './pack-export'
export {
  OFFICIAL_CATALOG_URL,
  CachedCatalogView,
  CatalogRefreshResult,
  PackDownloadRequest,
  PackDownloadResult,
  InstalledPackView,
  PackConflictView,
  PackInspectRequest,
  PackInspectResult,
  PackInstallAction,
  PackInstallRequest,
  PackInstallResult,
  PackReview,
  PackUpdateView,
  PackVerifyResult,
  PacksChangedEvent,
} from './packs'

/** Merge domain channel maps, refusing duplicate names (a spread would silently overwrite). */
export function mergeChannels<T extends Record<string, ChannelDef>[]>(
  ...maps: T
): UnionToIntersection<T[number]> {
  const out: Record<string, ChannelDef> = {}
  for (const m of maps) {
    for (const [name, def] of Object.entries(m)) {
      if (name in out) throw new Error(`Duplicate IPC channel "${name}"`)
      out[name] = def
    }
  }
  return out as UnionToIntersection<T[number]>
}
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never

export const channels = mergeChannels(
  appChannels,
  projectChannels,
  documentChannels,
  providerChannels,
  promptChannels,
  generateChannels,
  jobChannels,
  scenarioChannels,
  injectChannels,
  renderChannels,
  comfyChannels,
  exportChannels,
  facilitatorChannels,
  evaluationChannels,
  exampleChannels,
  domainChannels,
  packChannels,
  templateChannels,
  packDocumentChannels,
  packExportChannels,
  setupChannels,
  updateChannels,
  surveyChannels,
  groundingChannels,
  aarChannels,
  privacyChannels,
  complianceChannels,
  liveChannels,
  hotwashChannels,
)

export type Channels = typeof channels
export type Channel = keyof Channels
export type ChannelRequest<C extends Channel> = z.input<Channels[C]['req']>
export type ChannelRequestParsed<C extends Channel> = z.output<Channels[C]['req']>
export type ChannelResponse<C extends Channel> = z.output<Channels[C]['res']>

/** Main → renderer push events. */
export const events = {
  'job:progress': JobProgressEvent,
  'job:token': JobTokenEvent,
  'job:done': JobDoneEvent,
  /** Main is about to quit: save what you can, then answer with app:unsaved-report (#196). */
  'app:quit-check': z.object({ requestId: z.string() }),
  /** The OS asked the app to open a project folder (double-clicked .asproj, #277). */
  'app:open-project': z.object({ path: z.string() }),
  /** The OS asked the app to open an .aspack file (#268): show its review, never install. */
  'app:open-pack': z.object({ path: z.string() }),
  'facilitator:present-changed': PresentChangedEvent,
  /** The pack domain profiles changed: refetch domains:list (#263). */
  'domains:changed': DomainsChangedEvent,
  /** Installed packs changed (install, enable, disable, update, uninstall): refetch packs:list (#260). */
  'packs:changed': PacksChangedEvent,
  /** Inject types added by user or pack templates changed: refetch templates:taxonomy / list (#261). */
  'templates:changed': TemplatesChangedEvent,
  /** The update check's setting or result changed: refetch updates:status (#442). */
  'updates:changed': z.object({}),
  /** A cloud request waits for the user's approval (#433): open the approval dialog. */
  'outbound:approval-needed': ApprovalNeededEvent,
  /** A pending cloud request was answered or dropped (cancelled job): refetch privacy:pending. */
  'outbound:approval-settled': z.object({ requestId: z.string() }),
  /** A live session started, stopped or changed its device count (#407): refetch live:session-status. */
  'live:changed': LiveChangedEvent,
  /** A hot wash recording started or stopped (#425): the presentation notice follows it. */
  'hotwash:recording': HotwashRecordingEvent,
  'project:changed': z.object({
    path: z.string(),
    what: z.enum([
      'project',
      'documents',
      'scenarios',
      'scenario',
      'injects',
      'media',
      'prompts',
      'workflows',
      'settings',
      'providers',
      'library',
      'surveys',
      'plan-conflicts',
      /** aar.json or documents/aar.md changed (#419). */
      'aar',
      'hotwash',
    ]),
    scenarioId: z.string().optional(),
  }),
}
export type Events = typeof events
export type EventName = keyof Events
export type EventPayload<E extends EventName> = z.output<Events[E]>

export const CHANNEL_NAMES = Object.keys(channels) as Channel[]
export const EVENT_NAMES = Object.keys(events) as EventName[]
