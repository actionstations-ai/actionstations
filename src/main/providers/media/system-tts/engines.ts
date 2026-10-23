// The operating-system speech engines behind the system-voice provider (ADR-0009 fallback).
// Each engine reads the line from a UTF-8 text file and writes a WAV file; paths and the voice
// travel as argv entries (or, for PowerShell, environment variables read by a fixed script),
// never through a shell, so exercise text cannot become a command.

export type EngineId = 'say' | 'sapi' | 'espeak-ng' | 'espeak'

export interface SpeakArgs {
  textFile: string
  outFile: string
  voice?: string | undefined
}

export interface Invocation {
  args: string[]
  env?: Record<string, string>
}

export interface Engine {
  id: EngineId
  label: string
  /** Executable looked up on PATH (Windows also checks the system PowerShell path). */
  command: string
  speak(a: SpeakArgs): Invocation
  listVoices: Invocation
  parseVoices(stdout: string): string[]
  /** Distinct voices for successive speakers when none are configured. */
  speakerPool(installed: string[], base: string | undefined): string[]
}

/** macOS voices that read a dispatcher line clearly (novelty voices are left out). */
const SAY_PREFERRED = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Tessa', 'Rishi', 'Alex', 'Fred']

const say: Engine = {
  id: 'say',
  label: 'macOS say',
  command: 'say',
  speak: ({ textFile, outFile, voice }) => ({
    args: [
      ...(voice ? ['-v', voice] : []),
      '-f',
      textFile,
      '-o',
      outFile,
      '--file-format=WAVE',
      '--data-format=LEI16@22050',
    ],
  }),
  listVoices: { args: ['-v', '?'] },
  // "Samantha            en_US    # Hello! My name is Samantha."
  parseVoices: (stdout) =>
    stdout
      .split('\n')
      .map((l) => /^(.+?)\s+[a-z]{2,3}_[A-Z0-9]{2,3}\s+#/.exec(l)?.[1]?.trim())
      .filter((v): v is string => !!v),
  speakerPool: (installed, base) => {
    const preferred = SAY_PREFERRED.filter((v) => installed.includes(v))
    return unique([...(base ? [base] : []), ...preferred])
  },
}

// Fixed script: the text file, output file and voice arrive as environment variables.
const SAPI_SPEAK = [
  'Add-Type -AssemblyName System.Speech',
  '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  'if ($env:TTX_TTS_VOICE) { $s.SelectVoice($env:TTX_TTS_VOICE) }',
  '$s.SetOutputToWaveFile($env:TTX_TTS_OUT)',
  '$s.Speak([IO.File]::ReadAllText($env:TTX_TTS_IN, [Text.Encoding]::UTF8))',
  '$s.Dispose()',
].join('; ')

const SAPI_VOICES = [
  'Add-Type -AssemblyName System.Speech',
  '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  '$s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name }',
].join('; ')

const POWERSHELL = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command']

const sapi: Engine = {
  id: 'sapi',
  label: 'Windows speech (SAPI)',
  command: 'powershell.exe',
  speak: ({ textFile, outFile, voice }) => ({
    args: [...POWERSHELL, SAPI_SPEAK],
    env: { TTX_TTS_IN: textFile, TTX_TTS_OUT: outFile, TTX_TTS_VOICE: voice ?? '' },
  }),
  listVoices: { args: [...POWERSHELL, SAPI_VOICES] },
  parseVoices: (stdout) =>
    stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean),
  speakerPool: (installed, base) => unique([...(base ? [base] : []), ...installed]),
}

function espeakEngine(id: 'espeak-ng' | 'espeak'): Engine {
  return {
    id,
    label: id,
    command: id,
    speak: ({ textFile, outFile, voice }) => ({
      args: [...(voice ? ['-v', voice] : []), '-w', outFile, '-f', textFile],
    }),
    listVoices: { args: ['--voices'] },
    // " 2  en-us           --/M      English_(America)  gmw/en-US            (en 3)"
    // Mbrola voices (mb/…) need extra packages, so they are not offered.
    parseVoices: (stdout) =>
      stdout
        .split('\n')
        .slice(1)
        .map((l) => l.trim().split(/\s+/))
        .filter((cols) => cols.length >= 5 && !cols[4]!.startsWith('mb/'))
        .map((cols) => cols[1]!),
    // Variants (+f3, +m3) change pitch and timbre, enough to tell two callers apart.
    speakerPool: (_installed, base) => {
      const b = base?.split('+')[0] || 'en-us'
      return unique([base ?? b, b, `${b}+f3`, `${b}+m3`, `${b}+f2`])
    },
  }
}

export const ENGINES: Record<EngineId, Engine> = {
  say,
  sapi,
  'espeak-ng': espeakEngine('espeak-ng'),
  espeak: espeakEngine('espeak'),
}

/** Engines to look for on each platform, best first. */
export function enginesFor(platform: NodeJS.Platform): Engine[] {
  if (platform === 'darwin') return [ENGINES.say, ENGINES['espeak-ng'], ENGINES.espeak]
  if (platform === 'win32') return [ENGINES.sapi, ENGINES['espeak-ng']]
  return [ENGINES['espeak-ng'], ENGINES.espeak]
}

export const isEngineId = (v: unknown): v is EngineId =>
  typeof v === 'string' && Object.hasOwn(ENGINES, v)

/** Voice names go into argv: letters, digits, spaces and a little punctuation, no leading dash. */
export const isSafeVoice = (v: string): boolean =>
  /^[\p{L}\p{N}][\p{L}\p{N} ._()+-]{0,63}$/u.test(v)

/**
 * The line as the engine should read it: no control characters, and no `[[ … ]]` blocks
 * (macOS `say` treats them as embedded speech commands).
 */
export function speakableText(text: string): string {
  return text
    .replace(/\[\[|\]\]/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function unique(list: string[]): string[] {
  return [...new Set(list.filter(Boolean))]
}
