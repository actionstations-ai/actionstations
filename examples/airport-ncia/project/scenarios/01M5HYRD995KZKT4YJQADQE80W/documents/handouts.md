# Action Menu Card
## Scenario 8: "Countdown": Your Investigation Options

*Each action costs scenario time. Choose wisely. You have 180 minutes. Give this card to all teams at exercise start.*

## Digital Forensics

| ID | Action | Time Cost | Description |
|---|---|---|---|
| A-01 | Trace the Email | 15 min | Analyze email headers from the anonymous threat. Attempt to trace origin IP, mail server path, and sender identity. |
| A-02 | Scan Email for Embedded Payloads | 10 min | Analyze the email body and headers for embedded malware, tracking pixels, steganographic content, or encoded messages. |
| A-03 | Full Network Vulnerability Scan | 30 min | Run an enterprise-wide vulnerability scan across all VLANs. Checks for open ports, unpatched services, and misconfigurations. |
| A-04 | Review Firewall Logs (Last 7 Days) | 15 min | Pull and analyze firewall logs for anomalous inbound/outbound connections, denied traffic, and policy violations. |
| A-05 | Inspect AODB Server | 15 min | Remote into the AODB server. Check running processes, scheduled tasks, recent file changes, and service status. |
| A-06 | Audit VPN Access Logs | 10 min | Review all VPN connection logs for the last 30 days. Check for active sessions, unusual source IPs, and revoked credentials. |
| A-07 | Review SIEM Alerts (Last 30 Days) | 20 min | Pull all SIEM alerts from the last 30 days. Filter for high-severity events, anomalous login patterns, and escalation triggers. |
| A-08 | DNS Query Log Analysis | 10 min | Review internal DNS logs for suspicious domain lookups: known C2 domains, data exfiltration patterns, DGA-style queries. |

## Physical / Operational

| ID | Action | Time Cost | Description |
|---|---|---|---|
| A-09 | Physical Sweep: Terminal Interior | 20 min | Send security teams to sweep the terminal for suspicious packages, unattended items, or unauthorized individuals. |
| A-10 | Physical Sweep: Ramp & Airside | 25 min | Sweep the ramp, cargo areas, baggage makeup, and ARFF station for anything unusual. |
| A-11 | CCTV Review: Last 24 Hours (Key Areas) | 20 min | Review CCTV footage from the last 24 hours at: server room, IDF closets, electrical rooms, and Security office. |
| A-12 | PACS Audit: After-Hours Access | 10 min | Pull PACS log for all after-hours access events (9 PM to 6 AM) in the last 30 days. Flag unusual patterns. |
| A-13 | Contact TSA: Threat Advisory Check | 10 min | Call TSA and FBI to check for any specific threat advisories or intelligence related to NCIA. |
| A-14 | Interview IT Staff: Recent Contractors | 15 min | Interview current IT staff about the NexGen Solutions contractor (Dmitri Volkov) and his work on the AODB migration. |

## Response Planning

| ID | Action | Time Cost | Description |
|---|---|---|---|
| A-15 | Prepare Network Isolation Plan | 10 min | Draft a plan to isolate critical network segments (Server, Security, OT) at a moment's notice if the threat is cyber. |
| A-16 | Prepare Terminal Evacuation Plan | 15 min | Stage resources for a potential terminal evacuation if the threat is physical. Coordinate with TSA and airlines. |
| A-17 | Activate CISA Emergency Contact | 10 min | Call CISA's 24/7 operations center. Report the threat. Request emergency technical assistance. |
| A-18 | Back Up Critical Systems | 20 min | Initiate emergency snapshot backups of AODB, FIDS server, PACS database, and Domain Controller. |

## Advanced Investigation

| ID | Action | Time Cost | Description |
|---|---|---|---|
| A-19 | Search for Scheduled Tasks Across All Servers | 15 min | Query all Windows servers for scheduled tasks created in the last 60 days. Flag any task with a trigger time near 12:00. |
| A-20 | Cross-Reference Email Metadata with Employee/Contractor Records | 10 min | Analyze email header metadata (timezone, language, user-agent) and cross-reference with personnel records. |

**TOTAL TIME IF YOU DO EVERYTHING: 305 minutes. You have 180. You cannot do it all. Prioritize.**

**CUSTOM ACTIONS:** If you want to do something not on this list, describe it to the facilitator. They will assign a time cost and provide results. Creativity is rewarded, but wild guesses cost time.

*EXERCISE. FOR TRAINING USE ONLY.*

# Clue Cards: Player Handouts

**Scenario 8: "Countdown"** · North Coast International Airport (NCIA)

*Print and cut along borders. Keep face-down. Hand the corresponding card to the team when they request an action.*

## Clue Card A-01: Trace The Email

**Time cost:** 15 min · **Category:** Digital Forensics

The email was sent via ProtonMail — an end-to-end encrypted email service based in Switzerland. Email headers show it routed through ProtonMail's servers (185.70.40.x range). The sender used either Tor or a commercial VPN — no origin IP is exposed.

Tracing the sender through the email infrastructure is a dead end.

However, the email's MIME headers contain metadata: the email was composed on a system running Windows 11 with Chrome 122 as the mail client. The timezone header indicates UTC-5 (Eastern Time — the same timezone as NCIA).

The sender is technically sophisticated (knows how to use encrypted email, used a taunting tone suggesting familiarity with the airport), and is likely in the local area.

## Clue Card A-02: Scan Email For Payloads

**Time cost:** 10 min · **Category:** Digital Forensics

No malware. No attachments. No tracking pixels. No embedded links.

One technical finding: the subject line "12:00" contains invisible Unicode characters — specifically, U+200B (zero-width space) inserted between each digit: 1[ZWS]2[ZWS]:[ZWS]0[ZWS]0. This is a technique used to bypass simple keyword-matching email filters. It has no functional impact but indicates the sender understands email security filtering at a technical level.

Assessment: the sender is not a random person making a hoax threat. They have technical knowledge of email systems.

## Clue Card A-03: Full Network Vulnerability Scan

**Time cost:** 30 min · **Category:** Digital Forensics

Enterprise-wide scan completed across all VLANs.

FINDINGS:

- 3 systems with missing patches (low severity, non-exploitable from external)
- 2 open ports that should be closed (TCP 8080 on a test server, TCP 5900 on an IT workstation)
- 1 stale VPN service account profile: svc_nexgen_aodb — created 6 months ago, last authenticated 5 days ago, no disable date set

No critical vulnerabilities. No evidence of active exploitation. No external-facing services are compromised.

NOTE: The stale VPN account (svc_nexgen_aodb) is also discoverable through A-06 (VPN Audit) which costs only 10 minutes.

## Clue Card A-04: Review Firewall Logs (Last 7 Days)

**Time cost:** 15 min · **Category:** Digital Forensics

Firewall logs for the last 7 days reviewed.

No anomalous inbound connections from external sources. No port scans. No brute force attempts.

ONE notable outbound entry: 5 days ago, 02:14:08 AM — the AODB server (10.1.10.20) initiated an outbound HTTPS connection to external IP 104.248.52.117 on port 443. Duration: 4 seconds. Bytes transferred: 1,247. Single connection — not repeated.

The external IP resolves to a DigitalOcean VPS registered to a privacy-protected account. The 4-second, 1,247-byte transaction is consistent with a check-in beacon or heartbeat — a quick "I'm still here" message from a planted payload.

The connection originated from the AODB server — not from any workstation.

## Clue Card A-05: Inspect AODB Server

**Time cost:** 15 min · **Category:** Digital Forensics

Remote desktop session to AODB-SVR-01 (10.1.10.20).

Server health: Normal. All services running. CPU and memory nominal.

FINDINGS: Windows Task Scheduler contains a task named AODB_IndexMaintenance.

- Created: 4 weeks ago (exact date matches the last week of the NexGen Solutions contract)
- Created by: svc_nexgen_aodb
- Last modified: 5 days ago at 02:13 AM (matches VPN login timing)
- Trigger: ONE TIME — 12:00:00 PM TODAY
- Action: Execute PowerShell — C:\AODB\Maintenance\AODB_IndexMaintenance.ps1

The PowerShell script contains:

- Stop-Service commands for the AODB and FIDS data feed services
- AES-256 encryption routine targeting all .mdf and .ldf database files
- Deletion of the FIDS XML feed configuration
- Creates file C:\Users\Public\Desktop\README_NCIA.txt with content: "You should have hired me. — D"

THIS IS A LOGIC BOMB SET TO DETONATE AT NOON.

## Clue Card A-06: Audit VPN Access Logs

**Time cost:** 10 min · **Category:** Digital Forensics

VPN access logs for the last 30 days:

247 total VPN sessions. All from recognized accounts except ONE:

Account: svc_nexgen_aodb Connected: 5 days ago, 02:08 AM Disconnected: 5 days ago, 02:14 AM (6-minute session) Source IP: 73.189.22.104 (residential ISP, local metro area) Resources accessed: AODB-SVR-01 (10.1.10.20) via RDP

This account was created by NexGen Solutions contractor Dmitri Volkov during the AODB migration project. It was classified as a "service account" for automated maintenance tasks. During off-boarding, Volkov's personal account (d.volkov) was disabled. This service account was not disabled because it was categorized as a system account in Active Directory, not as a contractor-personal account.

svc_nexgen_aodb is currently ACTIVE in Active Directory with VPN access.

## Clue Card A-07: SIEM 30-Day Review

**Time cost:** 20 min · **Category:** Digital Forensics

1,247 alerts in 30 days. After filtering to HIGH and CRITICAL:

3 relevant events:

1. VPN authentication — svc_nexgen_aodb — 5 days ago, 02:08 AM. Classified as INFO (service account login). No alert triggered.

2. PowerShell execution on AODB-SVR-01 — 4 weeks ago, 11:52 PM. New scheduled task created via PowerShell. Classified as INFO (admin action by service account). No alert triggered.

3. Outbound connection from AODB-SVR-01 to 104.248.52.117 — 5 days ago, 02:14 AM. Classified as LOW (single HTTPS connection to unknown external IP). No alert triggered because single connections don't meet the threshold.

All three events were LOGGED but NOT ALERTED. The SIEM rules classified service account activity and single outbound connections as low-priority.

## Clue Card A-08: DNS Query Log Analysis

**Time cost:** 10 min · **Category:** Digital Forensics

DNS query logs reviewed for the last 30 days.

No suspicious domain lookups. No domain generation algorithm (DGA) patterns. No queries to known command-and-control domains. No data exfiltration patterns.

The AODB server's outbound connection to 104.248.52.117 was made via direct IP — no DNS lookup was performed. The script uses a hardcoded IP address, not a domain name.

DNS analysis is clean.

## Clue Card A-09: Physical Sweep — Terminal Interior

**Time cost:** 20 min · **Category:** Physical / Operational

Security teams swept all public and non-public areas of the terminal.

No suspicious packages. No unattended items. No unauthorized individuals identified. All doors secured. All access points normal. TSA checkpoint operating normally with no concerns.

The terminal is clean. The threat does not appear to be physical.

## Clue Card A-10: Physical Sweep — Ramp & Airside

**Time cost:** 25 min · **Category:** Physical / Operational

Ramp, cargo, baggage makeup, and ARFF station swept.

Nothing found. All areas normal. No unauthorized vehicles. No suspicious cargo. ARFF station secured. Fuel farm normal.

The airside is clean.

## Clue Card A-11: CCTV Review — Key Areas (24 Hours)

**Time cost:** 20 min · **Category:** Physical / Operational

CCTV review of server room, IDF closets, and electrical rooms for the last 24 hours:

No unauthorized physical access in the last 24 hours. All entries are recognized IT staff.

EXTENDED REVIEW: Footage from 27 days ago was also reviewed. At 11:47 PM, Dmitri Volkov (NexGen Solutions contractor) is seen badging into the server room using his still-active credential. He spends 22 minutes inside. He is carrying a laptop. His badge was deactivated 2 days after this access.

This is consistent with the timeframe when the scheduled task on the AODB server was created.

## Clue Card A-12: PACS After-Hours Audit

**Time cost:** 10 min · **Category:** Physical / Operational

After-hours access events (9 PM - 6 AM) for the last 30 days: 22 events total.

20 events are Security and IT staff with legitimate after-hours work.

1 flagged event: d.volkov — Server Room access at 11:47 PM, 27 days ago. Badge deactivated 2 days later during off-boarding.

1 unflagged event: j.kelley (IT Manager) — Server Room at 10:30 PM, 14 days ago. Legitimate after-hours maintenance (confirmed by change log).

Dmitri Volkov had after-hours physical access to the server room during his last week on contract.

## Clue Card A-13: Contact TSA/FBI — Threat Advisory Check

**Time cost:** 10 min · **Category:** Physical / Operational

TSA: No specific threat advisories for NCIA. Threat level remains ELEVATED (Bravo). No credible intelligence about planned attacks on airports in the region.

FBI: No active investigations related to NCIA. No specific threats in their system. They recommend: report the email to IC3 and continue your internal investigation. If you develop a suspect, they'll open a case.

No actionable external intelligence.

## Clue Card A-14: Interview IT Staff — Recent Contractors

**Time cost:** 15 min · **Category:** Physical / Operational

IT staff report on Dmitri Volkov (NexGen Solutions contractor):

"Dmitri was here for 6 months doing the AODB migration. Really good at his job. Quiet guy. He created the svc_nexgen_aodb service account for the automated maintenance scripts that run nightly on the AODB server. He had full admin access — domain admin equivalent on the AODB server specifically.

Here's the thing nobody talks about: the Ops Director told Dmitri — informally, verbally — that there would be a full-time IT position for him when the project ended. Dmitri was counting on it. He even started apartment hunting. Then HR posted the position externally because policy requires it. Dmitri applied but... they hired someone else. An internal candidate.

His last two weeks he was still professional, still did good work. But he was definitely hurt. He didn't say anything angry — that's what was weird. He just got quiet."

## Clue Card A-15: Prepare Network Isolation Plan

**Time cost:** 10 min · **Category:** Response Planning

Team has drafted a rapid network isolation plan:

- Server VLAN 10 can be isolated from all other VLANs within 2 minutes by applying a pre-staged firewall rule.
- AODB server can be individually isolated by disabling its switch port.
- Plan is documented and ready to execute on command.

This does not find the threat, but it prepares you to contain a network-based attack quickly.

## Clue Card A-16: Prepare Terminal Evacuation Plan

**Time cost:** 15 min · **Category:** Response Planning

Terminal evacuation resources staged:

- TSA notified of possible evacuation scenario
- Airline ops alerted to hold boarding on request
- PA announcement scripts drafted
- Re-screening plan prepared (estimated 2.5 hours for full terminal)

Evacuation resources are ready if needed, but all current evidence points to a digital threat, not a physical one.

## Clue Card A-17: Activate CISA Emergency Contact

**Time cost:** 10 min · **Category:** Response Planning

CISA 24/7 Operations Center contacted. Report filed.

CISA response: "We've logged your report. We can have a remote incident response team available within 2 hours. In the meantime, our immediate recommendations:

1. Check all critical servers for scheduled tasks with imminent trigger times.

2. Audit service accounts — especially any created by contractors or third parties.

3. Look for persistence mechanisms: scheduled tasks, registry run keys, WMI subscriptions.

4. If you find a payload, preserve it for forensic analysis before deleting."

CISA won't arrive before noon, but their recommendations are actionable now.

## Clue Card A-18: Back Up Critical Systems

**Time cost:** 20 min · **Category:** Response Planning

Emergency snapshot backups initiated:

- AODB server: backup complete. Snapshot stored on isolated backup NAS.
- FIDS server: backup complete.
- PACS database: backup complete.
- Domain Controller: backup complete.

If the noon event damages any of these systems, recovery from this fresh backup will take approximately 1-2 hours instead of 4-6 hours from the last nightly backup.

This doesn't stop the threat, but it limits the damage.

## Clue Card A-19: Search Scheduled Tasks — All Servers

**Time cost:** 15 min · **Category:** Advanced Investigation

PowerShell query executed across all Windows servers: Get-ScheduledTask | Where-Object {$_.Date -gt (Get-Date).AddDays(-60)}

Results across 8 servers:

- DC-01: 2 tasks (Windows Update, backup) — legitimate
- FIDS-SVR: 1 task (data feed refresh) — legitimate
- PACS-SVR: 1 task (database maintenance) — legitimate
- AODB-SVR-01: 3 tasks. Two legitimate (nightly backup, index optimization). ONE ANOMALOUS: AODB_IndexMaintenance — Created 4 weeks ago by svc_nexgen_aodb. Trigger: 12:00:00 PM TODAY. Action: PowerShell script.
- All other servers: clean

The attack is targeted at the AODB server only. No other servers are affected.

## Clue Card A-20: Cross-Reference Email Metadata

**Time cost:** 10 min · **Category:** Advanced Investigation

Email metadata from A-01 (if taken): Windows 11, Chrome 122, UTC-5 timezone.

Cross-referencing with personnel and contractor records:

- 127 NCIA employees use Windows 11 (too common to narrow)
- Contractor IT asset records: Dmitri Volkov's NCIA-issued laptop was a Dell Latitude running Windows 11. Browser history log (captured before device return) shows Chrome 122 as default browser.
- Volkov's home address is in the NCIA metro area (consistent with UTC-5).

Not conclusive on its own — millions use this configuration. But it's consistent with the Volkov hypothesis if you already have one.

*EXERCISE — FOR TRAINING USE ONLY*
