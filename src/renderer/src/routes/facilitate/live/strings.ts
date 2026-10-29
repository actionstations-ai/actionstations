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
    'Each device shows one certificate warning the first time; the fingerprint below lets players check it.',
  http: 'Plain HTTP (not recommended)',
  httpWarning:
    'No warning on the phones, but anyone on the same network can change the page players load and, through it, read and impersonate everything in the session. Use only on a network where you trust every device.',
  confirmHttp:
    'Start on plain HTTP? Anyone on this network can read and impersonate session content. Choose HTTPS unless you trust every device on the network.',
  httpBadge:
    'Plain HTTP: anyone on this network can read and impersonate session content. Stop and restart with HTTPS if you are not sure.',
  publicAddress:
    'This is a public address: devices beyond the local network may reach the session.',
  confirmPublic:
    'The chosen address is public, not a local network address. Devices beyond the room may reach this session. Start anyway?',
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
  staging: (done: number, total: number) => `Staging media ${done}/${total}`,
  stagingFailed: (n: number) =>
    n === 1
      ? '1 inject has media that could not be prepared for devices; it will show on the main screen.'
      : `${n} injects have media that could not be prepared for devices; they will show on the main screen.`,
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

/**
 * The connection chooser's text (spec 0410). The three statements are also pasted, word for word,
 * into `docs/guides/live-play.md` as fenced blocks; `strings.test.ts` compares them so the guide
 * and the screen cannot drift apart.
 */
export const CONNECTION = {
  legend: 'How will devices connect?',
  lan: {
    title: 'This computer',
    summary: "Players join over this room's Wi-Fi.",
    needs: 'Needs a shared Wi-Fi or network. No internet.',
    statement:
      "Your computer listens on the Wi-Fi at the address shown. Players' devices load the player page from it and exchange encrypted session messages with it. Nothing is sent to the internet. Stops when you end the session.",
  },
  relay: {
    title: 'Action Stations relay',
    summary: 'For remote and hybrid players, over the internet.',
    needs: 'Needs internet.',
    statement:
      'Your computer connects to relay.actionstations.ai, run by the Action Stations project on Cloudflare. It sends the session id, encrypted messages and media, their sizes and timing, and your IP address. The relay cannot read session content and keeps encrypted messages only for late joiners, deleting them when you end the session or after 72 hours. Limits: 60 devices, 8 MB per media file, 25 sessions per day for everyone; when the free limit is reached it stops with an error and nothing is ever billed.',
    host: 'The relay address',
    limits:
      'Limits: 60 devices, 8 MB per media file, 72 hours of retention, 25 sessions per day for everyone.',
  },
  selfHosted: {
    title: 'Your server',
    summary: "Your organization's own Action Stations server.",
    needs: "Needs your organization's server.",
    statement:
      'Your computer connects to the server address you enter, run by your organization. It sends the same things as to the relay: session id, encrypted messages and media, sizes and timing, your IP address, plus the server key you were given. The server cannot read session content. Its retention and limits are set by whoever runs it.',
    remembered: 'Remembered servers',
    none: 'Enter a new address',
    url: 'Server address',
    urlHint: 'For example https://live.example.org',
    key: 'Server key',
    keyHint: 'Given to you by whoever runs the server. Stored encrypted on this computer.',
    keyStored: 'A key is stored for this server. Leave this empty to keep it.',
    noTls: 'This server has no TLS (reverse proxy or trusted network)',
    noTlsWarning:
      'Unencrypted transport. Session content stays encrypted end to end, but anyone on the network can see who connects and when. Use only on a network you trust.',
    fingerprint: 'Certificate fingerprint (SHA-256)',
    fingerprintHelp:
      "This server's certificate is not signed by an authority this computer knows. Compare the fingerprint with the one your IT team gave you, then confirm it. The app then accepts only this certificate and stops if it ever changes.",
    confirmFingerprint: 'Confirm this fingerprint',
    pinned: 'Pinned: the app accepts only this certificate.',
    copy: 'Copy fingerprint',
    copied: 'Fingerprint copied',
  },
  consent: {
    title: 'Before you continue',
    relay: 'This exercise will send the items listed above to the relay.',
    selfHosted: 'This exercise will send the items listed above to the server you entered.',
    continue: 'I understand, continue',
    needed: 'Confirm what this connection sends before starting.',
  },
  test: 'Test connection',
  testing: 'Testing…',
  testHeading: 'Test results',
  pass: 'Passed',
  warn: 'Check',
  fail: 'Failed',
  start: 'Start session',
  starting: 'Starting…',
  runningOn: (kind: string, host: string, security: string) => `${kind} at ${host} (${security})`,
  security: { https: 'HTTPS', 'self-signed': 'pinned certificate', http: 'HTTP, no TLS' },
  newLink: 'Session link',
  remoteKeepAwake:
    'This computer is kept awake while the session runs. Closing the app ends the session.',
} as const
