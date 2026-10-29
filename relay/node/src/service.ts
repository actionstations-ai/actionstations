/**
 * Service registration (spec 0409 "Windows service and systemd"): the commands `service
 * install|uninstall` runs, built as data so tests can check them and `--dry-run` can print them.
 * Windows: a startup task as LocalService plus a firewall rule. Linux: a hardened systemd unit.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const SERVICE_NAME = 'ActionStationsRelay'
export const SERVICE_DISPLAY = 'Action Stations Relay'
export const SYSTEMD_UNIT_PATH = '/etc/systemd/system/actionstations-relay.service'

export interface Command {
  /** Shown to the operator, then run. */
  command: string
  args: string[]
  /** Instead of running a program: write this file. */
  writeFile?: { path: string; content: string }
}

export interface WindowsOptions {
  exe: string
  configPath: string
  dataDir: string
  port: number
}

/**
 * A console program (the executable is one) cannot answer the Windows service manager, so
 * `sc.exe create` would start and then fail with error 1053. A scheduled task that runs at
 * startup as LocalService starts it the same way and needs nothing else installed.
 */
export function windowsCommands(action: 'install' | 'uninstall', o: WindowsOptions): Command[] {
  const rule = `name=${SERVICE_DISPLAY}`
  if (action === 'uninstall') {
    return [
      { command: 'schtasks', args: ['/End', '/TN', SERVICE_NAME] },
      { command: 'schtasks', args: ['/Delete', '/TN', SERVICE_NAME, '/F'] },
      { command: 'netsh', args: ['advfirewall', 'firewall', 'delete', 'rule', rule] },
    ]
  }
  return [
    {
      command: 'schtasks',
      args: [
        '/Create',
        '/F',
        '/TN',
        SERVICE_NAME,
        '/SC',
        'ONSTART',
        '/RU',
        'NT AUTHORITY\\LocalService',
        '/TR',
        `"${o.exe}" serve --config "${o.configPath}"`,
      ],
    },
    { command: 'icacls', args: [o.dataDir, '/grant', 'NT AUTHORITY\\LocalService:(OI)(CI)M'] },
    {
      command: 'netsh',
      args: [
        'advfirewall',
        'firewall',
        'add',
        'rule',
        rule,
        'dir=in',
        'action=allow',
        'protocol=TCP',
        `localport=${o.port}`,
        'profile=domain,private',
      ],
    },
    { command: 'schtasks', args: ['/Run', '/TN', SERVICE_NAME] },
  ]
}

export interface SystemdOptions {
  exe: string
  configPath: string
}

/** The unit: a dynamic user, its own state directory, a read-only system, no new privileges. */
export function systemdUnit(o: SystemdOptions): string {
  return `[Unit]
Description=${SERVICE_DISPLAY}
Documentation=https://github.com/actionstations-ai/actionstations/blob/main/docs/guides/self-hosted-server.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${o.exe} serve --config ${o.configPath}
Restart=on-failure
RestartSec=5
DynamicUser=yes
StateDirectory=actionstations-relay
Environment=AS_RELAY_DATA_DIR=/var/lib/actionstations-relay
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
AmbientCapabilities=
CapabilityBoundingSet=
# The server makes no outbound connection. To have the kernel enforce it as well, allow only
# your own ranges (players connect from them) and deny everything else:
# IPAddressDeny=any
# IPAddressAllow=10.0.0.0/8 192.168.0.0/16 fd00::/8 localhost

[Install]
WantedBy=multi-user.target
`
}

export function systemdCommands(action: 'install' | 'uninstall', o: SystemdOptions): Command[] {
  if (action === 'uninstall') {
    return [
      { command: 'systemctl', args: ['disable', '--now', 'actionstations-relay'] },
      { command: 'rm', args: ['-f', SYSTEMD_UNIT_PATH] },
      { command: 'systemctl', args: ['daemon-reload'] },
    ]
  }
  return [
    {
      command: 'write',
      args: [SYSTEMD_UNIT_PATH],
      writeFile: { path: SYSTEMD_UNIT_PATH, content: systemdUnit(o) },
    },
    { command: 'systemctl', args: ['daemon-reload'] },
    { command: 'systemctl', args: ['enable', '--now', 'actionstations-relay'] },
  ]
}

/** A starting `config.toml` for a service install; every line a setting the guide explains. */
export function exampleConfig(dataDir: string, port: number): string {
  return `# Action Stations relay settings. Flags and AS_RELAY_* environment variables override these.
port = ${port}
bind = "0.0.0.0"
# host = ["ttx.internal", "10.20.0.5"]   # names and addresses for the certificate and the printed URLs
data-dir = ${JSON.stringify(dataDir)}
tls = "self-signed"                    # or "cert.pem,key.pem"
retention-hours = 72                   # at most 72
max-sessions = 20
max-clients = 60
# allow = ["10.0.0.0/8", "fd00::/8"]   # empty: any address
blobs = "db"                           # or "disk" for large media
log-level = "info"                     # or "warn"
`
}

export interface RunOptions {
  dryRun: boolean
  print: (line: string) => void
  exec?: (command: string, args: string[]) => void
}

/** Prints each command, then runs it (or writes the file) unless `dryRun`. */
export function runCommands(commands: Command[], o: RunOptions): void {
  const exec =
    o.exec ??
    ((command: string, args: string[]) => execFileSync(command, args, { stdio: 'inherit' }))
  for (const c of commands) {
    o.print(c.writeFile ? `write ${c.writeFile.path}` : `${c.command} ${c.args.join(' ')}`)
    if (o.dryRun) continue
    if (c.writeFile) {
      mkdirSync(dirname(c.writeFile.path), { recursive: true })
      writeFileSync(c.writeFile.path, c.writeFile.content)
    } else {
      exec(c.command, c.args)
    }
  }
}
