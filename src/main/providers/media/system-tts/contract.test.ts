// Contract tests for the system-voice provider with a stubbed process runner: what is spawned,
// how the text travels (a temp file, never argv or a shell), and the WAV it hands to post-FX.
import { mkdtempSync, promises as fs, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import { silentWav, wavDurationSec } from '../../text/openai-compatible/wav'
import { applyPostFx, decodeWav } from '../audio-fx'
import type { MediaJob } from '../../types'
import type { DetectEnv } from './detect'
import { ENGINES, speakableText } from './engines'
import { SystemVoiceProvider } from './provider'
import type { RunOptions, RunResult, Runner } from './run'
import { runCommand } from './run'
import { detectSystemVoice } from './service'
import { adapter } from './adapter'

interface Call {
  command: string
  args: string[]
  env: Record<string, string> | undefined
  text: string | undefined
}

const SAY_VOICES = [
  'Albert              en_US    # Hello! My name is Albert.',
  'Daniel              en_GB    # Hello! My name is Daniel.',
  'Eddy (English (US)) en_US    # Hello! My name is Eddy.',
  'Samantha            en_US    # Hello! My name is Samantha.',
].join('\n')

/** Records each spawn; a speak call gets a real WAV written where the engine would write it. */
function stubRunner(opts: { voices?: string; code?: number; stderr?: string } = {}) {
  const calls: Call[] = []
  const run: Runner = async (command, args, o: RunOptions): Promise<RunResult> => {
    const out = outputPath(args, o.env)
    const input = inputPath(args, o.env)
    const text = input ? await fs.readFile(input, 'utf8') : undefined
    calls.push({ command, args, env: o.env, text })
    if (!out) return { code: 0, stdout: opts.voices ?? '', stderr: '' }
    if ((opts.code ?? 0) === 0) await fs.writeFile(out, silentWav(0.5, 22_050))
    return { code: opts.code ?? 0, stdout: '', stderr: opts.stderr ?? '' }
  }
  return { run, calls }
}

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const outputPath = (args: string[], env?: Record<string, string>) =>
  env?.TTX_TTS_OUT ?? flagValue(args, '-o') ?? flagValue(args, '-w')
const inputPath = (args: string[], env?: Record<string, string>) =>
  env?.TTX_TTS_IN ?? flagValue(args, '-f')

/** A machine with exactly these executables. */
function machine(platform: NodeJS.Platform, executables: string[]): DetectEnv {
  const sep = platform === 'win32' ? ';' : ':'
  return {
    platform,
    env: { PATH: ['/usr/bin', '/opt/bin'].join(sep), SystemRoot: 'C:\\Windows' },
    isExecutable: (p) => executables.includes(p),
  }
}

const config = (options: Record<string, unknown> = {}, defaultModel?: string): ProviderConfig => ({
  id: 'system-voice',
  kind: 'system-tts',
  label: 'System voice',
  options,
  enabled: true,
  ...(defaultModel ? { defaultModel } : {}),
})

let outDir: string
beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'ttx-sysvoice-'))
})
afterEach(() => rmSync(outDir, { recursive: true, force: true }))

const job = (voiceLines: { speaker: string; text: string }[]): MediaJob => ({
  kind: 'audio',
  injectId: 'I-06',
  brief: { paths: ['tts'], voiceLines: voiceLines.map((l) => ({ ...l, voiceStyle: '' })) },
  outDir,
})

describe('system voice: macOS say', () => {
  const mac = machine('darwin', ['/usr/bin/say'])

  it('is registered as an audio-only adapter for the system-tts kind', () => {
    expect(adapter.kind).toBe('system-tts')
    expect([...adapter.createMedia!(config(), undefined).capabilities()]).toEqual(['audio'])
  })

  it('reads the line from a temp file and writes WAV, with argv only (no shell)', async () => {
    const { run, calls } = stubRunner()
    const p = new SystemVoiceProvider(config({ voice: 'Samantha' }), { run, detect: mac })
    const [out] = await p.generate(
      job([{ speaker: 'PA', text: 'All flights from Concourse A are delayed.' }]),
    )
    expect(calls).toHaveLength(1)
    const c = calls[0]!
    expect(c.command).toBe('/usr/bin/say')
    expect(c.args.slice(0, 3)).toEqual(['-v', 'Samantha', '-f'])
    expect(c.args).toContain('--file-format=WAVE')
    expect(c.args).toContain('--data-format=LEI16@22050')
    expect(c.text).toBe('All flights from Concourse A are delayed.')
    expect(out!.mimeType).toBe('audio/wav')
    expect(out!.durationSec).toBeCloseTo(0.5, 1)
    expect(out!.provenance).toMatchObject({ provider: 'system-voice', model: 'say: Samantha' })
    // Only the joined output remains; the per-line text and WAV files are removed.
    expect(readdirSync(outDir)).toEqual([out!.filePath.split('/').pop()])
  })

  it('never puts exercise text into argv, even when it looks like shell syntax', async () => {
    const { run, calls } = stubRunner()
    const p = new SystemVoiceProvider(config(), { run, detect: mac })
    const hostile = 'Call ended"; rm -rf ~ $(whoami) `id` | tee /etc/passwd [[volm 0]]'
    await p.generate(job([{ speaker: 'Caller', text: hostile }]))
    const c = calls[0]!
    for (const a of c.args) expect(a).not.toMatch(/rm -rf|whoami|passwd/)
    expect(c.text).toBe(speakableText(hostile))
    expect(c.text).not.toContain('[[')
  })

  it('gives each unmapped speaker a different installed voice', async () => {
    const { run, calls } = stubRunner({ voices: SAY_VOICES })
    const p = new SystemVoiceProvider(config(), { run, detect: mac })
    const [out] = await p.generate(
      job([
        { speaker: 'Caller', text: 'There is a bag by gate four.' },
        { speaker: 'Dispatcher', text: 'Stay on the line.' },
        { speaker: 'Caller', text: 'It is ticking.' },
      ]),
    )
    const speakCalls = calls.filter((c) => c.text !== undefined)
    expect(calls[0]!.args).toEqual(['-v', '?'])
    expect(speakCalls.map((c) => flagValue(c.args, '-v'))).toEqual([
      'Samantha',
      'Daniel',
      'Samantha',
    ])
    // Three 0.5 s clips plus two 0.35 s gaps.
    expect(wavDurationSec(await fs.readFile(out!.filePath))).toBeCloseTo(2.2, 1)
  })

  it('uses options.voices per speaker and rejects voice names that could act as flags', async () => {
    const { run, calls } = stubRunner()
    const ok = new SystemVoiceProvider(config({ voices: { Tower: 'Daniel' } }), {
      run,
      detect: mac,
    })
    await ok.generate(job([{ speaker: 'Tower', text: 'Hold short.' }]))
    expect(flagValue(calls[0]!.args, '-v')).toBe('Daniel')
    const bad = new SystemVoiceProvider(config({}, '--output-file=/tmp/x'), { run, detect: mac })
    await expect(bad.generate(job([{ speaker: 'A', text: 'x' }]))).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })

  it('reports a failing engine as a provider error and cleans up', async () => {
    const { run } = stubRunner({ code: 1, stderr: 'Voice `Nobody` not found.' })
    const p = new SystemVoiceProvider(config({ voice: 'Nobody' }), { run, detect: mac })
    await expect(p.generate(job([{ speaker: 'A', text: 'Hello' }]))).rejects.toMatchObject({
      code: 'PROVIDER',
      message: expect.stringContaining('not found'),
    })
    expect(readdirSync(outDir)).toEqual([])
  })

  it('rejects non-audio jobs and briefs with nothing to say', async () => {
    const { run } = stubRunner()
    const p = new SystemVoiceProvider(config(), { run, detect: mac })
    await expect(p.generate({ ...job([]), kind: 'image' })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    await expect(p.generate(job([{ speaker: 'A', text: ' [[ ]] ' }]))).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })

  it('produces WAV the post-FX chain accepts', async () => {
    const { run } = stubRunner()
    const p = new SystemVoiceProvider(config(), { run, detect: mac })
    const [out] = await p.generate(job([{ speaker: 'Ops', text: 'Radio check.' }]))
    const wet = applyPostFx(await fs.readFile(out!.filePath), ['radio'])
    expect(decodeWav(wet).sampleRate).toBe(44_100)
  })
})

describe('system voice: Windows SAPI', () => {
  const ps = 'C:\\Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
  const win = machine('win32', [ps])

  it('runs a fixed PowerShell script and passes paths and voice through the environment', async () => {
    const { run, calls } = stubRunner()
    const p = new SystemVoiceProvider(config({ voice: 'Microsoft Zira Desktop' }), {
      run,
      detect: win,
    })
    await p.generate(job([{ speaker: 'PIO', text: "It's $env:USERNAME; exit" }]))
    const c = calls[0]!
    expect(c.command).toBe(ps)
    expect(c.args.slice(0, 5)).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
    ])
    expect(c.args[5]).toContain('SetOutputToWaveFile($env:TTX_TTS_OUT)')
    expect(c.args.join(' ')).not.toContain('USERNAME')
    expect(c.env).toMatchObject({ TTX_TTS_VOICE: 'Microsoft Zira Desktop' })
    expect(c.text).toBe("It's $env:USERNAME; exit")
  })
})

describe('system voice: Linux espeak', () => {
  it('prefers espeak-ng, writes with -w, and varies the voice per speaker', async () => {
    const linux = machine('linux', ['/usr/bin/espeak', '/opt/bin/espeak-ng'])
    const { run, calls } = stubRunner()
    const p = new SystemVoiceProvider(config(), { run, detect: linux })
    await p.generate(
      job([
        { speaker: 'A', text: 'one' },
        { speaker: 'B', text: 'two' },
      ]),
    )
    const speak = calls.filter((c) => c.text !== undefined)
    expect(speak.map((c) => c.command)).toEqual(['/opt/bin/espeak-ng', '/opt/bin/espeak-ng'])
    expect(speak.map((c) => flagValue(c.args, '-v'))).toEqual(['en-us', 'en-us+f3'])
    expect(speak[0]!.args).toContain('-w')
  })

  it('honours options.engine when that engine is installed', () => {
    const linux = machine('linux', ['/usr/bin/espeak', '/opt/bin/espeak-ng'])
    const p = new SystemVoiceProvider(config({ engine: 'espeak' }), { detect: linux })
    expect(p.engine()?.path).toBe('/usr/bin/espeak')
  })

  it('parses espeak-ng voices and skips mbrola voices', () => {
    const out = [
      'Pty Language       Age/Gender VoiceName          File                 Other Languages',
      ' 2  en-gb           --/M      English_(Great_Britain) gmw/en               (en 2)',
      ' 3  en-uk           --/M      english-mb-en1     mb/mb-en1            (en-gb 3)(en 2)',
      ' 2  en-us           --/M      English_(America)  gmw/en-US            (en 3)',
    ].join('\n')
    expect(ENGINES['espeak-ng'].parseVoices(out)).toEqual(['en-gb', 'en-us'])
  })
})

describe('system voice: detection', () => {
  it('reports no engine as unhealthy and refuses to generate', async () => {
    const none = machine('linux', [])
    const p = new SystemVoiceProvider(config(), { detect: none })
    expect(await p.health()).toMatchObject({ ok: false })
    await expect(p.generate(job([{ speaker: 'A', text: 'x' }]))).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('espeak-ng'),
    })
    expect(await detectSystemVoice(none)).toBeUndefined()
  })

  it('lists the system voice as a local service only when an engine is present', async () => {
    const { run } = stubRunner({ voices: SAY_VOICES })
    const found = await detectSystemVoice(machine('darwin', ['/usr/bin/say']), run)
    expect(found).toEqual({
      kind: 'system-tts',
      label: 'System voice (macOS say)',
      baseUrl: '',
      reachable: true,
      models: ['Samantha', 'Daniel'],
      loadedModels: [],
      chatModels: [],
    })
  })

  it('parses `say -v ?` including names with spaces', () => {
    expect(ENGINES.say.parseVoices(SAY_VOICES)).toEqual([
      'Albert',
      'Daniel',
      'Eddy (English (US))',
      'Samantha',
    ])
  })
})

describe('runCommand', () => {
  const node = process.execPath

  it('passes argv verbatim without a shell', async () => {
    const res = await runCommand(node, ['-e', 'console.log(process.argv[1])', '$(echo hi); ls'], {
      timeoutMs: 10_000,
    })
    expect(res.code).toBe(0)
    expect(res.stdout.trim()).toBe('$(echo hi); ls')
  })

  it('kills a command that runs past its timeout', async () => {
    await expect(
      runCommand(node, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 200 }),
    ).rejects.toMatchObject({ code: 'PROVIDER', message: expect.stringContaining('timed out') })
  })

  it('stops on abort', async () => {
    const ctl = new AbortController()
    const p = runCommand(node, ['-e', 'setTimeout(() => {}, 10000)'], {
      timeoutMs: 10_000,
      signal: ctl.signal,
    })
    ctl.abort()
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' })
  })
})
