/** Words on the SimCell helper screen (#518). Plain and short. */
export const SIMCELL = {
  heading: 'SimCell drafts',
  back: 'Back',
  rule: 'The facilitator drafted these replies from outside parties. Send one, change it first, or discard it. Players see a reply only after you send it.',
  waiting: (n: number) =>
    n === 0
      ? 'No drafts waiting. New ones appear here by themselves.'
      : n === 1
        ? '1 draft waiting.'
        : `${n} drafts waiting.`,
  ended: 'The exercise has ended. Drafts can no longer be sent.',
  playerSaid: 'Player said: ',
  flags: 'Checks on this draft',
  reply: 'Reply',
  emptyReply: 'The reply is empty. Write something, or discard the draft.',
  approve: 'Send as written',
  sendEdited: 'Send my changes',
  discard: 'Discard',
  more: 'SimCell drafts',
  helpersOnly: 'For the SimCell helper seat.',
}
