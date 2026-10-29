import { describe, expect, it } from 'vitest'
import {
  detectCommitments,
  dueMinutes,
  isCommitment,
  parseClockTime,
  parseRelative,
} from './commitments'

// Sentences in the style of the Scenario 3 hot washes and player chat. Hand-labelled: the first
// block promises an action, the second does not.
const PROMISES = [
  "We'll notify the FAA by 10:30.",
  "I'll call the county EOC as soon as we hang up.",
  'We will brief the airport director within 20 minutes.',
  "We'll send a press statement in an hour.",
  'I will activate the emergency operations center now.',
  "We're going to evacuate the north concourse.",
  'We plan to issue a NOTAM before noon.',
  "I'll file the TSA incident report by 1100.",
  'We will escalate this to the FBI field office.',
  "We'll isolate the baggage handling VLAN right away.",
  "I'll post an update to the airport account within 15 minutes.",
  'We will restore the FIDS from backup once the vendor confirms.',
  "We'll contact the airline station managers in 10 minutes.",
  'Planning to notify the board chair by 9:45.',
  "We're going to shut down the affected check-in kiosks.",
  "I'll page the duty manager and the IT lead.",
  'We will also immediately notify the state fusion center.',
  "We'll dispatch a team to the server room.",
  'I will request mutual aid from the neighboring fire department.',
  "We'll reset the passwords for the compromised accounts today.",
  "We'll declare a local emergency if the outage passes an hour.",
  'We will alert the tenants at 10:15.',
  "I'll inform legal counsel in 5 minutes.",
  "We're going to reroute departures to gates B1 through B4.",
  'We will publish a holding statement within 30 minutes.',
  "We'll coordinate with the TSA federal security director.",
  "I'll send the situation report to the group by 1030.",
  "We'll block the sender domain at the mail gateway.",
  'We will start the downtime procedures in two minutes.',
  "I'll check with the vendor and confirm by 11:00.",
  "We plan to brief the media at the top of the hour, so we'll prepare a script.",
  'We will deploy additional officers to the terminal curb.',
  "I'll ask the PIO to draft a statement in 10 minutes.",
  "We'll verify the backups before we restore anything.",
  "We're going to contact the insurance carrier today.",
  'We will disable the remote access account right away.',
  "I'll open the incident bridge at 9:30.",
  "We'll secure the server room and log the badge entries.",
  'We will arrange buses for stranded passengers within an hour.',
  "I'll update the board in 20 minutes.",
  "We'll switch to manual boarding passes.",
  "We'll release the passenger notice by 10:50.",
  'I will begin the evacuation walk-through at once.',
  "We're planning to call the vendor's emergency line.",
  "We'll report the incident to CISA within 24 hours.",
  'We will review the camera footage and brief you at 1400.',
  "I'll stand up the family assistance center in two hours.",
  "We'll confirm the passenger count with the airlines by 10:40.",
  'We will send a runner to the tower.',
  "I'll text the on-call engineer now.",
]

const OTHER = [
  'The FAA called about the ground stop.',
  'Check-in kiosks are showing a blue screen.',
  'We will not be notifying the media yet.',
  "I won't call the vendor until legal agrees.",
  'The decision to evacuate was made earlier.',
  'Who is going to the command post?',
  'The press release went out at 10:30.',
  'Our plan is on page 14 of the airport emergency plan.',
  'They are going to be upset about the delay.',
  'The network team said it was a ransomware note.',
  "I think we're overdue for a status update.",
  'What time did the outage start?',
  'Passengers are crowding the north concourse.',
  'The vendor is on hold with their legal team.',
  'It was reported to the TSA at 9:15.',
  'Nothing has been confirmed with the airlines.',
  'We never send the statement before legal reviews it.',
  'Flights are delayed by about 40 minutes.',
  'The generator will be fine for several hours.',
  'This feels like the exercise two years ago.',
  'She said the badge readers are offline.',
  'Which team is going to own the media line?',
  'Can we get a read on the baggage system?',
  'The board chair was briefed yesterday.',
  'We cannot restore the system until the vendor arrives.',
  'Social media is picking up the story.',
  'The airport director is on the phone with the mayor.',
  'He mentioned a plan to move the family center.',
  'Our backups are 36 hours old.',
  'There is no word from the state yet.',
  'I am not going to notify anyone before I have facts.',
  'The incident commander wants a report every 15 minutes.',
  'Is anyone tracking the vendor ticket?',
  'The screens in terminal B are blank.',
  'That is a good point about the airlines.',
  'Our SOP says the PIO releases statements.',
  'The call to the county was made at 10:05.',
  'Everyone should read the playbook tonight.',
  'I will not be able to join the bridge.',
  'The tower reported the radio issue.',
  'Some staff are going home after the shift.',
  'The decision is with the airport director.',
  'We have a meeting at 11:00 with legal.',
  'Passenger counts are still unknown.',
  'It would help to see the network diagram.',
  'The notice was posted on the terminal doors.',
  'Reporters are waiting outside the main entrance.',
  'The firewall logs show a spike at 9:58.',
  'Nobody has activated the EOC.',
  'Their plan was approved last spring.',
]

describe('detectCommitments corpus (spec 0428 FR-15)', () => {
  const found = (s: string) => detectCommitments(s, 0).length > 0
  const truePositives = PROMISES.filter(found).length
  const falsePositives = OTHER.filter(found).length
  const precision = truePositives / (truePositives + falsePositives)
  const recall = truePositives / PROMISES.length

  it('has 100 labelled sentences', () => {
    expect(PROMISES.length + OTHER.length).toBe(100)
  })
  it('keeps precision at or above 0.8', () => {
    expect(precision).toBeGreaterThanOrEqual(0.8)
  })
  it('keeps recall at or above 0.6', () => {
    expect(recall).toBeGreaterThanOrEqual(0.6)
  })
})

describe('isCommitment', () => {
  it('needs a promise phrase followed by an action verb', () => {
    expect(isCommitment("We'll notify the FAA")).toBe(true)
    expect(isCommitment("We'll see")).toBe(false)
    expect(isCommitment('Notify the FAA')).toBe(false)
  })
  it('skips a refusal', () => {
    expect(isCommitment('We will not notify the FAA')).toBe(false)
  })
})

describe('time parsing', () => {
  it('reads relative times', () => {
    expect(parseRelative('within 20 minutes')).toBe(20)
    expect(parseRelative('in an hour')).toBe(60)
    expect(parseRelative('in 2 hours')).toBe(120)
    expect(parseRelative('soon')).toBeUndefined()
  })
  it('reads clock times as minutes after midnight', () => {
    expect(parseClockTime('by 10:30')).toBe(630)
    expect(parseClockTime('at 1100')).toBe(660)
    expect(parseClockTime('by 25:00')).toBeUndefined()
  })
  it('turns a clock time into exercise minutes and wraps past midnight', () => {
    expect(dueMinutes('by 10:30', 5, 9 * 60)).toBe(90)
    expect(dueMinutes('by 00:30', 5, 23 * 60)).toBe(90)
    expect(dueMinutes('by 10:30', 5)).toBeUndefined()
    expect(dueMinutes('in 20 minutes', 15)).toBe(35)
  })
})

describe('detectCommitments', () => {
  it('returns a suggestion with a due time and a stable id', () => {
    const [a] = detectCommitments("OK. We'll notify the FAA within 20 minutes.", 12, {
      source: 'message',
      sourceRef: 'm1',
      rowId: 'I-07',
    })
    expect(a).toMatchObject({
      text: "We'll notify the FAA within 20 minutes.",
      dueAtMin: 32,
      rowId: 'I-07',
    })
    const again = detectCommitments("We'll notify the FAA within 20 minutes.", 50, {
      source: 'message',
      sourceRef: 'm1',
    })
    expect(again[0]?.id).toBe(a?.id)
  })
  it('stops reading after 2000 characters', () => {
    const text = `${'Nothing to see. '.repeat(200)}We'll notify the FAA.`
    expect(detectCommitments(text, 0)).toEqual([])
  })
  it('handles hostile input quickly', () => {
    const started = performance.now()
    detectCommitments(`${"we'll ".repeat(400)}${'a'.repeat(5000)}`, 0)
    expect(performance.now() - started).toBeLessThan(200)
  })
})
