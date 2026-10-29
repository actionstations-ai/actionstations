// FR-1: which providers are cloud providers. The rule lives in src/shared so the renderer's
// Cloud marker and the gate agree; this module is the main-process entry point.
export { canTreatAsLocal, isRemoteProvider, providerHost } from '@shared/provider-network'
