/**
 * Firewall guidance per platform (spec 0407 FR-8): what the OS asks the first time the app
 * listens, how to recover when the prompt was denied, and what to check when no device has
 * connected a minute after the QR code went up. The guide (`docs/guides/live-play.md`) quotes
 * the same text.
 */
import type { FirewallGuidance } from '@shared/schemas/live'

/** How long with zero devices connected before the guidance is shown again. */
export const NO_CONNECTIONS_AFTER_MS = 60_000

const GUIDANCE: Record<FirewallGuidance['platform'], Omit<FirewallGuidance, 'platform'>> = {
  darwin: {
    beforeStart:
      'macOS will ask: "Do you want the application Action Stations to accept incoming network connections?" Choose Allow. Unsigned builds may ask on every launch.',
    ifDenied:
      'If you chose Deny: open System Settings → Network → Firewall → Options, find Action Stations and set it to "Allow incoming connections", then start the session again.',
    noConnections:
      "No device has connected yet. Check that the phones are on the same Wi-Fi as this computer (guest networks sometimes keep devices apart), that the macOS firewall allows Action Stations (System Settings → Network → Firewall → Options), and that the QR code shows this computer's current address.",
  },
  win32: {
    beforeStart:
      'Windows will show "Windows Defender Firewall has blocked some features of this app". Tick Private networks and choose Allow access.',
    ifDenied:
      "If you chose Cancel, or the room's Wi-Fi is set to Public: open Settings → Network & Internet → Wi-Fi → the network → Network profile and choose Private, or ask IT to allow Action Stations through Windows Defender Firewall on the port shown here.",
    noConnections:
      "No device has connected yet. Check that the phones are on the same Wi-Fi as this computer, that this network's profile is Private (Settings → Network & Internet → Wi-Fi → the network), and that Windows Defender Firewall allows Action Stations (Allow an app through firewall).",
  },
  linux: {
    beforeStart:
      'Most Linux desktops ask nothing. With ufw enabled, allow the port shown here (for example: sudo ufw allow 8485/tcp).',
    ifDenied:
      'If devices cannot connect and ufw or firewalld is enabled, allow the port shown here: sudo ufw allow 8485/tcp, or sudo firewall-cmd --add-port=8485/tcp.',
    noConnections:
      'No device has connected yet. Check that the phones are on the same Wi-Fi as this computer and that a firewall (ufw, firewalld) allows the port shown here.',
  },
}

export function firewallGuidance(
  platform: NodeJS.Platform = process.platform,
  port?: number,
): FirewallGuidance {
  const key: FirewallGuidance['platform'] =
    platform === 'darwin' || platform === 'win32' ? platform : 'linux'
  const text = GUIDANCE[key]
  const withPort = (s: string) => (port ? s.replaceAll('8485', String(port)) : s)
  return {
    platform: key,
    beforeStart: withPort(text.beforeStart),
    ifDenied: withPort(text.ifDenied),
    noConnections: withPort(text.noConnections),
  }
}
