// The eight built-in threat families keep their ids and their exact prompt text (#655): the
// family data moved into a registry, and every prompt that renders a family must come out
// byte for byte as before. GOLDEN_UPDATE=1 rewrites the golden file (only when a family or a
// prompt is changed on purpose).
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { THREAT_FAMILIES, threatFamily, type ThreatFamily } from '@shared/domains'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

process.env.TTX_RESOURCES = resolve(process.cwd())
process.env.TTX_USER_DATA = mkdtempSync(resolve(tmpdir(), 'ttx-golden-'))

const { loadPrompt, renderPrompt } = await import('../prompts')
const { threatVars } = await import('./domain')

const GOLDEN = resolve(process.cwd(), 'tests/fixtures/threat-families/prompt-hashes.json')
const sha = (s: string): string => createHash('sha256').update(s).digest('hex')

function promptNamesUsingThreat(): string[] {
  const dir = resolve(process.cwd(), 'prompts')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => readFileSync(resolve(dir, f), 'utf8').includes('threat.'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort()
}

async function currentHashes(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const fam of THREAT_FAMILIES) {
    out[`vars:${fam.id}`] = sha(JSON.stringify(threatVars(fam)))
    for (const name of promptNamesUsingThreat()) {
      const r = renderPrompt(await loadPrompt(name), { threat: threatVars(fam) })
      out[`${name}:${fam.id}`] = sha(
        `${r.system}\n---\n${r.user}\n---\n${r.cacheableContext ?? ''}`,
      )
    }
  }
  return out
}

describe('built-in threat families render byte-identically', () => {
  it('keeps the eight ids in order', () => {
    expect(THREAT_FAMILIES.map((t) => t.id)).toEqual([
      'cyber',
      'cyber_physical',
      'physical_security',
      'uas_drone',
      'insider',
      'natural_hazard',
      'infrastructure_failure',
      'mass_gathering',
    ])
  })

  it('matches the golden hashes of every prompt that renders a family', async () => {
    const now = await currentHashes()
    if (process.env.GOLDEN_UPDATE) writeFileSync(GOLDEN, JSON.stringify(now, null, 2) + '\n')
    expect(now).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')))
  })
})

describe('a pack-added family', () => {
  const added: ThreatFamily = {
    ...threatFamily('natural_hazard'),
    id: 'river_flood',
    label: 'River flood',
    purposeMix: { CLUE: 30, NOISE: 10 },
    promptGuidance: 'Gauge readings arrive late.',
  }

  it('shows its purpose mix and guidance in the prompts that describe the incident', async () => {
    for (const name of ['msel_phase', 'phase_plan']) {
      const r = renderPrompt(await loadPrompt(name), { threat: threatVars(added) })
      const text = `${r.system}\n${r.user}`
      expect(text, name).toContain('weighted roughly: CLUE 30, NOISE 10.')
      expect(text, name).toContain('Gauge readings arrive late.')
    }
  })

  it('leaves both out for a family without them', () => {
    const vars = threatVars(threatFamily('natural_hazard'))
    expect(vars).not.toHaveProperty('purposeMixText')
    expect(vars).not.toHaveProperty('promptGuidance')
  })
})
