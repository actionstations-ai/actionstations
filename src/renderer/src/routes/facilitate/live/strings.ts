/**
 * Every string of the Live tab (spec 0407 Renderer), so the guide (`docs/guides/live-play.md`)
 * and the screen say the same thing.
 */
export const LIVE = {
  tab: 'Live',
  heading: 'Live play on this computer',
  intro:
    "Players join from their own devices over the room's Wi-Fi. This computer serves the player page and relays encrypted messages to devices on the chosen network only; nothing leaves the room and no account is needed.",
  addressLabel: 'Network address',
  addressHelp: 'Pick the address the phones can reach. The Wi-Fi address is usually right.',
  noNetwork:
    'This computer is not on a network. Join a Wi-Fi network or plug in Ethernet, then try again.',
  linkLocalOnly:
    'This computer has only a self-assigned address (169.254.x.x): the network did not hand out an address, so phones will not reach it. Check the Wi-Fi connection.',
  securityLegend: 'Connection security',
  https: 'HTTPS with a certificate made for this session (recommended)',
  httpsHelp:
    'Each device shows one certificate warning the first time; the fingerprint below lets players check it. Messages are end-to-end encrypted either way.',
  http: 'Plain HTTP',
  httpWarning:
    'No warning on the phones, but anyone on the same Wi-Fi could change the page players load. Use only on a network you trust. Session content stays encrypted end to end.',
  attributionLegend: 'Attribution',
  attributionRole: 'By role (HSEEP non-attribution): the record keeps roles, never names',
  attributionNamed: 'Named: the record also keeps the display name each player typed',
  start: 'Start session',
  starting: 'Starting…',
  stop: 'Stop session',
  stopping: 'Stopping…',
  confirmStop: 'End the live session? Every device shows "Session ended".',
  firewallHeading: 'Your firewall will ask',
  running: 'Session running',
  playersLink: 'Players link',
  staffLink: 'Staff link (controllers, evaluators, SimCell)',
  staffLinkHelp:
    'Hand this link only to staff: it opens expected actions and evaluator material. Never show it on the main screen.',
  copyLink: 'Copy link',
  copied: 'Link copied',
  showStaff: 'Show staff link',
  hideStaff: 'Hide staff link',
  switchAddress: 'Switch address',
  switching: 'Switching…',
  connected: (n: number) => (n === 1 ? '1 device connected' : `${n} devices connected`),
  listening: (address: string, port: number, tls: boolean) =>
    `Listening on ${address}:${port} (${tls ? 'HTTPS' : 'HTTP'})`,
  fingerprint: 'Certificate fingerprint (SHA-256)',
  keepAwake: 'This computer is kept awake while the session runs.',
  noConnectionsYet: 'No device has connected yet',
  qrAlt: (url: string) => `Join link: ${url}`,
  error: 'Could not start the session',
  alreadyRunning: 'Another live session is running. Stop it first.',
} as const
