// The "Detect local services" row for the system voice: present only when an engine is
// installed, with a few voice names so the user sees what they would get.
import type { LocalService } from '../../local-detect'
import { findEngine, systemDetectEnv, type DetectEnv } from './detect'
import { runCommand, type Runner } from './run'

const LIST_TIMEOUT_MS = 3_000

export async function detectSystemVoice(
  d: DetectEnv = systemDetectEnv(),
  run: Runner = runCommand,
): Promise<LocalService | undefined> {
  const found = findEngine(d)
  if (!found) return undefined
  const { engine, path } = found
  let voices: string[] = []
  try {
    const res = await run(path, engine.listVoices.args, {
      ...(engine.listVoices.env ? { env: engine.listVoices.env } : {}),
      timeoutMs: LIST_TIMEOUT_MS,
    })
    if (res.code === 0) voices = engine.speakerPool(engine.parseVoices(res.stdout), undefined)
  } catch {
    voices = []
  }
  return {
    kind: 'system-tts',
    label: `System voice (${engine.label})`,
    baseUrl: '',
    reachable: true,
    models: voices,
    loadedModels: [],
    chatModels: [],
  }
}
