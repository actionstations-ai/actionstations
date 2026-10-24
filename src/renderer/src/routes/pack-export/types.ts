// Response types the wizard reads, derived from the IPC contract.
import type { ChannelResponse } from '@shared/ipc'

export type PackExportSources = ChannelResponse<'packs:exportSources'>
export type PackExportCheck = ChannelResponse<'packs:exportCheck'>
export type PackExportSave = ChannelResponse<'packs:exportSave'>
export type RecentProjectView = ChannelResponse<'project:list-recent'>[number]
/** A pack that was built, validated and written. */
export type SavedPack = Extract<PackExportSave, { canceled: false }>
