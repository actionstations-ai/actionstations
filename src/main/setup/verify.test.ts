// Publisher signature checks (#334): only the pinned Team ID / Authenticode signer passes.
// Recorded tool output for the vendor case; the real codesign refuses unsigned and ad-hoc
// signed fixture binaries on macOS.
import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOOLS } from './catalog'
import {
  parseAuthenticode,
  parseTeamId,
  subjectCn,
  verifyMacApp,
  verifyWindowsInstaller,
} from './verify'
import { CODESIGN_ADHOC, CODESIGN_LMSTUDIO, scriptedRunner } from './test-env'

const LMS = TOOLS.lmstudio.identity!
const OLLAMA = TOOLS.ollama.identity!

const macRunner = (dv: string, opts: { strict?: number; spctl?: number } = {}) =>
  scriptedRunner((cmd, args) => {
    if (cmd === 'codesign' && args[0] === '--verify') return { code: opts.strict ?? 0 }
    if (cmd === 'codesign') return { stderr: dv }
    if (cmd === 'spctl')
      return opts.spctl
        ? { code: opts.spctl, stderr: 'rejected\nsource=Unnotarized Developer ID' }
        : { stderr: 'accepted\nsource=Notarized Developer ID' }
    return { code: 127 }
  })

describe('parsers', () => {
  it('reads the Team ID, and none for ad-hoc signatures', () => {
    expect(parseTeamId(CODESIGN_LMSTUDIO)).toBe('D65G88RHWN')
    expect(parseTeamId(CODESIGN_ADHOC)).toBeUndefined()
    expect(parseTeamId('code object is not signed at all')).toBeUndefined()
  })
  it('reads the CN of an Authenticode subject', () => {
    expect(
      subjectCn('CN=Ollama Inc., O=Ollama Inc., L=Toronto, S=Ontario, C=CA, SERIALNUMBER=2713355'),
    ).toBe('Ollama Inc.')
    expect(subjectCn('CN="Element Labs, Inc.", O=x')).toBe('Element Labs, Inc.')
    expect(parseAuthenticode('not json')).toEqual({})
  })
})

describe('verifyMacApp', () => {
  it('accepts the pinned team when Gatekeeper accepts the app', async () => {
    const run = macRunner(CODESIGN_LMSTUDIO)
    await expect(verifyMacApp('/mnt/LM Studio.app', LMS, run)).resolves.toMatchObject({
      teamId: 'D65G88RHWN',
      authority: 'Developer ID Application: Element Labs Inc (D65G88RHWN)',
    })
    expect(run.calls.map((c) => c.cmd)).toEqual(['codesign', 'codesign', 'spctl'])
  })

  it('refuses a validly signed app from another team', async () => {
    await expect(
      verifyMacApp('/mnt/Ollama.app', OLLAMA, macRunner(CODESIGN_LMSTUDIO)),
    ).rejects.toThrow(/signed by team D65G88RHWN, not Infra Technologies, Inc \(3MU9H2V9Y9\)/)
  })

  it('refuses an ad-hoc signature, a broken signature and a Gatekeeper rejection', async () => {
    await expect(verifyMacApp('/mnt/A.app', LMS, macRunner(CODESIGN_ADHOC))).rejects.toThrow(
      /no Developer ID team/,
    )
    await expect(
      verifyMacApp('/mnt/A.app', LMS, macRunner(CODESIGN_LMSTUDIO, { strict: 1 })),
    ).rejects.toThrow(/missing or invalid/)
    await expect(
      verifyMacApp('/mnt/A.app', LMS, macRunner(CODESIGN_LMSTUDIO, { spctl: 3 })),
    ).rejects.toThrow(/Gatekeeper rejected it/)
  })

  it.runIf(process.platform === 'darwin')(
    'refuses unsigned and ad-hoc signed fixture binaries with the real codesign',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'ttx-sig-'))
      const unsigned = join(dir, 'unsigned.bin')
      writeFileSync(unsigned, Buffer.from('#!/bin/sh\nexit 0\n'))
      await expect(verifyMacApp(unsigned, LMS)).rejects.toThrow(/failed the publisher check/)
      const adhoc = join(dir, 'adhoc')
      copyFileSync('/usr/bin/true', adhoc)
      execFileSync('codesign', ['--force', '--sign', '-', adhoc])
      await expect(verifyMacApp(adhoc, LMS)).rejects.toThrow(/no Developer ID team/)
    },
  )
})

// Opt-in (LIVE=1): the installed LM Studio carries the pinned Team ID. (A strict deep verify
// of an installed LM Studio fails: it adds files to its own bundle after install, which is why
// the installer verifies the fresh copy right after copying it.)
const INSTALLED_LMS = '/Applications/LM Studio.app'
describe.runIf(process.env.LIVE === '1' && existsSync(INSTALLED_LMS))('live', () => {
  it('reads the pinned Team ID from the installed LM Studio', () => {
    expect(parseTeamId(spawnText(INSTALLED_LMS))).toBe(LMS.macTeamId)
  })
})

function spawnText(app: string): string {
  const r = spawnSync('codesign', ['-dv', '--verbose=2', app], { encoding: 'utf8' })
  return `${r.stdout}\n${r.stderr}`
}

describe('verifyWindowsInstaller', () => {
  const ps = (status: string, subject: string, code = 0) =>
    scriptedRunner(() => ({ code, stdout: JSON.stringify({ Status: status, Subject: subject }) }))

  it('accepts a Valid signature from the pinned signer and passes the path by env only', async () => {
    const run = ps('Valid', 'CN=Ollama Inc., O=Ollama Inc., C=CA')
    const file = 'C:\\dl\\ollama-1.exe; Remove-Item C:\\'
    await expect(verifyWindowsInstaller(file, OLLAMA, run)).resolves.toBeTruthy()
    expect(run.calls[0]!.env).toEqual({ AS_VERIFY_FILE: file })
    expect(run.calls[0]!.args.join(' ')).not.toContain('Remove-Item')
  })

  it('refuses another signer, a bad status and unreadable output', async () => {
    await expect(
      verifyWindowsInstaller('x.exe', OLLAMA, ps('Valid', 'CN=Someone Else LLC')),
    ).rejects.toThrow(/signed by "Someone Else LLC", not "Ollama Inc\."/)
    await expect(
      verifyWindowsInstaller('x.exe', OLLAMA, ps('HashMismatch', 'CN=Ollama Inc.')),
    ).rejects.toThrow(/status is HashMismatch/)
    await expect(verifyWindowsInstaller('x.exe', OLLAMA, ps('NotSigned', ''))).rejects.toThrow(
      /status is NotSigned/,
    )
    await expect(
      verifyWindowsInstaller(
        'x.exe',
        OLLAMA,
        scriptedRunner(() => ({ code: 1, stderr: 'boom' })),
      ),
    ).rejects.toThrow(/could not read its signature/)
  })
})
