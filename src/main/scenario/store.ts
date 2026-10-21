// Scenario folder store (#28 workstream). Layout per docs/02:
//   scenarios/<id>/scenario.json, injects/<injectId>.json, documents/<kind>.md,
//   media/<injectId>/…, history/<artifact>.jsonl
// The generation pipeline (#25) depends only on these signatures.
import type { Inject, Scenario, ScenarioBrief, ScenarioDocKind } from '@shared/schemas'
import { AppError } from '../lib/errors'

export interface SaveOptions {
  by: 'user' | 'ai'
  note?: string
  /** Skip the history snapshot (e.g. frequent pipeline checkpoints). */
  snapshot?: boolean
}

const todo = (): never => {
  throw new AppError('NOT_IMPLEMENTED', 'Scenario store lands with #28')
}

/** Create scenarios/<id>/ and register it in project.json scenarios[]. */
export async function createScenario(
  _projectPath: string,
  _init: { title: string; brief: ScenarioBrief },
): Promise<Scenario> {
  return todo()
}
export async function getScenario(_projectPath: string, _scenarioId: string): Promise<Scenario> {
  return todo()
}
/**
 * Validate + atomically write scenario.json, update project.json ScenarioMeta, append a
 * history snapshot, emit project:changed {what:'scenario'}. Serialized per scenario.
 */
export async function saveScenario(
  _projectPath: string,
  _scenario: Scenario,
  _opts: SaveOptions,
): Promise<Scenario> {
  return todo()
}
/** Read-modify-write under the same per-scenario lock. */
export async function updateScenario(
  _projectPath: string,
  _scenarioId: string,
  _mutate: (s: Scenario) => Scenario | void,
  _opts: SaveOptions,
): Promise<Scenario> {
  return todo()
}
export async function readScenarioDoc(
  _projectPath: string,
  _scenarioId: string,
  _kind: ScenarioDocKind,
): Promise<string> {
  return todo()
}
/** Writes documents/<kind>.md, sets scenario.documents[kind] (project-root-relative), history. */
export async function writeScenarioDoc(
  _projectPath: string,
  _scenarioId: string,
  _kind: ScenarioDocKind,
  _markdown: string,
  _opts: SaveOptions,
): Promise<void> {
  return todo()
}
export async function listInjects(_projectPath: string, _scenarioId: string): Promise<Inject[]> {
  return todo()
}
export async function saveInject(
  _projectPath: string,
  _scenarioId: string,
  _inject: Inject,
  _opts: SaveOptions,
): Promise<Inject> {
  return todo()
}
