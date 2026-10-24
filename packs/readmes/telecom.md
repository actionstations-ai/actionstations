# Telecommunications

Domain pack for regional communications service providers: local exchange carriers and telephone cooperatives, regional mobile network operators, cable operators, fiber and fixed-wireless ISPs, interconnected VoIP providers and covered 911 service providers (selective routers, ALI, ESInet / NGCS).

Facts below were checked on 2026-10-24 against eCFR (point-in-time 2026-10-01) for the research dossier (`docs/research/domains/telecom.md` in the Action Stations repository). Regulations change; re-check a deadline before an exercise depends on it.

## Plans the exercise should draw on

- **Network outage reporting procedures** (47 CFR Part 4: 4.5, 4.7, 4.9, 4.11): reportability thresholds, who determines discovery, the Notification → Initial → Final workflow, officer attestation of the Final report.
- **911 special facility (PSAP) outage notification procedures and contact list** (47 CFR 4.9(h)), and the same structure for the 988 Lifeline (4.9(i)).
- **911 reliability certification** for covered 911 service providers (47 CFR 9.19, 9.20): circuit diversity, 24-hour backup power for offices that directly serve a PSAP and 72 hours for selective-router offices, diverse network monitoring.
- **DIRS reporting procedures** (47 CFR 4.18) and the **Mandatory Disaster Response Initiative** for wireless providers (47 CFR 4.17).
- **CPNI protection program and breach response plan** (47 U.S.C. 222; 47 CFR 64.2009–64.2011), with the annual officer compliance certificate filed by March 1.
- **CALEA System Security and Integrity plan** (47 CFR 1.20003–1.20005).
- **Emergency operations / business continuity plan** and **TSP restoration priority procedures**.

## Reporting deadlines

- **FCC NORS (47 CFR 4.9)**: an outage of at least 30 minutes that potentially affects at least 900,000 user minutes (or the other thresholds in 4.9) needs a Notification within 120 minutes of discovery, an Initial report within 72 hours and a Final report within 30 days. Interconnected VoIP: Notification within 240 minutes when a 911 or 988 special facility is affected, within 24 hours otherwise, and a Final report within 30 days.
- **PSAP notification (47 CFR 4.9(h))**: as soon as possible and no later than 30 minutes after discovery, by telephone and in writing; the first follow-up no later than two hours after the initial contact, then as material information becomes available.
- **DIRS (47 CFR 4.18)**: daily status reports from activation until deactivation, even when unchanged. The DIRS final report was eliminated by FCC 26-34 (2026).
- **CPNI breach (47 CFR 64.2011, in-force text)**: notify the USSS and FBI through the central reporting facility no later than 7 business days after a reasonable determination of the breach; customers and the public wait 7 full business days after that notice unless there is an extraordinarily urgent need. The pending FCC 23-111 amendment (FCC notice, PII, customer notice within 30 days) was delayed indefinitely as of 2026-10-01; state which version the exercise assumes.
- **Lawful-intercept compromise (47 CFR 1.20003(c))**: report to the affected law-enforcement agencies within a reasonable time upon discovery.
- **SEC Form 8-K Item 1.05**: four business days after the materiality determination, for a public company.
- **CIRCIA**: 72 hours for a covered cyber incident and 24 hours after a ransom payment once final; the final rule was not published as of 2026-10-24.

## Copyrighted references (named, not bundled)

- ATIS, 3GPP and ETSI standards (for example ETSI TS 103 994), as linked from CISA advisory AA25-239A: https://www.cisa.gov/news-events/cybersecurity-advisories/aa25-239a
- ISO 22301 business continuity management, ISO
- Lumen Black Lotus Labs report on a 2024 rural ISP router-bricking event (vendor publication)
