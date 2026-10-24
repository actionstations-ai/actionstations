// Packs in main (ADR-0018): reader/validator, staging extraction, template checker, the
// installer (#260) and the layer API that template, prompt, workflow, document and example
// loaders use (layers.ts; read its header).
export { readPack, contentSha256 } from './reader'
export type {
  PackBuiltins,
  PackItemSummary,
  PackProblem,
  PackSource,
  ReadPackOptions,
  ReadPackResult,
  VerifiedPack,
} from './reader'
export { extractPack } from './extract'
export { checkTemplateFiles, type TemplateFiles } from './template-check'
export { loadBuiltins } from './builtins'
export {
  enabledItems,
  enabledPacks,
  onPacksChanged,
  packAppliesToDomain,
  packById,
  packFilePath,
  packItemFiles,
  packItemPath,
  packsRevision,
  type InstalledPack,
} from './layers'
export { initPacks, loadPacks } from './state'
export {
  inspectPack,
  installPack,
  listInstalled,
  packUpdates,
  setPackEnabled,
  uninstallPack,
  verifyPacks,
  type PackContext,
} from './install'
