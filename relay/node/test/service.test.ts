import { describe, expect, it } from 'vitest'
import { parse } from 'smol-toml'
import { layerFromToml } from '../src/config'
import {
  exampleConfig,
  runCommands,
  systemdCommands,
  systemdUnit,
  windowsCommands,
} from '../src/service'

describe('service registration', () => {
  it('builds the Windows commands: a startup task as LocalService, data directory rights, a firewall rule', () => {
    const cmds = windowsCommands('install', {
      exe: 'C:\\relay\\actionstations-relay.exe',
      configPath: 'C:\\ProgramData\\ActionStationsRelay\\config.toml',
      dataDir: 'C:\\ProgramData\\ActionStationsRelay',
      port: 8485,
    })
    expect(cmds.map((c) => c.command)).toEqual(['schtasks', 'icacls', 'netsh', 'schtasks'])
    expect(cmds[0]!.args).toContain('NT AUTHORITY\\LocalService')
    expect(cmds[0]!.args.join(' ')).toContain(
      'serve --config "C:\\ProgramData\\ActionStationsRelay\\config.toml"',
    )
    expect(cmds[2]!.args).toContain('localport=8485')
    expect(cmds[2]!.args).toContain('profile=domain,private')
    expect(
      windowsCommands('uninstall', { exe: 'x', configPath: 'y', dataDir: 'z', port: 1 }).map(
        (c) => c.args[0],
      ),
    ).toEqual(['/End', '/Delete', 'advfirewall'])
  })

  it('builds a hardened systemd unit and the commands that install it', () => {
    const unit = systemdUnit({
      exe: '/usr/local/bin/actionstations-relay',
      configPath: '/etc/actionstations-relay/config.toml',
    })
    for (const line of [
      'DynamicUser=yes',
      'ProtectSystem=strict',
      'NoNewPrivileges=yes',
      'CapabilityBoundingSet=',
      'StateDirectory=actionstations-relay',
      '# IPAddressDeny=any',
    ]) {
      expect(unit).toContain(line)
    }
    expect(unit).toContain(
      'ExecStart=/usr/local/bin/actionstations-relay serve --config /etc/actionstations-relay/config.toml',
    )
    const cmds = systemdCommands('install', { exe: 'x', configPath: 'y' })
    expect(cmds[0]!.writeFile?.path).toBe('/etc/systemd/system/actionstations-relay.service')
    expect(cmds.slice(1).map((c) => c.args.join(' '))).toEqual([
      'daemon-reload',
      'enable --now actionstations-relay',
    ])
  })

  it('prints each command and runs it, or only prints with --dry-run', () => {
    const printed: string[] = []
    const ran: string[] = []
    const cmds = windowsCommands('uninstall', { exe: 'x', configPath: 'y', dataDir: 'z', port: 1 })
    runCommands(cmds, {
      dryRun: true,
      print: (l) => printed.push(l),
      exec: (c, a) => ran.push(`${c} ${a.join(' ')}`),
    })
    expect(printed).toHaveLength(3)
    expect(ran).toHaveLength(0)
    runCommands(cmds, {
      dryRun: false,
      print: () => {},
      exec: (c, a) => ran.push(`${c} ${a.join(' ')}`),
    })
    expect(ran).toEqual(printed)
  })

  it('writes an example config the server accepts', () => {
    const text = exampleConfig('/var/lib/actionstations-relay', 8485)
    expect(parse(text)).toMatchObject({ port: 8485, tls: 'self-signed', 'retention-hours': 72 })
    expect(layerFromToml(text)).toMatchObject({
      port: 8485,
      dataDir: '/var/lib/actionstations-relay',
      blobs: 'db',
    })
  })
})
