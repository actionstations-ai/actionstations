/** Words for partner co-controllers and SimCell helper devices on the Live tab (#517, #518). */
export const PARTNER = {
  helpersHeading: 'SimCell helper devices',
  helpersIntro:
    'Let a colleague on a phone or tablet read your SimCell drafts and send, change or discard them. They join with the staff link and take the SimCell helper seat. Players never see a draft until it is sent, and you can still send or discard from this computer.',
  helpersSwitch: 'Let SimCell helper devices approve replies',
  helpersNone: 'No helper device is connected.',
  helpersSome: (n: number) =>
    n === 1 ? '1 helper device is connected.' : `${n} helper devices are connected.`,
  helpersOff: 'Helper devices are off. No draft leaves this computer.',
  helpersError: 'Could not change helper devices',

  invite: 'Invite',
  inviteFor: (name: string) => `Invite ${name}`,
  inviteMinting: 'Making the invite…',
  inviteTitle: (name: string) => `Invite for ${name}`,
  inviteWarning: (name: string) =>
    `This invite lets whoever holds it join as ${name}, with the staff key. Send it only to them, over a channel you trust. It is shown once and is not saved.`,
  inviteLabel: 'Partner invite',
  inviteCopy: 'Copy invite',
  inviteCopied: 'Invite copied',
  inviteClose: 'Done, clear it',
  inviteError: 'Could not make the invite',
  staffClosed:
    'A partner invite is out and it carries the staff key, so new evaluator and SimCell helper seats are closed. Devices already seated keep their seats.',
  staffGrant: 'Open evaluator and SimCell helper seats again',
  mayHeader: 'May send',
  permissions: {
    inject: 'Its own injects',
    message: 'Messages to its roles',
    vote: 'Votes for its roles',
    survey: 'Surveys',
    call: 'Calls',
    notice: 'Notices',
  } as Record<string, string>,

  joinHeading: 'Join another organization’s exercise',
  joinIntro:
    'If a partner is hosting this exercise, paste the invite they sent you. This computer then connects as your organization’s controller: you release your own injects to your own roles, and the host sees everything you send.',
  joinLabel: 'Partner invite',
  joinHint: 'It starts with asp1. and is a single long line.',
  joinButton: 'Join exercise',
  joining: 'Joining…',
  joinError: 'Could not join',
  leave: 'Leave exercise',
  stateConnecting: 'Connecting to the host…',
  stateJoined: (org: string) => `Connected as ${org}.`,
  stateEnded: 'The host ended the exercise.',
  stateError: 'Not connected.',
  waitingRoster:
    'Connected. Waiting for the host to list your organization before you can release.',
  clock: (t: string) => `Exercise time ${t}`,
  scopeLine: (rows: string, roles: number) =>
    `You may release rows ${rows} to ${roles === 1 ? '1 role' : `${roles} roles`}.`,
  rowsHeading: 'Your rows',
  rowsNone: 'This copy of the exercise has no rows for your organization.',
  rowId: 'Row',
  rowEvent: 'Event',
  rowTo: 'To',
  rowState: 'Status',
  release: 'Release',
  releaseRow: (id: string) => `Release ${id}`,
  released: 'Released',
  receiptLine: (read: number, to: number) => `${read} of ${to} roles have read it`,
  releaseError: 'Could not release',
  outOfScope: 'Not yours to release',
}
