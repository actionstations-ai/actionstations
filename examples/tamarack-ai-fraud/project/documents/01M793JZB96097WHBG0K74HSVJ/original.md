# TPC-FIN-04: Payment Authorization, Callback Verification and Wire Recall

Tamarack Precision Components, Inc. · Treasury and Controllership · Revision 8 · Effective January 4, 2027

## 1. Purpose

This procedure controls how Tamarack moves money out of its accounts by wire, ACH and instant payment, and what Treasury does when a payment may be fraudulent. It applies to every Tamarack entity that banks through the corporate Treasury Workstation.

## 2. Who may initiate, approve and release

| Step | Who | Limits |
|---|---|---|
| Initiate | Treasury Analyst (Ines Okonkwo-Hart, Dev Rangaswamy) or Accounts Payable Specialist | Any amount, in the Treasury Workstation only; no initiation from email, chat or a call |
| First approval | Treasury Manager (Gareth Lindqvist-Boyd) | Up to $250,000 |
| Second approval | Controller (Anjali Whitcombe) | Required for $250,000 and above |
| Executive approval | Chief Financial Officer (Marcus Delacroix-Hume), or in his absence the Controller plus the CEO's delegate | Required at $1,000,000 and above; approved in the Workstation by the person, with the multi-factor token |
| Release | A second Treasury employee releases the payment to the bank after approvals | The same person never initiates, approves and releases |

Banking cutoffs: domestic wires 17:00 Eastern; international wires 15:00 Eastern for same-day value. Instant payments are not used for vendor payments.

## 3. Callback verification

A callback on a known number is required for: any new beneficiary or beneficiary account, any change to bank details, any payment over $250,000 that is not on the approved vendor payment calendar, and any payment requested in a way that departs from the normal workflow (an email, a call, a chat message or a video meeting).

A callback is made by the person who is not the requester of the payment (the approver), to the telephone number in the vendor master file or in the Tamarack directory, never to a number, link or meeting invitation supplied in the request. The caller asks a challenge question and records: who was called, the number and its source, the time, the person who confirmed and what they confirmed. A callback that cannot reach the person is a callback not completed: the payment is held.

The following do not count as verification: a person's face or voice on a video call or voice call; a reply to the same email thread; a meeting that the requester arranged; a detector score; a "confidential" instruction to avoid telling colleagues. Payment instructions that arrive with urgency and secrecy are treated as a fraud pattern until proven otherwise.

## 4. Executive requests

An instruction from the CFO, CEO, General Counsel or any executive to make a payment outside the workflow is not carried out until the executive is reached on their own directory mobile phone by the approver, or in person. The executive's assistant is reachable on 864-555-0131 and has the executives' travel calendars. Tamarack executives are told that no executive will ever ask Treasury to skip callback, and that an instruction to do so is a reason to call the CISO.

## 5. If a payment is suspected to be fraudulent

1. Stop the payment if it has not been released: set status to HOLD in the Workstation and tell the Treasury Manager.
2. If it has been released, call the bank's fraud desk (First Meridian Commercial Bank, Treasury Services fraud line, 800-555-0141, 24 hours) and ask for a recall and a freeze. Give the amount, the date, the time, the beneficiary name, the account, the bank, the reference and the wire's confirmation number. Follow with the written recall request on the bank portal within 30 minutes.
3. Call the CISO and the Controller. The CISO declares an incident (see TPC-SEC-02).
4. For an international wire, file the report with the FBI Internet Crime Complaint Center (IC3) within 72 hours and ask whether the FBI will start the Financial Fraud Kill Chain with the Treasury Department's FinCEN; the Kill Chain works best within 72 hours on international wires of $50,000 or more.
5. Notify the cyber and crime insurer's hotline (864-555-0151) and the broker within 24 hours; the policy requires prompt notice, and the insurer's panel counsel and forensic firm are named in the policy.
6. Record every action and time in the incident log.

## 6. Recall facts Treasury knows

- A recall is a request, not a reversal. The beneficiary bank decides. Speed matters: money moves on within hours.
- A beneficiary bank may freeze funds that remain in the account; it may return them only with the account holder's consent or a legal process; partial recovery is common.
- Banks ask for the originating bank's confirmation, a police report or the IC3 complaint number, and a signed indemnity.
- A foreign beneficiary bank's recall happens through the correspondent bank chain and takes days.

## 7. Reconciliation and metrics

At the incident close, Treasury reports: total requested, total released, total stopped before release, total frozen, total recovered, and the time from first release to the bank call. These figures are the authority for every message about the loss; the Controller signs them.
