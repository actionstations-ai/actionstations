// Publisher signature checks before anything downloaded runs (ADR-0021). macOS: the .app must
// pass `codesign --verify --deep --strict`, carry the pinned Team ID, and be accepted by
// Gatekeeper (`spctl`). Windows: Get-AuthenticodeSignature must say Valid with the pinned
// signer CN. Any other outcome refuses.
import { AppError } from '../lib/errors'
import type { ToolIdentity } from './catalog'
import { runCommand, type Runner } from './run'

const TIMEOUT_MS = 120_000

/** "TeamIdentifier=D65G88RHWN" from `codesign -dv` output; undefined for ad-hoc / unsigned. */
export function parseTeamId(codesignOutput: string): string | undefined {
  const m = /^TeamIdentifier=(.+)$/m.exec(codesignOutput)
  const v = m?.[1]?.trim()
  return v && v !== 'not set' ? v : undefined
}

/** The leaf "Developer ID Application: …" authority, for messages. */
export function parseAuthority(codesignOutput: string): string | undefined {
  return /^Authority=(Developer ID Application: .+)$/m.exec(codesignOutput)?.[1]?.trim()
}

function refuse(what: string, why: string): AppError {
  return new AppError(
    'VALIDATION',
    `${what} failed the publisher check: ${why}. Nothing was installed and the download was deleted.`,
  )
}

/** Verify a macOS app bundle (inside a mounted DMG, or after copying it). */
export async function verifyMacApp(
  appPath: string,
  identity: ToolIdentity,
  run: Runner = runCommand,
): Promise<{ teamId: string; authority?: string }> {
  const name = appPath.split('/').pop() ?? appPath
  const strict = await run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], {
    timeoutMs: TIMEOUT_MS,
  })
  if (strict.code !== 0)
    throw refuse(name, `the code signature is missing or invalid (${firstLine(strict.stderr)})`)
  const info = await run('codesign', ['-dv', '--verbose=2', appPath], { timeoutMs: TIMEOUT_MS })
  const out = `${info.stdout}\n${info.stderr}`
  const teamId = parseTeamId(out)
  if (!teamId) throw refuse(name, 'it has no Developer ID team (unsigned or ad-hoc signed)')
  if (teamId !== identity.macTeamId)
    throw refuse(
      name,
      `it is signed by team ${teamId}, not ${identity.macTeamName} (${identity.macTeamId})`,
    )
  const gate = await run('spctl', ['--assess', '--type', 'execute', '-vv', appPath], {
    timeoutMs: TIMEOUT_MS,
  })
  if (gate.code !== 0)
    throw refuse(name, `Gatekeeper rejected it (${firstLine(gate.stderr || gate.stdout)})`)
  const authority = parseAuthority(out)
  return { teamId, ...(authority ? { authority } : {}) }
}

/** The CN of an X.500 subject ("CN=Ollama Inc., O=Ollama Inc., …"). */
export function subjectCn(subject: string): string | undefined {
  const m = /(?:^|,\s*)CN=("([^"]*)"|[^,]*)/.exec(subject)
  return (m?.[2] ?? m?.[1])?.trim()
}

export interface AuthenticodeResult {
  Status?: string
  Subject?: string
}

export function parseAuthenticode(stdout: string): AuthenticodeResult {
  try {
    const v = JSON.parse(stdout.trim()) as unknown
    return v && typeof v === 'object' ? (v as AuthenticodeResult) : {}
  } catch {
    return {}
  }
}

// The file path reaches PowerShell through an environment variable, never the command text.
const PS_SCRIPT =
  '$s = Get-AuthenticodeSignature -LiteralPath $env:AS_VERIFY_FILE; ' +
  '[pscustomobject]@{ Status = [string]$s.Status; Subject = [string]$s.SignerCertificate.Subject } | ConvertTo-Json -Compress'

/** Verify a Windows installer's Authenticode signature and signer. */
export async function verifyWindowsInstaller(
  file: string,
  identity: ToolIdentity,
  run: Runner = runCommand,
): Promise<{ subject: string }> {
  const name = file.split(/[\\/]/).pop() ?? file
  const res = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT],
    { timeoutMs: TIMEOUT_MS, env: { AS_VERIFY_FILE: file } },
  )
  const sig = parseAuthenticode(res.stdout)
  if (res.code !== 0 || !sig.Status)
    throw refuse(name, `Windows could not read its signature (${firstLine(res.stderr)})`)
  if (sig.Status !== 'Valid') throw refuse(name, `its signature status is ${sig.Status}`)
  const cn = subjectCn(sig.Subject ?? '')
  if (cn !== identity.winSubjectCn)
    throw refuse(name, `it is signed by "${cn ?? 'unknown'}", not "${identity.winSubjectCn}"`)
  return { subject: sig.Subject ?? '' }
}

/** The most telling line of a tool's output (codesign prints progress lines first). */
function firstLine(s: string): string {
  const lines = s.trim().split('\n')
  const telling = lines.find((l) => /not signed|invalid|missing|modified|rejected|failed/i.test(l))
  return (telling ?? lines[0])?.trim().slice(0, 200) || 'no details'
}
